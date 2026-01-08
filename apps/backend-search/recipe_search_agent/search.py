"""
Recipe Search Agent - Búsqueda híbrida de recetas.

Combina:
- Vector similarity (embeddings semánticos)
- Filtros exactos (category, mood, complexity, cost)
- Full-text search (ingredientes)
"""

import json
import logging
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
            
            if not response.data:
                logger.info("No results found")
                return []
            
            # 4. Enriquecer resultados
            results = []
            for row in response.data:
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


