#!/usr/bin/env python3
"""Test script for Recipe Search Agent."""

import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

from recipe_search_agent import RecipeSearchAgent, SearchFilters
from supabase import create_client


def print_results(results, query: str):
    """Pretty print search results."""
    print(f"\n{'='*80}")
    print(f"Query: {query}")
    print(f"{'='*80}\n")
    
    if not results:
        print("❌ No results found\n")
        return
    
    print(f"✅ Found {len(results)} results:\n")
    
    for i, match in enumerate(results, 1):
        print(f"{i}. {match.title} ({match.recipe_id})")
        print(f"   Score: {match.combined_score:.3f} (similarity: {match.similarity_score:.3f})")
        print(f"   Category: {match.category or 'N/A'} | Mood: {match.mood or 'N/A'} | Complexity: {match.complexity or 'N/A'}")
        print(f"   Why: {match.match_explanation}")
        
        if match.matching_chunks:
            print(f"   Matching chunks:")
            for chunk in match.matching_chunks[:2]:  # Show top 2 chunks
                chunk_text = chunk.get("chunk_text", "")[:100] + "..." if len(chunk.get("chunk_text", "")) > 100 else chunk.get("chunk_text", "")
                print(f"     • {chunk_text} (sim: {chunk.get('similarity', 0):.3f})")
        print()


def test_basic_search(agent: RecipeSearchAgent):
    """Test búsqueda básica sin filtros."""
    print("\n" + "="*80)
    print("TEST 1: Búsqueda Básica")
    print("="*80)
    
    queries = [
        "quick pasta recipe",
        "vegetarian dinner",
        "christmas dessert",
        "healthy breakfast",
        "comfort food",
    ]
    
    for query in queries:
        start = time.time()
        results = agent.search(query=query, top_k=5, include_full_recipe=False)
        elapsed = time.time() - start
        
        print(f"\nQuery: '{query}' (took {elapsed*1000:.0f}ms)")
        if results:
            print(f"Top result: {results[0].title} (score: {results[0].combined_score:.3f})")
        else:
            print("No results")


def test_filtered_search(agent: RecipeSearchAgent):
    """Test búsqueda con filtros."""
    print("\n" + "="*80)
    print("TEST 2: Búsqueda con Filtros")
    print("="*80)
    
    test_cases = [
        {
            "query": "pasta dish",
            "filters": SearchFilters(complexity="easy"),
            "description": "Easy pasta"
        },
        {
            "query": "dessert",
            "filters": SearchFilters(mood="festive"),
            "description": "Festive dessert"
        },
        {
            "query": "salad",
            "filters": SearchFilters(category="lunch", complexity="easy"),
            "description": "Easy lunch salad"
        },
    ]
    
    for case in test_cases:
        start = time.time()
        results = agent.search(
            query=case["query"],
            filters=case["filters"],
            top_k=3,
            include_full_recipe=False
        )
        elapsed = time.time() - start
        
        print(f"\n{case['description']} (took {elapsed*1000:.0f}ms)")
        if results:
            for i, match in enumerate(results, 1):
                print(f"  {i}. {match.title} (score: {match.combined_score:.3f})")
        else:
            print("  No results")


def test_ingredient_search(agent: RecipeSearchAgent):
    """Test búsqueda por ingredientes."""
    print("\n" + "="*80)
    print("TEST 3: Búsqueda por Ingredientes")
    print("="*80)
    
    test_cases = [
        {"query": "recipe with tomatoes", "ingredients": "tomato"},
        {"query": "pasta", "ingredients": "pasta spaghetti"},
        {"query": "salad", "ingredients": "lettuce cucumber tomato"},
    ]
    
    for case in test_cases:
        start = time.time()
        results = agent.search(
            query=case["query"],
            filters=SearchFilters(ingredients_query=case["ingredients"]),
            top_k=3,
            include_full_recipe=False
        )
        elapsed = time.time() - start
        
        print(f"\nQuery: '{case['query']}' + ingredients: '{case['ingredients']}' (took {elapsed*1000:.0f}ms)")
        if results:
            for i, match in enumerate(results, 1):
                print(f"  {i}. {match.title} (score: {match.combined_score:.3f})")
        else:
            print("  No results")


def test_detailed_search(agent: RecipeSearchAgent):
    """Test búsqueda con resultados detallados."""
    print("\n" + "="*80)
    print("TEST 4: Búsqueda Detallada (con chunks y JSON)")
    print("="*80)
    
    query = "christmas salad"
    print(f"\nSearching for: '{query}'\n")
    
    start = time.time()
    results = agent.search(
        query=query,
        top_k=3,
        include_full_recipe=True,
        include_chunks=True,
    )
    elapsed = time.time() - start
    
    print_results(results, query)
    print(f"⏱️  Search took: {elapsed*1000:.0f}ms\n")
    
    # Show detailed info for top result
    if results and results[0].full_recipe:
        top_match = results[0]
        recipe = top_match.full_recipe
        
        print(f"{'='*80}")
        print(f"Top Match Details: {top_match.title}")
        print(f"{'='*80}")
        print(f"Ingredients: {len(recipe.get('ingredients', []))}")
        print(f"Steps: {len(recipe.get('steps', []))}")
        print(f"Difficulty: {recipe.get('recipe', {}).get('difficulty', 'N/A')}")
        print(f"Time: {recipe.get('recipe', {}).get('estimated_total', 'N/A')}")
        print()


def main():
    """Run all tests."""
    # Load environment variables
    project_root = Path(__file__).resolve().parent
    load_dotenv(project_root / ".env")
    
    # Check credentials
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not supabase_key:
        print("❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env")
        sys.exit(1)
    
    print("✅ Supabase credentials found")
    print(f"   URL: {supabase_url}")
    
    # Create Supabase client
    try:
        client = create_client(supabase_url, supabase_key)
        print("✅ Supabase client created")
    except Exception as e:
        print(f"❌ Failed to create Supabase client: {e}")
        sys.exit(1)
    
    # Create search agent
    agent = RecipeSearchAgent(
        supabase_client=client,
        embedding_model="BAAI/bge-small-en-v1.5",
        project_root=project_root,
    )
    print("✅ Search agent initialized\n")
    
    # Run tests
    try:
        test_basic_search(agent)
        test_filtered_search(agent)
        test_ingredient_search(agent)
        test_detailed_search(agent)
        
        print("\n" + "="*80)
        print("✅ All tests completed!")
        print("="*80 + "\n")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

