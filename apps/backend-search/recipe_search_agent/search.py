"""
Recipe Search Agent - hybrid recipe search.

Combines:
- Vector similarity (semantic embeddings)
- Exact filters (category, mood, complexity, cost)
- Full-text search (ingredients)
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
    """Optional search filters."""
    
    category: Optional[str] = None  # breakfast, lunch, dinner, dessert
    mood: Optional[str] = None      # comfort, light, festive
    complexity: Optional[str] = None  # easy, medium, hard
    cost: Optional[str] = None       # budget, moderate, premium
    ingredients_query: Optional[str] = None  # "tomato basil" for FTS


@dataclass
class RecipeMatch:
    """Search result with score and context."""
    
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
    Semantic recipe search agent.

    Uses embeddings + filters + FTS to find the most relevant recipes.
    """
    
    def __init__(
        self,
        supabase_client: Client,
        embedding_model: str = "BAAI/bge-small-en-v1.5",
        project_root: Optional[Path] = None,
    ):
        """
        Args:
            supabase_client: Authenticated Supabase client
            embedding_model: Embedding model (must match ingestion)
            project_root: Project root path (to load recipe JSON files)
        """
        self.client = supabase_client
        self.embedding_model = embedding_model
        # Point to monorepo root data/recipes/ directory
        if project_root:
            # When project_root is passed, it must be the monorepo root
            self.project_root = Path(project_root) / "data" / "recipes"
        else:
            # Fallback: derive from this file location
            # Desde search.py: parents[0] = recipe_search_agent/, parents[1] = apps/backend-search/, parents[2] = apps/, parents[3] = jamie-oliver-ai/
            self.project_root = Path(__file__).resolve().parents[3] / "data" / "recipes"
        
    def _generate_embedding(self, text: str) -> List[float]:
        """Generate an embedding for text.

        Delegates to the shared, process-cached loader in ``recipe_pdf_agent.embed``
        so the fastembed model is loaded once per process (not per query) and query
        vectors are produced by the exact same code path as the indexed vectors.
        """
        from recipe_pdf_agent.embed import embed_text

        return embed_text(text, model_name=self.embedding_model)
    
    def _load_recipe_json(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Load full recipe JSON from file_path."""
        try:
            # file_path may be relative (e.g. "pesto-pasta.json") or absolute
            if Path(file_path).is_absolute():
                json_file = Path(file_path)
            else:
                # If relative, resolve under project_root (data/recipes/)
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
            .in_("status", ["published"])
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
        """Get the most relevant chunks for a recipe."""
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
        """Generate an explanation for why the recipe matched."""
        explanations = []
        
        # Semantic similarity score
        if similarity_score > 0.7:
            explanations.append(f"High semantic similarity ({similarity_score:.2f})")
        elif similarity_score > 0.5:
            explanations.append(f"Good semantic similarity ({similarity_score:.2f})")
        
        # Ingredient match
        if ingredient_rank > 0:
            explanations.append("Relevant ingredients")
        
        # Applied filters
        if filters:
            if filters.category and recipe.get("category") == filters.category:
                explanations.append(f"Category: {filters.category}")
            if filters.mood and recipe.get("mood") == filters.mood:
                explanations.append(f"Mood: {filters.mood}")
            if filters.complexity and recipe.get("complexity") == filters.complexity:
                explanations.append(f"Complexity: {filters.complexity}")
            if filters.cost and recipe.get("cost") == filters.cost:
                explanations.append(f"Cost: {filters.cost}")
        
        return " | ".join(explanations) if explanations else "Match found"

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
        Hybrid recipe search.
        
        Args:
            query: Natural-language query (e.g. "quick vegetarian pasta")
            filters: Optional filters (category, mood, etc.)
            top_k: Number of results to return
            include_full_recipe: If True, load full JSON for each recipe
            include_chunks: If True, include the most relevant chunks per recipe
            similarity_threshold: Minimum similarity threshold (0-1)
            
        Returns:
            List of RecipeMatch sorted by relevance (combined_score desc)
        """
        effective_filters = filters or SearchFilters()

        try:
            # 1. Generate query embedding
            logger.info(f"Searching for: {query}")
            query_embedding = self._generate_embedding(query)
            
            # 2. Prepare filters
            filters = effective_filters
            
            # 3. Call hybrid search RPC in Supabase
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
                logger.info(
                    "Hybrid search returned no rows; using recipes-table ranking"
                )
                return self._search_from_recipes_table(
                    query=query,
                    filters=filters,
                    top_k=top_k,
                    include_full_recipe=include_full_recipe,
                )
            
            # 4. Enrich results
            from recipe_search_agent.recipe_catalog import get_published_catalog

            catalog = get_published_catalog()
            results = []
            for row in results_data:
                recipe_id = row.get("recipe_id")
                if not recipe_id or not catalog.is_published(recipe_id):
                    continue
                # Fetch relevant chunks
                matching_chunks = []
                if include_chunks:
                    matching_chunks = self._get_matching_chunks(
                        recipe_id=row["recipe_id"],
                        query_embedding=query_embedding,
                        top_k=3
                    )
                
                # Load full JSON
                full_recipe = None
                if include_full_recipe:
                    full_recipe = self._load_recipe_json(row["file_path"])
                
                # Build match explanation
                match_explanation = self._generate_match_explanation(
                    recipe=row,
                    similarity_score=row["similarity_score"],
                    ingredient_rank=row["ingredient_rank"],
                    filters=filters
                )
                
                # Build RecipeMatch
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
            fb = self._search_from_recipes_table(
                query,
                effective_filters,
                top_k,
                include_full_recipe,
            )
            if fb:
                logger.warning(
                    "Returning %d recipes-table hits after hybrid search error",
                    len(fb),
                )
                return fb
            raise


