"""
FastAPI application for Recipe Search API.

Expone endpoints REST para búsqueda semántica de recetas.
"""

import os
import time
import logging
from typing import List, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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
        
        # Apply status filter
        if status:
            query = query.eq("status", status)
        
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

