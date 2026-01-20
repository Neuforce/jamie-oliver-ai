"""
FastAPI application for Recipe Search API.

Expone endpoints REST para búsqueda semántica de recetas.
"""

import os
import time
import json
import logging
import asyncio
from typing import List, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from supabase import create_client

from recipe_search_agent.search import RecipeSearchAgent, SearchFilters, RecipeMatch

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Helpers para subir de forma segura en entornos como Railway
def _safe_parent(path: Path, levels: int) -> Path:
    current = path
    for _ in range(levels):
        if current.parent == current:
            break
        current = current.parent
    return current


current_file = Path(__file__).resolve()

# Load variables from apps/backend-search/.env (two levels up from this file)
service_root = _safe_parent(current_file, 2)
load_dotenv(service_root / ".env")


def _find_monorepo_root(start: Path) -> Path:
    """
    Intentar ubicar la raíz del monorepo (donde viven apps/ y data/).
    En Railway solo se despliega apps/backend-search, así que debemos
    tener un fallback si no encontramos los directorios esperados.
    """
    current = start
    for _ in range(5):
        if (current / "apps").exists() and (current / "data").exists():
            return current
        if current.parent == current:
            break
        current = current.parent
    # Fallback: usar la raíz del servicio para que al menos no explote
    return _safe_parent(start, 1)


# project_root para recetas: raíz del monorepo (jamie-oliver-ai/) o fallback
project_root = _find_monorepo_root(current_file)

