"""
FastAPI application for Recipe Search API.

Exposes REST endpoints for semantic recipe search.
"""

import os
import time
import json
import logging
import asyncio
import uuid
from typing import List, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Header, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

# Disable Langfuse tracing when not configured (avoids per-request auth warnings + latency).
if os.getenv("LANGFUSE_DISABLED", "").lower() in ("1", "true", "yes"):
    os.environ["LANGFUSE_TRACING_ENABLED"] = "false"
    os.environ.pop("LANGFUSE_PUBLIC_KEY", None)
    os.environ.pop("LANGFUSE_SECRET_KEY", None)

from supabase import create_client

from recipe_search_agent.search import RecipeSearchAgent, SearchFilters, RecipeMatch
from recipe_search_agent.identity_service import IdentityService
from recipe_search_agent.access_service import AccessService
from recipe_search_agent.purchase_sync_service import PurchaseSyncService
from recipe_search_agent.webhook_service import WebhookService
from recipe_search_agent.spend_mandate_service import SpendMandateService
from recipe_search_agent.spend_mandate_serialization import serialize_spend_mandate
from recipe_search_agent.supertab_merchant import SupertabMerchantClient
from recipe_search_agent.supertab_token_verifier import SupertabTokenVerifier
from recipe_search_agent.commerce_capability import (
    build_commerce_capability_manifest,
    build_purchase_intent_payload,
)
from recipe_search_agent.guardrails import evaluate_message_sync

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _log_voice_latency(stage: str, started_at: float, **extra) -> None:
    payload = {
        "stage": stage,
        "total_ms": round((time.perf_counter() - started_at) * 1000, 1),
        **extra,
    }
    logger.info("[voice_latency] %s", payload)

