#!/usr/bin/env python3
"""
Demo: Why this is semantic search, not plain keyword matching.

Shows the difference between keyword search and embedding-based semantic search.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from recipe_search_agent import RecipeSearchAgent

# Load environment
load_dotenv(Path(__file__).parent / ".env")

# Setup
client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)
agent = RecipeSearchAgent(client)

print("="*80)
print("DEMO: Semantic search vs keyword search")
print("="*80)

# ============================================================================
# EXAMPLE 1: Synonyms and related concepts
# ============================================================================
print("\n" + "="*80)
print("EXAMPLE 1: Synonyms and concepts (no exact keywords required in text)")
print("="*80)

queries_sin_keywords = [
    ("I want something quick and easy", "quick", "easy", "fast"),
    ("healthy meal", "healthy", "nutritious", "light"),
    ("comfort food", "comfort", "hearty", "cozy"),
]

for query, *keywords in queries_sin_keywords:
    print(f"\n🔍 Query: '{query}'")
    print(f"   Keywords you might look for: {keywords}")
    
    results = agent.search(query=query, top_k=3, include_full_recipe=False, include_chunks=False)
    
    if results:
        top = results[0]
        print(f"   ✅ Top match: {top.title} (score: {top.similarity_score:.3f})")
        print(f"   💡 Why? Semantic search understands that:")
        print(f"      • '{query}' is semantically close to the recipe’s traits")
        print(f"      • It does not need the exact words '{keywords[0]}' or '{keywords[1]}'")
        print(f"      • It uses EMBEDDINGS to find conceptually similar recipes")
    else:
        print(f"   ❌ No results")

# ============================================================================
# EXAMPLE 2: Intent-based search
# ============================================================================
print("\n" + "="*80)
print("EXAMPLE 2: Intent-based search (not literal keywords)")
print("="*80)

queries_intenciones = [
    "I'm hungry and need something NOW",
    "What can I make with what I have in the fridge?",
    "I want to impress my dinner guests",
    "Need something for a picnic",
]

for query in queries_intenciones:
    print(f"\n🔍 Query: '{query}'")
    results = agent.search(query=query, top_k=2, include_full_recipe=False, include_chunks=False)
    
    if results:
        print(f"   Top matches:")
        for i, r in enumerate(results, 1):
            print(f"   {i}. {r.title} (score: {r.similarity_score:.3f})")
        print(f"   💡 Vector search captures user intent, not just keywords")
    else:
        print(f"   ❌ No results")

# ============================================================================
# EXAMPLE 3: Side-by-side — what keyword search would miss
# ============================================================================
print("\n" + "="*80)
print("EXAMPLE 3: What would a pure keyword search find?")
print("="*80)

# Query without using exact title tokens
query = "dish with seafood from the ocean"
print(f"\n🔍 Query: '{query}'")
print(f"   Words in query: ['dish', 'seafood', 'ocean']")

results = agent.search(query=query, top_k=3, include_full_recipe=False, include_chunks=False)

if results:
    print(f"\n   ✅ Semantic search returned:")
    for i, r in enumerate(results, 1):
        title_lower = r.title.lower()
        # Check if exact keywords are present
        has_seafood = "seafood" in title_lower
        has_ocean = "ocean" in title_lower
        has_dish = "dish" in title_lower
        
        print(f"   {i}. {r.title} (score: {r.similarity_score:.3f})")
        print(f"      Title contains 'seafood': {has_seafood}")
        print(f"      Title contains 'ocean': {has_ocean}")
        print(f"      Title contains 'dish': {has_dish}")
        
        if not (has_seafood or has_ocean or has_dish):
            print(f"      💡 No exact keyword overlap — still matches the semantic concept")

print(f"\n   📊 Classic keyword search (LIKE, FTS) may miss these hits")
print(f"      because the exact tokens are not in the title.")

# ============================================================================
# EXAMPLE 4: Embeddings in action
# ============================================================================
print("\n" + "="*80)
print("EXAMPLE 4: How EMBEDDINGS work")
print("="*80)

from fastembed import TextEmbedding

model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

# Similar-meaning queries
queries = [
    "quick pasta recipe",
    "fast spaghetti dish",
    "simple noodle meal",
]

print("\n📊 Embeddings for queries that are similar in meaning:\n")
embeddings = {}
for q in queries:
    emb = list(model.embed([q]))[0]
    embeddings[q] = emb
    print(f"   '{q}'")
    print(f"   → 384-dim vector: [{emb[0]:.3f}, {emb[1]:.3f}, {emb[2]:.3f}, ..., {emb[-1]:.3f}]")

# Cosine similarity between embeddings
import numpy as np

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

print(f"\n📐 Cosine similarity between these queries:\n")
for i, q1 in enumerate(queries):
    for q2 in queries[i+1:]:
        sim = cosine_similarity(embeddings[q1], embeddings[q2])
        print(f"   '{q1}' ↔ '{q2}'")
        print(f"   → Similarity: {sim:.3f} (closer to 1.0 = more similar)\n")

print(f"💡 Even with different words, embeddings encode that:")
print(f"   • 'quick' ≈ 'fast' ≈ 'simple'")
print(f"   • 'pasta' ≈ 'spaghetti' ≈ 'noodle'")
print(f"   • 'recipe' ≈ 'dish' ≈ 'meal'")
print(f"\n   That is semantic search: meaning, not surface words.")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "="*80)
print("📝 SUMMARY: Why semantic search?")
print("="*80)

print("""
✅ 1. Uses EMBEDDINGS (384-dimensional vectors)
   • Each recipe becomes a point in a semantic space
   • Each query becomes a vector too
   • Similarity uses COSINE distance (not raw keyword overlap)

✅ 2. Understands meaning, not only tokens
   • "quick" and "fast" land near each other
   • "seafood" and "fish" are neighbors in the space
   • "comfort food" can surface hearty/warm dishes without those exact words

✅ 3. Intent-friendly
   • "I'm hungry NOW" → fast recipes
   • "impress guests" → more elaborate dishes
   • No need to guess exact keywords

✅ 4. Hybrid with exact filters
   • Vector similarity (80%) + full-text on ingredients (20%)
   • Exact filters: category, mood, complexity
   • Combines both approaches

❌ Traditional keyword / FTS search:
   • Mostly exact matches or stemming
   • "quick pasta" may not match "fast spaghetti"
   • Weaker on synonyms and related concepts
   • User intent is implicit, not modeled

🚀 Vector / semantic search:
   • Relevant hits even when wording differs
   • Encodes relationships between concepts
   • Aligns better with how people phrase requests
""")

print("="*80)
print("✅ Demo finished")
print("="*80)