# Crear app FastAPI
app = FastAPI(
    title="Recipe Search API",
    description="API de búsqueda semántica para recetas de Jamie Oliver",
    version="1.0.0",
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar dominios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cliente de Supabase (singleton)
_supabase_client = None
_search_agent = None


def get_search_agent() -> RecipeSearchAgent:
    """Obtener instancia singleton del agente de búsqueda."""
    global _supabase_client, _search_agent

    if _search_agent is None:
        # Crear cliente de Supabase
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not supabase_url or not supabase_key:
            raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment")

        _supabase_client = create_client(supabase_url, supabase_key)
        _search_agent = RecipeSearchAgent(
            supabase_client=_supabase_client,
            embedding_model="BAAI/bge-small-en-v1.5",
            project_root=project_root,
        )
        logger.info("Search agent initialized")

    return _search_agent


# Modelos Pydantic para request/response
class SearchRequest(BaseModel):
    """Request para búsqueda de recetas."""

    query: str = Field(..., description="Query en lenguaje natural", example="quick vegetarian pasta")
    category: Optional[str] = Field(None, description="Filtro por categoría", example="dinner")
    mood: Optional[str] = Field(None, description="Filtro por mood", example="comfort")
    complexity: Optional[str] = Field(None, description="Filtro por dificultad", example="easy")
    cost: Optional[str] = Field(None, description="Filtro por costo", example="budget")
    ingredients_query: Optional[str] = Field(None, description="Búsqueda en ingredientes", example="tomato basil")
    top_k: int = Field(10, ge=1, le=50, description="Número de resultados a retornar")
    similarity_threshold: float = Field(0.3, ge=0.0, le=1.0, description="Umbral mínimo de similitud (0.0-1.0). Solo retorna resultados con score >= threshold")
    include_full_recipe: bool = Field(False, description="Incluir JSON completo de la receta")
    include_chunks: bool = Field(True, description="Incluir chunks relevantes")


class RecipeMatchResponse(BaseModel):
    """Respuesta para un match de receta."""

    recipe_id: str
    title: str
    similarity_score: float
    combined_score: float
    category: Optional[str]
    mood: Optional[str]
    complexity: Optional[str]
    cost: Optional[str]
    file_path: str
    match_explanation: str
    matching_chunks: List[dict]
    full_recipe: Optional[dict] = None


class SearchResponse(BaseModel):
    """Respuesta de búsqueda."""

    query: str
    filters_applied: dict
    results: List[RecipeMatchResponse]
    total: int
    took_ms: float


# Chat Agent Models
class ChatRequest(BaseModel):
    """Request for chat endpoint."""

    message: str = Field(..., description="User message to send to Jamie", example="I'm feeling tired, what should I cook?")
    session_id: str = Field(..., description="Session ID for conversation continuity", example="user-123-abc")


class ChatResponse(BaseModel):
    """Non-streaming chat response."""

    response: str
    tool_calls: List[dict]
    session_id: str


# Chat Agent singleton
_chat_agent = None


def get_chat_agent():
    """Get or create the chat agent singleton."""
    global _chat_agent

    if _chat_agent is None:
        # Verify ccai is installed before importing
        try:
            import ccai
        except ImportError:
            logger.error("ccai package is not installed. Please run: pip install -e ../../packages/ccai")
            raise HTTPException(
                status_code=500,
                detail="Chat agent requires ccai package. Please install it: pip install -e ../../packages/ccai"
            )

        # Import here to avoid circular imports
        from recipe_search_agent.chat_agent import DiscoveryChatAgent

        search_agent = get_search_agent()
        _chat_agent = DiscoveryChatAgent(search_agent=search_agent)
        logger.info("Chat agent initialized")

    return _chat_agent


# Endpoints

@app.get("/")
async def root():
    """Health check."""
    return {
        "name": "Recipe Search API",
        "version": "1.0.0",
        "status": "healthy"
    }


@app.get("/health")
async def health():
    """Health check detallado."""
    try:
        agent = get_search_agent()
        return {
            "status": "healthy",
            "supabase": "connected",
            "embedding_model": agent.embedding_model,
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@app.post("/api/v1/recipes/search", response_model=SearchResponse)
async def search_recipes(request: SearchRequest):
    """
    Búsqueda semántica de recetas.

    Combina:
    - Vector similarity (embeddings semánticos)
    - Filtros exactos (category, mood, complexity, cost)
    - Full-text search en ingredientes

    Ejemplo:
    ```json
    {
        "query": "quick vegetarian pasta under 30 minutes",
        "complexity": "easy",
        "top_k": 5
    }
    ```
    """
    try:
        start_time = time.time()

        # Crear filtros
        filters = SearchFilters(
            category=request.category,
            mood=request.mood,
            complexity=request.complexity,
            cost=request.cost,
            ingredients_query=request.ingredients_query,
        )

        # Buscar
        agent = get_search_agent()
        results = agent.search(
            query=request.query,
            filters=filters,
            top_k=request.top_k,
            include_full_recipe=request.include_full_recipe,
            include_chunks=request.include_chunks,
            similarity_threshold=request.similarity_threshold,
        )

        elapsed_ms = (time.time() - start_time) * 1000

        # Convertir a response models
        response_results = [
            RecipeMatchResponse(**match.to_dict())
            for match in results
        ]

        return SearchResponse(
            query=request.query,
            filters_applied={
                "category": request.category,
                "mood": request.mood,
                "complexity": request.complexity,
                "cost": request.cost,
                "ingredients_query": request.ingredients_query,
            },
            results=response_results,
            total=len(response_results),
            took_ms=round(elapsed_ms, 2),
        )

    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/api/v1/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, include_chunks: bool = Query(False)):
    """
    Obtener receta completa por ID (slug).

    Args:
        recipe_id: Slug de la receta (ej: "christmas-salad-jamie-oliver-recipes")
        include_chunks: Si True, incluye todos los chunks de la receta
    """
    try:
        agent = get_search_agent()

        # First try the new `recipes` table (source of truth)
        recipes_response = agent.client.table("recipes").select("*").eq("slug", recipe_id).execute()

        if recipes_response.data:
            recipe_row = recipes_response.data[0]
            result = {
                "recipe_id": recipe_row["slug"],
                "title": recipe_row.get("metadata", {}).get("title", recipe_row["slug"]),
                "category": recipe_row.get("metadata", {}).get("categories", [None])[0] if recipe_row.get("metadata", {}).get("categories") else None,
                "mood": recipe_row.get("metadata", {}).get("moods", [None])[0] if recipe_row.get("metadata", {}).get("moods") else None,
                "complexity": recipe_row.get("metadata", {}).get("difficulty"),
                "cost": None,
                "quality_score": recipe_row.get("quality_score"),
                "status": recipe_row.get("status"),
                "full_recipe": recipe_row.get("recipe_json"),
            }
        else:
            # Fallback to recipe_index for backward compatibility
            response = agent.client.table("recipe_index").select("*").eq("id", recipe_id).execute()

            if not response.data:
                raise HTTPException(status_code=404, detail=f"Recipe not found: {recipe_id}")

            recipe_data = response.data[0]
            full_recipe = agent._load_recipe_json(recipe_data["file_path"])

            result = {
                "recipe_id": recipe_id,
                "title": recipe_data["title"],
                "category": recipe_data.get("category"),
                "mood": recipe_data.get("mood"),
                "complexity": recipe_data.get("complexity"),
                "cost": recipe_data.get("cost"),
                "file_path": recipe_data["file_path"],
                "full_recipe": full_recipe,
            }

        # Incluir chunks si se solicita
        if include_chunks:
            chunks_response = agent.client.table("intelligent_recipe_chunks") \
                .select("*") \
                .eq("recipe_id", recipe_id) \
                .execute()
            result["chunks"] = chunks_response.data

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get recipe {recipe_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get recipe: {str(e)}")


@app.get("/api/v1/recipes")
async def list_recipes(
    category: Optional[str] = None,
    mood: Optional[str] = None,
    complexity: Optional[str] = None,
    status: Optional[str] = Query(None, description="Filter by status: draft, published, archived"),
    include_full: bool = Query(False, description="Include full recipe JSON in response"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """
    Listar recetas con filtros opcionales.

    Fetches from the `recipes` table (source of truth) with fallback to `recipe_index`.

    Args:
        category: Filtro por categoría
        mood: Filtro por mood
        complexity: Filtro por complejidad
        status: Filter by recipe status (draft, published, archived)
        include_full: Include full recipe_json in response (default: False for performance)
        limit: Número de resultados (max 100)
        offset: Offset para paginación
    """
    try:
        agent = get_search_agent()

        # Try the new `recipes` table first
        select_fields = "slug, metadata, quality_score, status, created_at, updated_at"
        if include_full:
            select_fields += ", recipe_json"

        query = agent.client.table("recipes").select(select_fields)

        # Apply status filter - default to published OR draft (not archived)
        if status:
            query = query.eq("status", status)
        else:
            # Include both published and draft by default
            query = query.in_("status", ["published", "draft"])

        query = query.order("updated_at", desc=True).range(offset, offset + limit - 1)
        response = query.execute()

        if response.data:
            # Transform to consistent response format
            recipes = []
            for row in response.data:
                metadata = row.get("metadata", {})
                recipe_item = {
                    "recipe_id": row["slug"],
                    "title": metadata.get("title", row["slug"]),
                    "description": metadata.get("description"),
                    "category": metadata.get("categories", [None])[0] if metadata.get("categories") else None,
                    "mood": metadata.get("moods", [None])[0] if metadata.get("moods") else None,
                    "complexity": metadata.get("difficulty"),
                    "servings": metadata.get("servings"),
                    "step_count": metadata.get("step_count"),
                    "has_timers": metadata.get("has_timers"),
                    "image_url": metadata.get("image_url"),
                    "quality_score": row.get("quality_score"),
                    "status": row.get("status"),
                }
                if include_full:
                    recipe_item["full_recipe"] = row.get("recipe_json")
                recipes.append(recipe_item)

            return {
                "recipes": recipes,
                "total": len(recipes),
                "limit": limit,
                "offset": offset,
                "source": "recipes_table",
            }

        # Fallback to recipe_index for backward compatibility
        query = agent.client.table("recipe_index").select("*")

        if category:
            query = query.eq("category", category)
        if mood:
            query = query.eq("mood", mood)
        if complexity:
            query = query.eq("complexity", complexity)

        query = query.range(offset, offset + limit - 1)
        response = query.execute()

        return {
            "recipes": response.data,
            "total": len(response.data),
            "limit": limit,
            "offset": offset,
            "source": "recipe_index_fallback",
        }

    except Exception as e:
        logger.error(f"Failed to list recipes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list recipes: {str(e)}")


# =============================================================================
# CHAT AGENT ENDPOINTS
# =============================================================================

@app.post("/api/v1/chat")
async def chat(request: ChatRequest):
    """
    Conversational chat with Jamie Oliver discovery agent.

    Streams responses via Server-Sent Events (SSE).

    Event types:
    - text_chunk: Partial text from Jamie's response
    - tool_call: When the agent calls a tool (search, etc.)
    - done: Response complete
    - error: An error occurred

    Example:
    ```json
    {
        "message": "I've had a long day and need something easy",
        "session_id": "user-123"
    }
    ```
    """
    try:
        chat_agent = get_chat_agent()

        async def event_generator():
            """Generate SSE events from chat agent."""
            try:
                async for event in chat_agent.chat(request.message, request.session_id):
                    # Format as SSE
                    data = {
                        "type": event.type,
                        "content": event.content,
                    }
                    if event.metadata:
                        data["metadata"] = event.metadata

                    yield f"data: {json.dumps(data)}\n\n"

                    # Small delay to prevent overwhelming the client
                    await asyncio.sleep(0.01)

            except Exception as e:
                logger.error(f"Error in chat stream: {e}", exc_info=True)
                error_data = {"type": "error", "content": str(e)}
                yield f"data: {json.dumps(error_data)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            }
        )

    except Exception as e:
        logger.error(f"Chat failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.post("/api/v1/chat/sync")
async def chat_sync(request: ChatRequest) -> ChatResponse:
    """
    Non-streaming chat endpoint for simpler integrations.

    Returns the complete response instead of streaming.
    """
    try:
        chat_agent = get_chat_agent()
        result = await chat_agent.chat_sync(request.message, request.session_id)

        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])

        return ChatResponse(
            response=result["response"],
            tool_calls=result["tool_calls"],
            session_id=request.session_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat sync failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.delete("/api/v1/chat/{session_id}")
async def clear_chat_session(session_id: str):
    """
    Clear a chat session's memory.

    Use this when the user wants to start a fresh conversation.
    """
    try:
        chat_agent = get_chat_agent()
        cleared = chat_agent.clear_session(session_id)

        return {
            "session_id": session_id,
            "cleared": cleared,
            "message": "Session cleared" if cleared else "Session not found"
        }

    except Exception as e:
        logger.error(f"Failed to clear session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to clear session: {str(e)}")


@app.get("/api/v1/chat/{session_id}")
async def get_chat_session(session_id: str):
    """
    Get information about a chat session.
    """
    try:
        chat_agent = get_chat_agent()
        info = chat_agent.get_session_info(session_id)

        if not info:
            raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

        return info

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get session info: {str(e)}")


# =============================================================================
# VOICE CHAT WEBSOCKET ENDPOINT
# =============================================================================

@app.websocket("/ws/chat-voice")
async def voice_chat_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for voice-based chat with Jamie Oliver discovery agent.

    Enables real-time voice conversations:
    - Receives audio input from browser microphone
    - Transcribes speech using Deepgram STT
    - Processes through the discovery chat agent
    - Synthesizes responses with ElevenLabs TTS
    - Streams audio and text back to client

    Protocol:
    - Client sends: {"event": "start", "sessionId": "...", "sampleRate": 16000}
    - Client sends: {"event": "audio", "data": "base64_pcm_data"}
    - Client sends: {"event": "stop"}
    - Client sends: {"event": "interrupt"} (to stop Jamie while speaking)

    - Server sends: {"event": "session_info", "data": {...}}
    - Server sends: {"event": "listening"}
    - Server sends: {"event": "transcript_interim", "data": "partial text..."}
    - Server sends: {"event": "transcript_final", "data": "final text"}
    - Server sends: {"event": "processing"}
    - Server sends: {"event": "text_chunk", "data": "response chunk..."}
    - Server sends: {"event": "audio", "data": "base64_pcm_data"}
    - Server sends: {"event": "recipes", "data": {...}}
    - Server sends: {"event": "meal_plan", "data": {...}}
    - Server sends: {"event": "recipe_detail", "data": {...}}
    - Server sends: {"event": "shopping_list", "data": {...}}
    - Server sends: {"event": "done"}
    - Server sends: {"event": "error", "data": "error message"}

    Requires environment variables:
    - DEEPGRAM_API_KEY: For speech-to-text
    - ELEVENLABS_API_KEY: For text-to-speech
    - ELEVENLABS_VOICE_ID: Voice ID for Jamie
    """
    try:
        from recipe_search_agent.voice_handler import handle_voice_chat

        chat_agent = get_chat_agent()
        await handle_voice_chat(websocket, chat_agent)

    except WebSocketDisconnect:
        logger.info("Voice chat WebSocket disconnected")
    except Exception as e:
        logger.error(f"Error in voice chat WebSocket: {e}", exc_info=True)
        try:
            if websocket.client_state.CONNECTED:
                await websocket.close(code=1011, reason=str(e))
        except:
            pass


# =============================================================================


if __name__ == "__main__":
    import uvicorn

    # Ejecutar servidor
    uvicorn.run(
        "recipe_search_agent.api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )


@app.post("/api/v1/recipes/publish-all")
async def publish_all_recipes():
    """
    Publish all draft recipes.
    This is an admin endpoint to bulk-publish enhanced recipes.
    """
    try:
        agent = get_search_agent()

        # Get all draft recipes
        drafts = agent.client.table("recipes") \
            .select("slug, quality_score") \
            .eq("status", "draft") \
            .execute()

        if not drafts.data:
            return {"message": "No draft recipes found", "published": 0}

        # Publish ALL drafts (they're all enhanced and good quality)
        published_recipes = [r["slug"] for r in drafts.data]

        agent.client.table("recipes") \
            .update({
                "status": "published",
                "published_at": "now()"
            }) \
            .eq("status", "draft") \
            .execute()

        return {
            "message": f"Published {len(published_recipes)} recipes",
            "published": len(published_recipes),
            "recipes": published_recipes
        }

    except Exception as e:
        logger.error(f"Failed to publish recipes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

