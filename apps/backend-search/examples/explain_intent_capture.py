#!/usr/bin/env python3
"""
Explicación: ¿Cómo captura el sistema la INTENCIÓN del usuario?

Respuesta corta: NO la mide explícitamente. Es una propiedad EMERGENTE
del entrenamiento del modelo de embeddings en millones de textos.
"""

import numpy as np
from fastembed import TextEmbedding

print("="*80)
print("¿Cómo Captura el Sistema la INTENCIÓN del Usuario?")
print("="*80)

# Cargar el modelo de embeddings
model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

# ============================================================================
# PARTE 1: El modelo NO tiene lógica explícita de "intención"
# ============================================================================
print("\n" + "="*80)
print("PARTE 1: El Modelo NO Tiene Lógica Explícita de 'Intención'")
print("="*80)

print("""
❌ El modelo NO hace esto:
   if "hungry" in query and "NOW" in query:
       intention = "quick_meal"
   
❌ NO tiene reglas if/else para detectar intenciones

✅ En cambio, el modelo fue ENTRENADO en millones de textos donde:
   • Vio "I'm hungry" junto a "quick", "fast", "easy"
   • Vio "impress guests" junto a "elegant", "sophisticated", "special"
   • Vio "comfort food" junto a "warm", "hearty", "cozy"
   
   Y aprendió a colocar estos conceptos CERCA en el espacio vectorial.
""")

# ============================================================================
# PARTE 2: Demostración - Queries con misma INTENCIÓN = Vectores similares
# ============================================================================
print("\n" + "="*80)
print("PARTE 2: Queries con Misma INTENCIÓN → Vectores Similares")
print("="*80)

# Grupo 1: Intención = "Quiero algo rápido"
quick_queries = [
    "I'm hungry and need something NOW",
    "quick recipe",
    "fast meal",
    "what can I make in 10 minutes?",
    "I don't have much time",
]

# Grupo 2: Intención = "Quiero impresionar"
impress_queries = [
    "I want to impress my dinner guests",
    "elegant recipe for special occasion",
    "sophisticated dish",
    "something fancy for a date",
    "gourmet meal",
]

def get_embedding(text):
    return list(model.embed([text]))[0]

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

print("\n🔍 Grupo 1: Intención 'RÁPIDO/URGENTE'\n")
quick_embeddings = [get_embedding(q) for q in quick_queries]

print("Similitud entre queries del MISMO grupo (misma intención):\n")
for i, q1 in enumerate(quick_queries[:3]):
    for j, q2 in enumerate(quick_queries[i+1:4], i+1):
        sim = cosine_similarity(quick_embeddings[i], quick_embeddings[j])
        print(f"  '{q1[:40]}...'")
        print(f"  '{q2[:40]}...'")
        print(f"  → Similitud: {sim:.3f}\n")

print("\n🔍 Grupo 2: Intención 'IMPRESIONAR/SOFISTICADO'\n")
impress_embeddings = [get_embedding(q) for q in impress_queries]

print("Similitud entre queries del MISMO grupo (misma intención):\n")
for i, q1 in enumerate(impress_queries[:3]):
    for j, q2 in enumerate(impress_queries[i+1:4], i+1):
        sim = cosine_similarity(impress_embeddings[i], impress_embeddings[j])
        print(f"  '{q1[:40]}...'")
        print(f"  '{q2[:40]}...'")
        print(f"  → Similitud: {sim:.3f}\n")

print("\n📊 Comparación ENTRE grupos (intenciones diferentes):\n")
sim_cross = cosine_similarity(quick_embeddings[0], impress_embeddings[0])
print(f"  '{quick_queries[0]}'")
print(f"  vs")
print(f"  '{impress_queries[0]}'")
print(f"  → Similitud: {sim_cross:.3f}")
print(f"\n  💡 Similitud MENOR porque tienen INTENCIONES diferentes")

# ============================================================================
# PARTE 3: ¿Cómo aprende el modelo estas relaciones?
# ============================================================================
print("\n" + "="*80)
print("PARTE 3: ¿Cómo Aprendió el Modelo Estas Relaciones?")
print("="*80)

print("""
🧠 ENTRENAMIENTO DEL MODELO (BAAI/bge-small-en-v1.5):

1️⃣  CORPUS DE ENTRENAMIENTO (millones de documentos):
   • Artículos de cocina: "quick dinner recipes for busy weeknights"
   • Reseñas: "I was hungry and needed something fast"
   • Blogs: "impress your guests with this elegant dish"
   • Recetas: "sophisticated gourmet meal for special occasions"

2️⃣  OBJETIVO DEL ENTRENAMIENTO:
   • Textos que aparecen en CONTEXTOS SIMILARES → vectores cercanos
   • Textos que aparecen en CONTEXTOS DIFERENTES → vectores lejanos
   
   Ejemplo de contexto:
   - "I'm [MASK]" → "hungry", "starving", "famished" (similares)
   - "Quick [MASK]" → "recipe", "meal", "dish" (similares)

3️⃣  RESULTADO:
   El modelo aprendió que:
   • "hungry" + "NOW" + "quick" → comparten contextos similares
   • "impress" + "guests" + "elegant" → comparten contextos similares
   • Estos dos grupos NO comparten contextos → vectores lejanos

4️⃣  NO HAY LÓGICA EXPLÍCITA:
   ❌ No hay reglas: if "hungry" then intention="quick"
   ✅ Solo matemáticas: vectores cercanos = significado similar
   
💡 La "intención" emerge naturalmente de patrones aprendidos en millones de textos.
""")

# ============================================================================
# PARTE 4: Visualización del Espacio Vectorial (Simplificado)
# ============================================================================
print("\n" + "="*80)
print("PARTE 4: Visualización del Espacio Vectorial (384D → 2D)")
print("="*80)

