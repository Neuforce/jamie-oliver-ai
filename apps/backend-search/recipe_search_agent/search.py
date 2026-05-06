"""
Recipe Search Agent - Búsqueda híbrida de recetas.

Combina:
- Vector similarity (embeddings semánticos)
- Filtros exactos (category, mood, complexity, cost)
- Full-text search (ingredientes)
"""

import json
import logging
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Optional, Any

from supabase import Client

logger = logging.getLogger(__name__)


@dataclass
class SearchFilters:
    """Filtros opcionales para la búsqueda."""
    
    category: Optional[str] = None  # breakfast, lunch, dinner, dessert
    mood: Optional[str] = None      # comfort, light, festive
    complexity: Optional[str] = None  # easy, medium, hard
    cost: Optional[str] = None       # budget, moderate, premium
    ingredients_query: Optional[str] = None  # "tomato basil" para FTS


@dataclass
class RecipeMatch:
    """Resultado de búsqueda con score y contexto."""
    
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
    matching_chunks: List[Dict[str, Any]]
    full_recipe: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


class RecipeSearchAgent:
    """
    Agente de búsqueda semántica de recetas.
    
    Usa embeddings + filtros + FTS para encontrar las recetas más relevantes.
    """
    
    def __init__(
        self,
        supabase_client: Client,
        embedding_model: str = "BAAI/bge-small-en-v1.5",
        project_root: Optional[Path] = None,
    ):
        """
        Args:
            supabase_client: Cliente de Supabase ya autenticado
            embedding_model: Modelo de embeddings (debe coincidir con el usado en ingestion)
            project_root: Ruta raíz del proyecto (para cargar JSONs de recetas)
        """
        self.client = supabase_client
        self.embedding_model = embedding_model
        # Point to monorepo root data/recipes/ directory
        if project_root:
            # Si se pasa project_root, debe ser la raíz del monorepo
            self.project_root = Path(project_root) / "data" / "recipes"
        else:
            # Fallback: calcular desde la ubicación de este archivo
            # Desde search.py: parents[0] = recipe_search_agent/, parents[1] = apps/backend-search/, parents[2] = apps/, parents[3] = jamie-oliver-ai/
            self.project_root = Path(__file__).resolve().parents[3] / "data" / "recipes"
        
    def _generate_embedding(self, text: str) -> List[float]:
        """Genera embedding para un texto."""
        from fastembed import TextEmbedding
        
        model = TextEmbedding(model_name=self.embedding_model)
        embeddings = list(model.embed([text]))
        return embeddings[0].tolist()
    
    def _load_recipe_json(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Carga el JSON completo de una receta desde file_path."""
        try:
            # file_path puede ser relativo (ej: "pesto-pasta.json") o absoluto
            if Path(file_path).is_absolute():
                json_file = Path(file_path)
            else:
                # Si es relativo, buscar en project_root (data/recipes/)
                json_file = self.project_root / file_path
            if not json_file.exists():
                logger.warning(f"Recipe JSON not found: {json_file}")
                return None
            
            with open(json_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load recipe JSON {file_path}: {e}")
            return None

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenizer for the table-search fallback."""
        if not text:
            return []
        return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) > 1]

    def _is_missing_rpc_error(self, error: Exception, rpc_name: str) -> bool:
        """
        Detect the specific Supabase/PostgREST case where the RPC is not present
        in the connected project's schema cache.
        """
        message = str(error)
        return (
            rpc_name in message
            or "schema cache" in message
            or "PGRST202" in message
        )

    def _search_from_recipes_table(
        self,
        query: str,
        filters: SearchFilters,
        top_k: int,
        include_full_recipe: bool,
    ) -> List[RecipeMatch]:
        """
        Fallback path when the hybrid Supabase RPC is unavailable.

        Uses the same `recipes` table the list endpoint already reads from,
        then ranks candidates in Python using title / description / tags /
        course / category / cuisine / ingredient matches. This is less
        sophisticated than the intended hybrid search, but it keeps local UAT
        usable when the semantic-search SQL functions have not been deployed
        to the current Supabase project.
        """
        response = (
            self.client.table("recipes")
            .select("slug, metadata, quality_score, status, recipe_json")
            .in_("status", ["published", "draft"])
            .limit(500)
            .execute()
        )
        rows = response.data or []
        if not rows:
            logger.info("Recipes-table fallback returned no rows")
            return []

        query_tokens = self._tokenize(query)
        ingredient_tokens = self._tokenize(filters.ingredients_query or query)
        category_filter = (filters.category or "").strip().lower()
        mood_filter = (filters.mood or "").strip().lower()
        complexity_filter = (filters.complexity or "").strip().lower()
        cost_filter = (filters.cost or "").strip().lower()

        scored: List[RecipeMatch] = []
        for row in rows:
            full_recipe = row.get("recipe_json") or {}
            recipe_meta = full_recipe.get("recipe", {}) if isinstance(full_recipe, dict) else {}
            ingredients = full_recipe.get("ingredients") or []
            notes = full_recipe.get("notes") or {}
            metadata = row.get("metadata") or {}

            title = recipe_meta.get("title") or metadata.get("title") or row.get("slug") or "Recipe"
            description = (
                recipe_meta.get("description")
                or metadata.get("description")
                or notes.get("text")
                or ""
            )
            tags = recipe_meta.get("tags") or metadata.get("tags") or []
            course = recipe_meta.get("course") or metadata.get("course") or ""
            cuisine = recipe_meta.get("cuisine") or metadata.get("cuisine") or ""
            categories = recipe_meta.get("categories") or metadata.get("categories") or []
            ingredient_names = " ".join(
                ing.get("name", "")
                for ing in ingredients
                if isinstance(ing, dict)
            )

            search_haystack = " ".join(
                [
                    str(title),
                    str(description),
                    str(course),
                    str(cuisine),
                    " ".join(str(tag) for tag in tags),
                    " ".join(str(cat) for cat in categories),
                    ingredient_names,
                ]
            ).lower()

            score = 0.0

            for token in query_tokens:
                if token in str(title).lower():
                    score += 2.4
                elif token in search_haystack:
                    score += 0.8

            for token in ingredient_tokens:
                if token and token in ingredient_names.lower():
                    score += 0.6

            if query.lower() in str(title).lower():
                score += 2.0
            if query.lower() in str(description).lower():
                score += 1.2

            if category_filter:
                category_haystack = " ".join(
                    [
                        str(course),
                        " ".join(str(cat) for cat in categories),
                        " ".join(str(tag) for tag in tags),
                    ]
                ).lower()
                if category_filter in category_haystack:
                    score += 2.0
                else:
                    # Course/category filter is meaningful for discovery tools;
                    # if it misses entirely, skip the candidate.
                    continue

            if mood_filter and mood_filter == str(metadata.get("mood", "")).lower():
                score += 0.8
            if complexity_filter and complexity_filter in str(metadata.get("complexity", "")).lower():
                score += 0.6
            if cost_filter and cost_filter in str(metadata.get("cost", "")).lower():
                score += 0.4

            if score <= 0:
                continue

            file_path = f"{row.get('slug')}.json"
            match = RecipeMatch(
                recipe_id=row.get("slug") or recipe_meta.get("id") or file_path.replace(".json", ""),
                title=title,
                similarity_score=min(score / 10.0, 0.95),
                combined_score=score,
                category=(categories[0] if categories else metadata.get("category")),
                mood=metadata.get("mood"),
                complexity=metadata.get("complexity"),
                cost=metadata.get("cost"),
                file_path=file_path,
                match_explanation="Recipes-table fallback match",
                matching_chunks=[],
                full_recipe=full_recipe if include_full_recipe else None,
            )
            scored.append(match)

        scored.sort(key=lambda item: item.combined_score, reverse=True)
        logger.info(
            "Recipes-table fallback found %s candidates for query=%r",
            len(scored),
            query,
        )
        return scored[:top_k]
    
    def _get_matching_chunks(self, recipe_id: str, query_embedding: List[float], top_k: int = 3) -> List[Dict[str, Any]]:
        """Obtiene los chunks más relevantes para una receta."""
        try:
            response = self.client.rpc(
                "match_recipe_chunks",
                {
                    "query_embedding": query_embedding,
                    "recipe_id_filter": recipe_id,
                    "match_count": top_k,
                }
            ).execute()
            
            return response.data if response.data else []
        except Exception as e:
            logger.warning(f"Failed to get matching chunks for {recipe_id}: {e}")
            return []
    
    def _generate_match_explanation(
        self, 
        recipe: Dict[str, Any],
        similarity_score: float,
        ingredient_rank: float,
        filters: Optional[SearchFilters] = None
    ) -> str:
        """Genera explicación de por qué la receta coincide."""
        explanations = []
        
        # Score de similitud semántica
        if similarity_score > 0.7:
            explanations.append(f"Alta similitud semántica ({similarity_score:.2f})")
        elif similarity_score > 0.5:
            explanations.append(f"Buena similitud semántica ({similarity_score:.2f})")
        
        # Match de ingredientes
        if ingredient_rank > 0:
            explanations.append("Ingredientes relevantes")
        
        # Filtros aplicados
        if filters:
            if filters.category and recipe.get("category") == filters.category:
                explanations.append(f"Categoría: {filters.category}")
            if filters.mood and recipe.get("mood") == filters.mood:
                explanations.append(f"Mood: {filters.mood}")
            if filters.complexity and recipe.get("complexity") == filters.complexity:
                explanations.append(f"Dificultad: {filters.complexity}")
            if filters.cost and recipe.get("cost") == filters.cost:
                explanations.append(f"Costo: {filters.cost}")
        
        return " | ".join(explanations) if explanations else "Match encontrado"
    
    def search(
        self,
        query: str,
        filters: Optional[SearchFilters] = None,
        top_k: int = 10,
        include_full_recipe: bool = True,
        include_chunks: bool = True,
        similarity_threshold: float = 0.3,
    ) -> List[RecipeMatch]:
        """
        Búsqueda híbrida de recetas.
        
        Args:
            query: Query en lenguaje natural (ej: "quick vegetarian pasta")
            filters: Filtros opcionales (category, mood, etc.)
            top_k: Número de resultados a retornar
            include_full_recipe: Si True, carga el JSON completo de cada receta
            include_chunks: Si True, incluye los chunks más relevantes de cada receta
            similarity_threshold: Umbral mínimo de similitud (0-1)
            
        Returns:
            Lista de RecipeMatch ordenados por relevancia (combined_score desc)
        """
        try:
            # 1. Generar embedding del query
            logger.info(f"Searching for: {query}")
            query_embedding = self._generate_embedding(query)
            
            # 2. Preparar filtros
            filters = filters or SearchFilters()
            
            # 3. Llamar función de búsqueda híbrida en Supabase
            try:
                response = self.client.rpc(
                    "hybrid_recipe_search",
                    {
                        "query_embedding": query_embedding,
                        "query_text": filters.ingredients_query,
                        "filter_category": filters.category,
                        "filter_mood": filters.mood,
                        "filter_complexity": filters.complexity,
                        "filter_cost": filters.cost,
                        "match_count": top_k,
                        "similarity_threshold": similarity_threshold,
                    }
                ).execute()
                results_data = response.data or []
            except Exception as rpc_error:
                if self._is_missing_rpc_error(rpc_error, "hybrid_recipe_search"):
                    logger.warning(
                        "hybrid_recipe_search RPC unavailable; falling back to recipes table ranking: %s",
                        rpc_error,
                    )
                    return self._search_from_recipes_table(
                        query=query,
                        filters=filters,
                        top_k=top_k,
                        include_full_recipe=include_full_recipe,
                    )
                raise

            # Fallback: if we get too few results, relax threshold to improve recall
            min_results_for_fallback = min(3, top_k)
            if len(results_data) < min_results_for_fallback:
                relaxed_threshold = max(0.15, similarity_threshold * 0.5)
                logger.info(
                    f"Low result count ({len(results_data)}). "
                    f"Retrying with relaxed similarity_threshold={relaxed_threshold}"
                )
                try:
                    fallback_response = self.client.rpc(
                        "hybrid_recipe_search",
                        {
                            "query_embedding": query_embedding,
                            "query_text": filters.ingredients_query,
                            "filter_category": filters.category,
                            "filter_mood": filters.mood,
                            "filter_complexity": filters.complexity,
                            "filter_cost": filters.cost,
                            "match_count": top_k,
                            "similarity_threshold": relaxed_threshold,
                        }
                    ).execute()
                    fallback_data = fallback_response.data or []
                except Exception as rpc_error:
                    if self._is_missing_rpc_error(rpc_error, "hybrid_recipe_search"):
                        logger.warning(
                            "Relaxed hybrid_recipe_search RPC also unavailable; using existing results only"
                        )
                        fallback_data = []
                    else:
                        raise
                if fallback_data:
                    # Merge, keeping highest combined_score per recipe_id
                    merged_by_id = {row["recipe_id"]: row for row in results_data}
                    for row in fallback_data:
                        existing = merged_by_id.get(row["recipe_id"])
                        if not existing or row.get("combined_score", 0) > existing.get("combined_score", 0):
                            merged_by_id[row["recipe_id"]] = row
                    results_data = list(merged_by_id.values())
                    results_data.sort(key=lambda r: r.get("combined_score", 0), reverse=True)
                    results_data = results_data[:top_k]

            if not results_data:
                logger.info("No results found")
                return []
            
            # 4. Enriquecer resultados
            results = []
            for row in results_data:
                # Obtener chunks relevantes
                matching_chunks = []
                if include_chunks:
                    matching_chunks = self._get_matching_chunks(
                        recipe_id=row["recipe_id"],
                        query_embedding=query_embedding,
                        top_k=3
                    )
                
                # Cargar JSON completo
                full_recipe = None
                if include_full_recipe:
                    full_recipe = self._load_recipe_json(row["file_path"])
                
                # Generar explicación
                match_explanation = self._generate_match_explanation(
                    recipe=row,
                    similarity_score=row["similarity_score"],
                    ingredient_rank=row["ingredient_rank"],
                    filters=filters
                )
                
                # Crear RecipeMatch
                match = RecipeMatch(
                    recipe_id=row["recipe_id"],
                    title=row["title"],
                    similarity_score=row["similarity_score"],
                    combined_score=row["combined_score"],
                    category=row.get("category"),
                    mood=row.get("mood"),
                    complexity=row.get("complexity"),
                    cost=row.get("cost"),
                    file_path=row["file_path"],
                    match_explanation=match_explanation,
                    matching_chunks=matching_chunks,
                    full_recipe=full_recipe,
                )
                results.append(match)
            
            logger.info(f"Found {len(results)} results")
            return results
            
        except Exception as e:
            logger.error(f"Search failed: {e}", exc_info=True)
            raise


