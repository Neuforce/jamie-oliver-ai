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
from typing import List, Dict, Optional, Any, Tuple

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

    _LEXICAL_QUERY_STOPWORDS = frozenset(
        {
            "the",
            "a",
            "an",
            "i",
            "me",
            "my",
            "we",
            "you",
            "to",
            "for",
            "and",
            "or",
            "with",
            "some",
            "any",
            "tell",
            "show",
            "give",
            "want",
            "need",
            "please",
            "about",
            "recipe",
            "recipes",
            "dish",
            "something",
            "make",
            "cook",
            "like",
            "looking",
        }
    )

    def _local_lexical_fallback(
        self,
        query: str,
        filters: SearchFilters,
        top_k: int,
        include_full_recipe: bool,
    ) -> List[RecipeMatch]:
        """
        When Supabase hybrid search returns no rows (empty index, stale DB,
        thresholds), rank local data/recipes/*.json by overlapping tokens /
        substring so named dishes like 'Beef Wellington' still resolve (NEU/local dev).
        """
        qnorm = (query or "").strip().lower()
        if not qnorm or not self.project_root.is_dir():
            return []

        def tokens(s: str) -> set[str]:
            return set(re.findall(r"[a-z0-9]+", s.lower())) - self._LEXICAL_QUERY_STOPWORDS

        qtok = tokens(qnorm)
        if not qtok:
            qtok = set(re.findall(r"[a-z0-9]{3,}", qnorm))

        scored: List[Tuple[float, str, Dict[str, Any]]] = []
        filter_cat = (filters.category or "").lower().strip() or None

        for path in sorted(self.project_root.glob("*.json")):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                meta = data.get("recipe") or {}
                rid = meta.get("id") or path.stem
                title = (meta.get("title") or path.stem).strip()
                course = (meta.get("course") or "").strip().lower()
            except Exception as exc:
                logger.debug("Skip bad recipe json %s: %s", path, exc)
                continue

            if filter_cat and course and filter_cat != course:
                continue

            stem = path.stem.lower()
            title_low = title.lower()
            rid_low = rid.lower()
            slugish = stem.replace("-", " ")
            title_tokens = tokens(title_low)
            corpus = f"{title_low} {rid_low} {stem} {slugish}"

            score = 0.0
            overlap = len(qtok & title_tokens)
            score += overlap * 3.0
            # Multi-word phrases (e.g. beef + wellington)
            if overlap >= min(2, max(1, len(qtok))):
                score += 4.0

            key_phrases = sorted(qtok, key=len, reverse=True)[:8]
            for w in key_phrases:
                if len(w) < 4:
                    continue
                if w in rid_low or w in stem:
                    score += 2.5
                elif w in title_low:
                    score += 2.0

            if qnorm and (qnorm in title_low or qnorm in corpus or corpus in qnorm):
                score += 8.0

            if score < 5.5:
                continue

            scored.append((score, path.name, data))

        scored.sort(key=lambda x: (-x[0], x[1]))
        out: List[RecipeMatch] = []
        seen: set[str] = set()

        for rank_score, fname, data in scored:
            meta = data.get("recipe") or {}
            rid = meta.get("id") or Path(fname).stem
            title = meta.get("title") or rid
            if rid in seen:
                continue
            seen.add(rid)

            synth = round(min(0.95, 0.55 + rank_score * 0.008), 4)
            match_expl = (
                "Local catalogue match — vector DB returned nothing; ranked by title/slug tokens"
            )
            full_payload = dict(data) if include_full_recipe else None

            out.append(
                RecipeMatch(
                    recipe_id=rid,
                    title=title,
                    similarity_score=synth,
                    combined_score=synth,
                    category=meta.get("course"),
                    mood=None,
                    complexity=meta.get("difficulty"),
                    cost=None,
                    file_path=fname,
                    match_explanation=match_expl,
                    matching_chunks=[],
                    full_recipe=full_payload,
                )
            )
            if len(out) >= top_k:
                break

        return out

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
        effective_filters = filters or SearchFilters()

        try:
            # 1. Generar embedding del query
            logger.info(f"Searching for: {query}")
            query_embedding = self._generate_embedding(query)
            
            # 2. Preparar filtros
            filters = effective_filters
            
            # 3. Llamar función de búsqueda híbrida en Supabase
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

            # Fallback: if we get too few results, relax threshold to improve recall
            min_results_for_fallback = min(3, top_k)
            if len(results_data) < min_results_for_fallback:
                relaxed_threshold = max(0.15, similarity_threshold * 0.5)
                logger.info(
                    f"Low result count ({len(results_data)}). "
                    f"Retrying with relaxed similarity_threshold={relaxed_threshold}"
                )
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
                logger.info(
                    "Hybrid search returned no rows; using local lexical fallback under %s",
                    self.project_root,
                )
                return self._local_lexical_fallback(
                    query,
                    filters,
                    top_k,
                    include_full_recipe,
                )
            
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
            fb = self._local_lexical_fallback(
                query,
                effective_filters,
                top_k,
                include_full_recipe,
            )
            if fb:
                logger.warning(
                    "Returning %d lexical fallback hits after hybrid search error",
                    len(fb),
                )
                return fb
            raise


