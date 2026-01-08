#!/usr/bin/env python3
"""
Demo: ¿Por qué es búsqueda SEMÁNTICA y no solo keyword matching?

Este script demuestra la diferencia entre búsqueda por palabras clave
y búsqueda semántica usando embeddings.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from recipe_search_agent import RecipeSearchAgent, SearchFilters

# Load environment
load_dotenv(Path(__file__).parent / ".env")

# Setup
client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)
agent = RecipeSearchAgent(client)

print("="*80)
print("DEMO: Búsqueda Semántica vs Búsqueda por Keywords")
print("="*80)

# ============================================================================
# EJEMPLO 1: Sinónimos y Conceptos Relacionados
# ============================================================================
print("\n" + "="*80)
print("EJEMPLO 1: Sinónimos y Conceptos (NO hay keywords exactos en el texto)")
print("="*80)

queries_sin_keywords = [
    ("I want something quick and easy", "quick", "easy", "fast"),
    ("healthy meal", "healthy", "nutritious", "light"),
    ("comfort food", "comfort", "hearty", "cozy"),
]

for query, *keywords in queries_sin_keywords:
    print(f"\n🔍 Query: '{query}'")
    print(f"   Keywords buscadas: {keywords}")
    
    results = agent.search(query=query, top_k=3, include_full_recipe=False, include_chunks=False)
    
    if results:
        top = results[0]
        print(f"   ✅ Top match: {top.title} (score: {top.similarity_score:.3f})")
        print(f"   💡 ¿Por qué? La búsqueda semántica entiende que:")
        print(f"      • '{query}' tiene un SIGNIFICADO similar a las características de la receta")
        print(f"      • NO necesita las palabras exactas '{keywords[0]}' o '{keywords[1]}'")
        print(f"      • Usa EMBEDDINGS para encontrar recetas conceptualmente similares")
    else:
        print(f"   ❌ No results")

# ============================================================================
# EJEMPLO 2: Búsqueda por Intención (Intent-based)
# ============================================================================
print("\n" + "="*80)
print("EJEMPLO 2: Búsqueda por INTENCIÓN (no por palabras clave)")
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
        print(f"   💡 La búsqueda vectorial captura la INTENCIÓN del usuario, no solo keywords")
    else:
        print(f"   ❌ No results")

# ============================================================================
# EJEMPLO 3: Comparación Directa - Keyword vs Semantic
# ============================================================================
print("\n" + "="*80)
print("EJEMPLO 3: Comparación - ¿Qué encontraría una búsqueda por keywords?")
print("="*80)

# Búsqueda que NO tiene las palabras exactas
query = "dish with seafood from the ocean"
print(f"\n🔍 Query: '{query}'")
print(f"   Palabras en el query: ['dish', 'seafood', 'ocean']")

results = agent.search(query=query, top_k=3, include_full_recipe=False, include_chunks=False)

if results:
    print(f"\n   ✅ Búsqueda SEMÁNTICA encontró:")
    for i, r in enumerate(results, 1):
        title_lower = r.title.lower()
        # Check if exact keywords are present
        has_seafood = "seafood" in title_lower
        has_ocean = "ocean" in title_lower
        has_dish = "dish" in title_lower
        
        print(f"   {i}. {r.title} (score: {r.similarity_score:.3f})")
        print(f"      Tiene keyword 'seafood': {has_seafood}")
        print(f"      Tiene keyword 'ocean': {has_ocean}")
        print(f"      Tiene keyword 'dish': {has_dish}")
        
        if not (has_seafood or has_ocean or has_dish):
            print(f"      💡 ¡NO tiene NINGUNA keyword exacta! Pero entiende el CONCEPTO semántico")

print(f"\n   📊 Una búsqueda tradicional por keywords (LIKE, FTS) NO encontraría estas recetas")
print(f"      porque las palabras exactas no están presentes.")

# ============================================================================
# EJEMPLO 4: Embeddings en Acción
# ============================================================================
print("\n" + "="*80)
print("EJEMPLO 4: ¿Cómo funcionan los EMBEDDINGS?")
print("="*80)

from fastembed import TextEmbedding

model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

# Generar embeddings para queries similares
queries = [
    "quick pasta recipe",
    "fast spaghetti dish",
    "simple noodle meal",
]

print("\n📊 Embeddings para queries SIMILARES en significado:\n")
embeddings = {}
for q in queries:
    emb = list(model.embed([q]))[0]
    embeddings[q] = emb
    print(f"   '{q}'")
    print(f"   → Vector de 384 dimensiones: [{emb[0]:.3f}, {emb[1]:.3f}, {emb[2]:.3f}, ..., {emb[-1]:.3f}]")

# Calcular similitud coseno entre embeddings
import numpy as np

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

print(f"\n📐 Similitud COSENO entre estos queries:\n")
for i, q1 in enumerate(queries):
    for q2 in queries[i+1:]:
        sim = cosine_similarity(embeddings[q1], embeddings[q2])
        print(f"   '{q1}' ↔ '{q2}'")
        print(f"   → Similitud: {sim:.3f} (más cercano a 1.0 = más similar)\n")

print(f"💡 Aunque usan PALABRAS DIFERENTES, los embeddings capturan que:")
print(f"   • 'quick' ≈ 'fast' ≈ 'simple'")
print(f"   • 'pasta' ≈ 'spaghetti' ≈ 'noodle'")
print(f"   • 'recipe' ≈ 'dish' ≈ 'meal'")
print(f"\n   Esto es lo que hace la búsqueda SEMÁNTICA: entiende SIGNIFICADO, no solo palabras.")

# ============================================================================
# RESUMEN
# ============================================================================
print("\n" + "="*80)
print("📝 RESUMEN: ¿Por qué es Búsqueda SEMÁNTICA?")
print("="*80)

print("""
✅ 1. USA EMBEDDINGS (vectores de 384 dimensiones)
   • Cada receta se convierte en un vector en un espacio semántico
   • Cada query también se convierte en un vector
   • La similitud se calcula con DISTANCIA COSENO (no keyword matching)

✅ 2. ENTIENDE SIGNIFICADO, NO SOLO PALABRAS
   • "quick" y "fast" son vectores similares
   • "seafood" y "fish" están cerca en el espacio vectorial
   • "comfort food" encuentra recetas hearty/warm sin esas palabras exactas

✅ 3. BÚSQUEDA POR INTENCIÓN
   • "I'm hungry NOW" → recetas rápidas
   • "impress guests" → recetas elaboradas
   • Sin necesidad de keywords específicas

✅ 4. COMBINA CON FILTROS EXACTOS (Híbrido)
   • Vector similarity (80%) + Full-Text Search (20%)
   • Filtros exactos: category, mood, complexity
   • Lo mejor de ambos mundos

❌ Búsqueda tradicional (keywords/FTS):
   • Solo encuentra coincidencias EXACTAS o stems
   • "quick pasta" NO encuentra "fast spaghetti"
   • No entiende sinónimos ni conceptos relacionados
   • No captura intención del usuario

🚀 Búsqueda vectorial/semántica:
   • Encuentra resultados relevantes aunque NO tengan las palabras exactas
   • Entiende relaciones semánticas entre conceptos
   • Captura la INTENCIÓN detrás del query
   • Más inteligente y natural para el usuario
""")

print("="*80)
print("✅ Demo completado!")
print("="*80)