# Helpers to walk up paths safely in environments like Railway
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
    Locate the monorepo root (where apps/ and data/ live).
    On Railway only apps/backend-search is deployed, so we need a fallback
    when the expected directories are missing.
    """
    current = start
    for _ in range(5):
        if (current / "apps").exists() and (current / "data").exists():
            return current
        if current.parent == current:
            break
        current = current.parent
    # Fallback: service root so startup does not fail
    return _safe_parent(start, 1)


# project_root for recipes: monorepo root (jamie-oliver-ai/) or fallback
project_root = _find_monorepo_root(current_file)

# FastAPI app
app = FastAPI(
    title="Recipe Search API",
    description="Semantic search API for Jamie Oliver recipes",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client (singleton)
_supabase_client = None
_search_agent = None


def get_search_agent() -> RecipeSearchAgent:
    """Get or create the search agent singleton."""
    global _supabase_client, _search_agent

    if _search_agent is None:
        init_started_at = time.perf_counter()
        # Create Supabase client
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
        _log_voice_latency("search_agent_initialized", init_started_at)

    return _search_agent


# Pydantic request/response models
class SearchRequest(BaseModel):
    """Recipe search request."""

    query: str = Field(..., description="Natural-language query", example="quick vegetarian pasta")
    category: Optional[str] = Field(None, description="Category filter", example="dinner")
    mood: Optional[str] = Field(None, description="Mood filter", example="comfort")
    complexity: Optional[str] = Field(None, description="Complexity filter", example="easy")
    cost: Optional[str] = Field(None, description="Cost filter", example="budget")
    ingredients_query: Optional[str] = Field(None, description="Ingredient full-text search", example="tomato basil")
    top_k: int = Field(10, ge=1, le=50, description="Number of results to return")
    similarity_threshold: float = Field(0.3, ge=0.0, le=1.0, description="Minimum similarity (0.0-1.0). Only returns results with score >= threshold")
    include_full_recipe: bool = Field(False, description="Include full recipe JSON")
    include_chunks: bool = Field(True, description="Include relevant chunks")


class RecipeMatchResponse(BaseModel):
    """Single recipe match response."""

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
    """Search response."""

    query: str
    filters_applied: dict
    results: List[RecipeMatchResponse]
    total: int
    took_ms: float
    guardrail_blocked: bool = Field(False, description="True when semantic search was skipped by guardrails")
    guardrail_category: Optional[str] = Field(None, description="Guardrail category when blocked")


# Chat Agent Models
class ChatRequest(BaseModel):
    """Request for chat endpoint."""

    message: str = Field(..., description="User message to send to Jamie", example="I'm feeling tired, what should I cook?")
    session_id: str = Field(..., description="Session ID for conversation continuity", example="user-123-abc")
    user_id: Optional[str] = Field(
        None,
        description="Jamie internal user ID when known (binds server-side consent asks)",
    )
    focused_recipe_backend_id: Optional[str] = Field(
        None,
        description="When the recipe sheet is open, backend slug for agent tool context",
    )


class ChatResponse(BaseModel):
    """Non-streaming chat response."""

    response: str
    tool_calls: List[dict]
    session_id: str


# Chat Agent singleton
_chat_agent = None
_identity_service = None
_access_service = None
_purchase_sync_service = None
_webhook_service = None
_spend_mandate_service = None
_spend_mandate_ask_service = None
_supertab_merchant_client = None


def get_chat_agent():
    """Get or create the chat agent singleton."""
    global _chat_agent

    if _chat_agent is None:
        init_started_at = time.perf_counter()
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
        _log_voice_latency("chat_agent_initialized", init_started_at)

    return _chat_agent


@app.on_event("startup")
async def warm_discovery_voice_dependencies() -> None:
    warm_started_at = time.perf_counter()
    try:
        get_search_agent()
        get_chat_agent()
        _log_voice_latency("discovery_voice_warmup_complete", warm_started_at)
    except Exception as exc:
        logger.warning("Discovery voice warmup skipped: %s", exc)


def get_identity_service() -> IdentityService:
    """Get or create the identity service singleton."""
    global _identity_service
    if _identity_service is None:
        _identity_service = IdentityService()
    return _identity_service


def get_access_service() -> AccessService:
    """Get or create the access service singleton."""
    global _access_service
    if _access_service is None:
        _access_service = AccessService()
    return _access_service


def get_purchase_sync_service() -> PurchaseSyncService:
    """Get or create the purchase sync service singleton."""
    global _purchase_sync_service
    if _purchase_sync_service is None:
        _purchase_sync_service = PurchaseSyncService()
    return _purchase_sync_service


def get_webhook_service() -> WebhookService:
    """Get or create the webhook service singleton."""
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService()
    return _webhook_service


def get_spend_mandate_service() -> SpendMandateService:
    """Get or create the spend mandate service singleton."""
    global _spend_mandate_service
    if _spend_mandate_service is None:
        _spend_mandate_service = SpendMandateService()
    return _spend_mandate_service


def get_spend_mandate_ask_service() -> "SpendMandateAskService":
    """Get or create the spend mandate ask service singleton."""
    global _spend_mandate_ask_service
    if _spend_mandate_ask_service is None:
        from recipe_search_agent.spend_mandate_ask_service import SpendMandateAskService

        _spend_mandate_ask_service = SpendMandateAskService()
    return _spend_mandate_ask_service


def get_supertab_merchant_client() -> SupertabMerchantClient:
    """Get or create the Supertab Merchant API client singleton."""
    global _supertab_merchant_client
    if _supertab_merchant_client is None:
        _supertab_merchant_client = SupertabMerchantClient()
    return _supertab_merchant_client


class SupertabBootstrapRequest(BaseModel):
    provider: str = Field(..., description="External identity provider", example="supertab")
    external_subject_id: str = Field(..., description="External provider subject ID")
    profile: dict = Field(default_factory=dict, description="Raw profile data from Supertab")


class UserSummaryResponse(BaseModel):
    id: str
    email: Optional[str] = None
    display_name: Optional[str] = None


class RecipeAccessResponse(BaseModel):
    recipeId: str
    recipeUuid: str
    accessState: str
    offering: Optional[dict] = None
    entitlement: Optional[dict] = None
    activeSession: Optional[dict] = None


class SupertabPurchaseSyncRequest(BaseModel):
    user_id: str
    recipe_id: str
    purchase: Optional[dict] = None
    prior_entitlement: list[dict] = Field(default_factory=list)


class SpendMandateCreateRequest(BaseModel):
    user_id: str
    ceiling_amount: int = Field(..., description="Spending ceiling in minor units (cents)")
    currency_code: str = "USD"
    session_id: Optional[str] = None
    source: str = "voice"
    expires_at: Optional[str] = None


class SpendMandateResponse(BaseModel):
    id: str
    userId: str
    sessionId: Optional[str] = None
    ceilingAmount: int
    currencyCode: str
    consumedAmount: int
    status: str
    source: str
    grantedAt: Optional[str] = None
    expiresAt: Optional[str] = None
    remainingAmount: int


class SpendMandateAskResponse(BaseModel):
    id: str
    userId: Optional[str] = None
    sessionId: Optional[str] = None
    backendRecipeId: str
    priceAmount: int
    currencyCode: str
    ceilingAmount: int
    status: str
    mandateId: Optional[str] = None
    toolCallId: Optional[str] = None
    responseId: Optional[str] = None
    requestedAt: Optional[str] = None
    resolvedAt: Optional[str] = None
    expiresAt: Optional[str] = None


class SpendMandateAskResolveRequest(BaseModel):
    decision: str = Field(..., description="grant or decline")
    user_id: Optional[str] = Field(None, description="Jamie user ID required for grant")
    source: str = "agentic"
    sessionId: Optional[str] = None
    ceilingAmount: int
    currencyCode: str
    consumedAmount: int
    status: str
    source: str
    grantedAt: Optional[str] = None
    expiresAt: Optional[str] = None
    remainingAmount: int


class OnetimeOfferingRequest(BaseModel):
    content_key: str
    price_amount: int
    currency_code: str = "USD"
    description: str
    recipe_slug: Optional[str] = None
    user_id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class OwnedRecipeSummaryResponse(BaseModel):
    recipeId: str
    recipeUuid: str
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    imageUrl: Optional[str] = None
    purchaseStatus: Optional[str] = None
    ownedAt: Optional[str] = None
    expiresAt: Optional[str] = None
    lastCookedAt: Optional[str] = None
    activeSession: Optional[dict] = None


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


@app.post("/api/v1/auth/supertab/bootstrap")
async def bootstrap_supertab_identity(request: SupertabBootstrapRequest):
    """Create or retrieve a Jamie user from Supertab-linked identity data."""
    if request.provider.strip().lower() != "supertab":
        raise HTTPException(status_code=400, detail="Only supertab provider is supported")

    try:
        identity_service = get_identity_service()
        user = identity_service.get_or_create_user_from_supertab(
            external_subject_id=request.external_subject_id,
            profile=request.profile,
        )
        return {
            "user": {
                "id": user["id"],
                "email": user.get("email"),
                "displayName": user.get("display_name") or user.get("displayName"),
            }
        }
    except Exception as e:
        logger.error(f"Failed to bootstrap identity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to bootstrap identity: {str(e)}")


@app.get("/api/v1/me")
async def get_current_user(user_id: str = Query(..., description="Jamie internal user ID")):
    """Return a minimal Jamie user summary."""
    try:
        identity_service = get_identity_service()
        user = identity_service.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "user": {
                "id": user["id"],
                "email": user.get("email"),
                "displayName": user.get("display_name") or user.get("displayName"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")


@app.get("/api/v1/recipes/{recipe_id}/access", response_model=RecipeAccessResponse)
async def get_recipe_access(
    recipe_id: str,
    user_id: Optional[str] = Query(None, description="Jamie internal user ID"),
):
    """Resolve whether the recipe is free, locked, or owned for the given user."""
    try:
        access_service = get_access_service()
        access = access_service.get_recipe_access(recipe_id, user_id=user_id)
        return RecipeAccessResponse(**access)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get access state for recipe {recipe_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get recipe access: {str(e)}")


@app.get("/api/v1/me/recipes")
async def get_owned_recipes(user_id: str = Query(..., description="Jamie internal user ID")):
    """Return the current user's owned recipe library from Jamie entitlements."""
    try:
        access_service = get_access_service()
        recipes = access_service.list_owned_recipes(user_id)
        return {
            "recipes": [OwnedRecipeSummaryResponse(**recipe).model_dump() for recipe in recipes],
            "total": len(recipes),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list owned recipes for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list owned recipes: {str(e)}")


@app.post("/api/v1/purchases/supertab/sync")
async def sync_supertab_purchase(request: SupertabPurchaseSyncRequest):
    """Persist Supertab purchase outcomes into Jamie purchases and entitlements."""
    try:
        sync_service = get_purchase_sync_service()
        result = sync_service.sync_supertab_state(
            user_id=request.user_id,
            recipe_slug_or_id=request.recipe_id,
            purchase=request.purchase,
            prior_entitlement=request.prior_entitlement,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to sync Supertab purchase: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to sync Supertab purchase: {str(e)}")


def _map_spend_mandate(mandate: dict) -> SpendMandateResponse:
    return SpendMandateResponse(**serialize_spend_mandate(mandate))


def _map_spend_mandate_ask(ask: dict) -> SpendMandateAskResponse:
    return SpendMandateAskResponse(
        id=ask["id"],
        userId=ask.get("user_id"),
        sessionId=ask.get("session_id"),
        backendRecipeId=ask.get("backend_recipe_id", ""),
        priceAmount=int(ask.get("price_amount") or 0),
        currencyCode=ask.get("currency_code") or "USD",
        ceilingAmount=int(ask.get("ceiling_amount") or 0),
        status=ask.get("status", "requested"),
        mandateId=ask.get("mandate_id"),
        toolCallId=ask.get("tool_call_id"),
        responseId=ask.get("response_id"),
        requestedAt=ask.get("requested_at"),
        resolvedAt=ask.get("resolved_at"),
        expiresAt=ask.get("expires_at"),
    )


@app.post("/api/v1/webhooks/{provider}")
async def receive_provider_webhook(provider: str, request: Request):
    """Generic provider webhook endpoint with signature verification and idempotent reconciliation."""
    try:
        payload = await request.body()
        headers = {k: v for k, v in request.headers.items()}
        result = get_webhook_service().process_webhook(provider, payload=payload, headers=headers)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Webhook processing failed for {provider}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")


@app.post("/api/v1/spend-mandates", response_model=SpendMandateResponse)
async def create_spend_mandate(request: SpendMandateCreateRequest):
    """Grant an AP2-style session spend mandate for agentic purchases."""
    try:
        identity_service = get_identity_service()
        user = identity_service.get_user(request.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        mandate = get_spend_mandate_service().create_mandate(
            user_id=request.user_id,
            ceiling_amount=request.ceiling_amount,
            currency_code=request.currency_code,
            session_id=request.session_id,
            source=request.source,
            expires_at=request.expires_at,
        )
        return _map_spend_mandate(mandate)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create spend mandate: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create spend mandate: {str(e)}")


@app.get("/api/v1/spend-mandates/current", response_model=Optional[SpendMandateResponse])
async def get_current_spend_mandate(user_id: str = Query(..., description="Jamie internal user ID")):
    """Return the user's active session spend mandate, if any."""
    try:
        mandate = get_spend_mandate_service().get_current_mandate(user_id)
        if not mandate:
            return None
        return _map_spend_mandate(mandate)
    except Exception as e:
        logger.error(f"Failed to get spend mandate: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get spend mandate: {str(e)}")


@app.delete("/api/v1/spend-mandates/current")
async def revoke_current_spend_mandate(user_id: str = Query(..., description="Jamie internal user ID")):
    """Revoke the user's active session spend mandate."""
    try:
        revoked = get_spend_mandate_service().revoke_current_mandate(user_id)
        return {"revoked": len(revoked)}
    except Exception as e:
        logger.error(f"Failed to revoke spend mandate: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to revoke spend mandate: {str(e)}")


@app.get("/api/v1/spend-mandate-asks/{ask_id}", response_model=SpendMandateAskResponse)
async def get_spend_mandate_ask(ask_id: str):
    """Return server-side consent ask status."""
    try:
        ask = get_spend_mandate_ask_service().get_ask(ask_id)
        if not ask:
            raise HTTPException(status_code=404, detail="Ask not found")
        return _map_spend_mandate_ask(ask)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get spend mandate ask {ask_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get spend mandate ask: {str(e)}")


@app.post("/api/v1/spend-mandate-asks/{ask_id}/resolve")
async def resolve_spend_mandate_ask(ask_id: str, request: SpendMandateAskResolveRequest):
    """Grant or decline a consent ask; grant mints the spend mandate server-side."""
    try:
        decision = (request.decision or "").strip().lower()
        grant = decision in ("grant", "approve", "yes", "true")
        if decision in ("decline", "deny", "no", "false"):
            grant = False
        elif not grant:
            raise HTTPException(status_code=400, detail="decision must be grant or decline")

        result = get_spend_mandate_ask_service().resolve_ask(
            ask_id,
            grant=grant,
            user_id=request.user_id,
            source=request.source,
        )
        if not result.get("ok"):
            error = result.get("error")
            if error == "ask_not_found":
                raise HTTPException(status_code=404, detail="Ask not found")
            if error == "user_id_required_for_grant":
                raise HTTPException(status_code=400, detail="user_id required to grant ask")
            raise HTTPException(status_code=400, detail=str(error))

        payload: dict = {
            "ask": _map_spend_mandate_ask(result["ask"]).model_dump(),
        }
        if result.get("mandate"):
            payload["mandate"] = serialize_spend_mandate(result["mandate"])
        return payload
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to resolve spend mandate ask {ask_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to resolve spend mandate ask: {str(e)}")


@app.post("/api/v1/offerings/onetime")
async def create_onetime_offering(request: OnetimeOfferingRequest):
    """Mint a Supertab one-time offering via Merchant API (agentic payment intent)."""
    try:
        offering = get_supertab_merchant_client().create_onetime_offering(
            content_key=request.content_key,
            price_amount=request.price_amount,
            currency_code=request.currency_code,
            description=request.description,
            metadata={
                **request.metadata,
                **({"recipe_id": request.recipe_slug} if request.recipe_slug else {}),
                **({"jamie_user_id": request.user_id} if request.user_id else {}),
            },
        )
        intent = None
        if request.user_id and request.recipe_slug:
            mandate = get_spend_mandate_service().get_current_mandate(request.user_id)
            intent = build_purchase_intent_payload(
                user_id=request.user_id,
                recipe_slug=request.recipe_slug,
                content_key=request.content_key,
                price_amount=request.price_amount,
                currency_code=request.currency_code,
                mandate_id=mandate["id"] if mandate else None,
                onetime_offering_id=offering.get("id"),
            )
        return {"offering": offering, "purchase_intent": intent}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create one-time offering: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create one-time offering: {str(e)}")


@app.get("/api/v1/commerce/capabilities")
async def get_commerce_capabilities():
    """UCP/MCP-compatible commerce capability manifest for external agents."""
    return build_commerce_capability_manifest()


@app.post("/api/v1/auth/supertab/verify")
async def verify_supertab_token(
    authorization: str = Header(..., alias="Authorization"),
):
    """Verify a Supertab customer token and return the linked Jamie user."""
    try:
        token = authorization.removeprefix("Bearer ").strip()
        customer = SupertabTokenVerifier().verify_token(token)
        supertab_user = customer.get("user") or {}
        external_subject_id = supertab_user.get("id")
        if not external_subject_id:
            raise HTTPException(status_code=400, detail="Supertab customer has no user id")

        identity_service = get_identity_service()
        user = identity_service.get_or_create_user_from_supertab(
            external_subject_id=external_subject_id,
            profile={
                "email": supertab_user.get("email"),
                "firstName": supertab_user.get("firstName"),
                "lastName": supertab_user.get("lastName"),
                "isGuest": supertab_user.get("isGuest", False),
            },
        )
        return {
            "user": {
                "id": user["id"],
                "email": user.get("email"),
                "displayName": user.get("display_name") or user.get("displayName"),
            },
            "supertab": {
                "authenticated": customer.get("authenticated"),
                "testMode": (customer.get("tab") or {}).get("testMode"),
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to verify Supertab token: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to verify Supertab token: {str(e)}")


@app.post("/api/v1/recipes/search", response_model=SearchResponse)
async def search_recipes(
    request: SearchRequest,
    x_correlation_id: Optional[str] = Header(None, alias="X-Correlation-ID"),
):
    """
    Semantic recipe search.

    Combines:
    - Vector similarity (semantic embeddings)
    - Exact filters (category, mood, complexity, cost)
    - Full-text search on ingredients

    Example:
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
        cid = x_correlation_id or str(uuid.uuid4())

        gate = evaluate_message_sync(request.query.strip() or "", correlation_id=cid)
        if gate.blocked:
            return SearchResponse(
                query=request.query,
                filters_applied={
                    "category": request.category,
                    "mood": request.mood,
                    "complexity": request.complexity,
                    "cost": request.cost,
                    "ingredients_query": request.ingredients_query,
                },
                results=[],
                total=0,
                took_ms=round((time.time() - start_time) * 1000, 2),
                guardrail_blocked=True,
                guardrail_category=gate.category,
            )

        # Build filters
        filters = SearchFilters(
            category=request.category,
            mood=request.mood,
            complexity=request.complexity,
            cost=request.cost,
            ingredients_query=request.ingredients_query,
        )

        # Search
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

        # Map to response models
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
    Get full recipe by ID (slug).

    Args:
        recipe_id: Recipe slug (e.g. "christmas-salad-jamie-oliver-recipes")
        include_chunks: If True, include all recipe chunks
    """
    try:
        from recipe_search_agent.recipe_catalog import get_published_catalog

        catalog = get_published_catalog()
        if not catalog.is_published(recipe_id):
            raise HTTPException(status_code=404, detail=f"Recipe not found: {recipe_id}")

        agent = get_search_agent()
        recipes_response = (
            agent.client.table("recipes")
            .select("*")
            .eq("slug", recipe_id)
            .eq("status", "published")
            .execute()
        )

        if not recipes_response.data:
            raise HTTPException(status_code=404, detail=f"Recipe not found: {recipe_id}")

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
            "source": "recipes_table",
        }

        # Include chunks when requested
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
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    List recipes with optional filters.

    Fetches from the `recipes` table (source of truth) with fallback to `recipe_index`.

    Args:
        category: Category filter
        mood: Mood filter
        complexity: Complexity filter
        status: Filter by recipe status (draft, published, archived)
        include_full: Include full recipe_json in response (default: False for performance)
        limit: Number of results (max 500)
        offset: Pagination offset
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
                async for event in chat_agent.chat(
                    request.message,
                    request.session_id,
                    focused_recipe_backend_id=request.focused_recipe_backend_id,
                    user_id=request.user_id,
                ):
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
    - Client sends: {"event": "focused_recipe", "data": {"backendRecipeId": "recipe-slug"}} (modal focus; empty string clears)

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
    - Server sends: {"event": "recipe_paywall_requested", "data": {"backend_recipe_id": "..."}}
    - Server sends: {"event": "done"}
    - Server sends: {"event": "interrupted", "data": {"reason": "..."}}
    - Server sends: {"event": "error", "data": "error message"}

    Requires environment variables:
    - DEEPGRAM_API_KEY: For speech-to-text
    - ELEVENLABS_API_KEY: For text-to-speech
    - ELEVENLABS_VOICE_ID: Voice ID for Jamie
    - ELEVENLABS_MODEL_ID: ElevenLabs TTS model_id
    """
    from ccai.core.audio_interface.websocket_audio_interface import WebSocketAudioInterface
    from recipe_search_agent.voice_handler import DiscoveryVoiceHandler, get_voice_config

    connection_started_at = time.perf_counter()
    try:
        config = get_voice_config()
    except ValueError as exc:
        await websocket.accept()
        await websocket.send_json({"event": "error", "data": f"Voice not configured: {exc}"})
        await websocket.close(code=1011, reason="Voice not configured")
        return

    try:
        # WebSocketAudioInterface handles: accept(), receive "start" msg, extract sessionId.
        audio_interface = WebSocketAudioInterface(websocket, sample_rate=config.sample_rate)
        await audio_interface.start()

        session_id = audio_interface._input_service.session_id or f"voice_{id(websocket)}"
        jamie_user_id = getattr(audio_interface._input_service, "jamie_user_id", None)
        _log_voice_latency(
            "voice_ws_handshake_complete",
            connection_started_at,
            session_id=session_id,
        )
        chat_agent = get_chat_agent()
        _log_voice_latency(
            "voice_handler_dependencies_ready",
            connection_started_at,
            session_id=session_id,
        )

        handler = DiscoveryVoiceHandler(
            input_channel=audio_interface.get_input_service(),
            output_channel=audio_interface.get_output_service(),
            control_queue=audio_interface.get_input_control_queue(),
            chat_agent=chat_agent,
            config=config,
            session_id=session_id,
            jamie_user_id=jamie_user_id,
            connection_started_at=connection_started_at,
        )
        await handler.handle()

    except WebSocketDisconnect:
        logger.info("Voice chat WebSocket disconnected [%s]", locals().get("session_id", "?"))
    except Exception as exc:
        logger.error("Error in voice chat WebSocket: %s", exc, exc_info=True)
        try:
            await websocket.send_json({"event": "error", "data": str(exc)})
        except Exception:
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