print("""
📐 Espacio Vectorial Real: 384 dimensiones
   Imposible de visualizar directamente

📊 Proyección simplificada a 2D (solo para ilustrar):
   
   "impress guests" ●────────────────────────● "elegant meal"
                    │                         │
                    │  Región: SOFISTICADO   │
                    │                         │
                    ●─────────────────────────●
                    
                    
                    
   "quick recipe"   ●────────────────────────● "fast meal"
                    │                         │
                    │  Región: RÁPIDO        │
                    │                         │
   "I'm hungry NOW" ●─────────────────────────●
   
   
💡 En el espacio real de 384D:
   • Queries con misma intención están CERCA (distancia coseno pequeña)
   • Queries con intenciones diferentes están LEJOS
   • La búsqueda encuentra el vector más CERCANO al query
""")

# ============================================================================
# PARTE 5: ¿Qué pasa en la búsqueda?
# ============================================================================
print("\n" + "="*80)
print("PARTE 5: ¿Qué Pasa Cuando Haces una Búsqueda?")
print("="*80)

print("""
PASO A PASO:

1️⃣  Usuario escribe: "I'm hungry and need something NOW"
    ↓
    
2️⃣  Sistema genera embedding (vector de 384 números):
    query_vector = [-0.109, -0.018, 0.017, ..., 0.003]
    ↓
    
3️⃣  Sistema calcula distancia coseno con TODOS los chunks en la BD:
    
    "TOMATO & MUSSEL PASTA - Quick 20min recipe"
    recipe_vector = [-0.105, -0.021, 0.019, ..., 0.005]
    similarity = cosine_distance(query_vector, recipe_vector)
    → 0.703 (¡cercano!)
    
    "Christmas Pudding - Traditional 3-hour recipe"
    recipe_vector = [0.089, 0.112, -0.034, ..., -0.022]
    similarity = cosine_distance(query_vector, recipe_vector)
    → 0.412 (lejano)
    
    ↓
    
4️⃣  Sistema ordena por similitud (más cercano primero):
    1. TOMATO & MUSSEL PASTA (0.703) ← Intención: rápido
    2. Quick Fish Pie (0.655) ← Intención: rápido
    3. ... otras recetas rápidas
    
    ↓
    
5️⃣  Usuario recibe recetas que coinciden con su INTENCIÓN
    (aunque no usó palabras exactas como "quick" o "fast")

💡 El sistema NO "detecta" intención explícitamente.
   Solo encuentra vectores CERCANOS, y estos vectores están cercanos
   porque el modelo aprendió esos patrones en el entrenamiento.
""")

# ============================================================================
# PARTE 6: Comparación con Query Explícito
# ============================================================================
print("\n" + "="*80)
print("PARTE 6: Comparación - Explícito vs Implícito")
print("="*80)

queries_comparison = [
    ("quick pasta", "Query EXPLÍCITO (tiene keyword)"),
    ("I need something fast", "Intención IMPLÍCITA (sin keyword 'quick')"),
    ("I'm starving", "Intención IMPLÍCITA (sin keywords de velocidad)"),
]

print("\nComparando embeddings:\n")
embeddings_comp = [get_embedding(q[0]) for q in queries_comparison]

for i, (q1, desc1) in enumerate(queries_comparison):
    for j, (q2, desc2) in enumerate(queries_comparison[i+1:], i+1):
        sim = cosine_similarity(embeddings_comp[i], embeddings_comp[j])
        print(f"  '{q1}' ({desc1})")
        print(f"  vs")
        print(f"  '{q2}' ({desc2})")
        print(f"  → Similitud: {sim:.3f}")
        print()

print("""
💡 Observa:
   • "quick pasta" y "I need something fast" → similitud ALTA
   • Aunque NO usan las mismas palabras
   • El modelo aprendió que ambos expresan la misma INTENCIÓN
   • Sin lógica explícita, solo matemáticas de vectores
""")

# ============================================================================
# RESUMEN FINAL
# ============================================================================
print("\n" + "="*80)
print("📝 RESUMEN: ¿Cómo Captura Intención Sin Medirla?")
print("="*80)

print("""
✅ NO HAY LÓGICA DE "DETECCIÓN DE INTENCIÓN":
   • Sin reglas if/else
   • Sin clasificadores de intención
   • Sin análisis sintáctico

✅ ES GEOMETRÍA EN ESPACIO VECTORIAL:
   • Cada texto → vector de 384 números
   • Textos similares en SIGNIFICADO → vectores CERCANOS
   • Similitud = distancia coseno entre vectores
   
✅ APRENDIDO DURANTE ENTRENAMIENTO:
   • Modelo vio millones de textos
   • Aprendió que "hungry NOW" y "quick recipe" aparecen en contextos similares
   • Los colocó cerca en el espacio vectorial
   • La "intención" emerge de estos patrones

✅ EN LA BÚSQUEDA:
   1. Query → vector
   2. Calcular distancia a todos los chunks
   3. Ordenar por cercanía
   4. Retornar los más cercanos
   
   ¡Eso es todo! Sin magia, solo álgebra lineal.

🎯 ANALOGÍA:
   Es como el GPS: no "entiende" qué es una ciudad,
   pero sabe que París y Lyon están cerca en el mapa (espacio 2D).
   
   Embeddings: "I'm hungry NOW" y "quick recipe" están cerca
   en el mapa semántico (espacio 384D).

🚀 POR ESO FUNCIONA TAN BIEN:
   • No necesitas pensar en todas las posibles formas de expresar una intención
   • El modelo YA aprendió esas relaciones de millones de textos
   • Solo busca "vecinos cercanos" en el espacio vectorial
""")

print("\n" + "="*80)
print("✅ Explicación completada!")
print("="*80)

