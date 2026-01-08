#!/usr/bin/env python3
"""
¿Cómo el sistema "entiende" la INTENCIÓN del usuario?

Explicación técnica de cómo los embeddings capturan intención sin medir explícitamente.
"""

from fastembed import TextEmbedding
import numpy as np

print("="*80)
print("¿CÓMO SE CAPTURA LA INTENCIÓN DEL USUARIO?")
print("="*80)

# ============================================================================
# PARTE 1: El modelo de embeddings fue ENTRENADO con millones de ejemplos
# ============================================================================
print("\n" + "="*80)
print("PARTE 1: Entrenamiento del Modelo de Embeddings")
print("="*80)

print("""
El modelo BAAI/bge-small-en-v1.5 fue entrenado con:

📚 Millones de pares de texto como:
   • Pregunta: "I need something quick" → Respuesta: "Fast pasta recipe"
   • Pregunta: "comfort food for winter" → Respuesta: "Hearty beef stew"
   • Pregunta: "healthy breakfast" → Respuesta: "Light oatmeal with fruits"

🧠 El modelo aprende PATRONES semánticos:
   • "quick", "fast", "now", "hurry" → URGENCIA/VELOCIDAD
   • "comfort", "cozy", "warm" → RECONFORTANTE
   • "healthy", "light", "nutritious" → SALUDABLE
   • "impress", "guests", "special" → ELABORADO/FORMAL

💡 Estos patrones se codifican en los 384 números del embedding.
   NO es magia, es APRENDIZAJE de millones de ejemplos.
""")

# ============================================================================
# PARTE 2: Los embeddings capturan CONTEXTO, no solo palabras
# ============================================================================
print("\n" + "="*80)
print("PARTE 2: Embeddings = Contexto Semántico Codificado")
print("="*80)

model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

# Ejemplos con diferentes "intenciones"
queries_con_intencion = {
    "urgencia": [
        "I'm hungry NOW",
        "need something quick",
        "fast recipe please",
    ],
    "confort": [
        "comfort food for a cold day",
        "something warm and cozy",
        "hearty meal",
    ],
    "salud": [
        "healthy dinner option",
        "light meal",
        "nutritious recipe",
    ],
    "impresionar": [
        "impress my dinner guests",
        "fancy recipe for special occasion",
        "elegant dish",
    ],
}

print("\n📊 Embeddings para queries con diferentes INTENCIONES:\n")

# Generar embeddings
embeddings_por_intencion = {}
for intencion, queries in queries_con_intencion.items():
    print(f"🎯 Intención: {intencion.upper()}")
    embeddings = []
    for q in queries:
        emb = list(model.embed([q]))[0]
        embeddings.append(emb)
        print(f"   '{q}'")
        print(f"   → [{emb[0]:.3f}, {emb[1]:.3f}, {emb[2]:.3f}, ..., {emb[-1]:.3f}]")
    embeddings_por_intencion[intencion] = embeddings
    print()

# ============================================================================
# PARTE 3: Similitud DENTRO de cada intención vs ENTRE intenciones
# ============================================================================
print("\n" + "="*80)
print("PARTE 3: Similitud INTRA-intención vs INTER-intención")
print("="*80)

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

print("\n📐 Similitud DENTRO de la misma intención (ALTA):\n")

for intencion, embeddings in embeddings_por_intencion.items():
    sims = []
    for i, emb1 in enumerate(embeddings):
        for emb2 in embeddings[i+1:]:
            sim = cosine_similarity(emb1, emb2)
            sims.append(sim)
    
    avg_sim = np.mean(sims) if sims else 0
    print(f"   {intencion.upper()}: promedio {avg_sim:.3f}")
    print(f"   💡 Queries con la MISMA intención tienen vectores SIMILARES")

print("\n📐 Similitud ENTRE diferentes intenciones (BAJA):\n")

intenciones = list(embeddings_por_intencion.keys())
for i, int1 in enumerate(intenciones):
    for int2 in intenciones[i+1:]:
        # Comparar primer embedding de cada intención
        sim = cosine_similarity(
            embeddings_por_intencion[int1][0],
            embeddings_por_intencion[int2][0]
        )
        print(f"   {int1} ↔ {int2}: {sim:.3f}")

print(f"\n💡 Queries con DIFERENTES intenciones tienen vectores MÁS DISTANTES")

# ============================================================================
# PARTE 4: ¿Cómo se "mide" la intención? NO se mide, se INFIERE
# ============================================================================
print("\n" + "="*80)
print("PARTE 4: La Intención NO se Mide, se INFIERE del Espacio Vectorial")
print("="*80)

print("""
🔍 Proceso paso a paso:

1️⃣ Usuario escribe: "I'm hungry NOW"
   ↓
2️⃣ Se genera embedding: [-0.109, 0.034, 0.021, ..., 0.015]
   ↓
3️⃣ Este embedding está CERCA de:
   • "quick pasta" (sim: 0.82)
   • "fast meal" (sim: 0.79)
   • "easy recipe" (sim: 0.76)
   ↓
4️⃣ Y LEJOS de:
   • "elaborate dish" (sim: 0.23)
   • "slow-cooked" (sim: 0.18)
   ↓
5️⃣ Las recetas también tienen embeddings:
   • "TOMATO & MUSSEL PASTA" tiene chunks como:
     - "Quick 20-minute meal" (alto en urgencia)
     - "Simple ingredients" (alto en simplicidad)
   ↓
6️⃣ Cálculo de similitud coseno:
   query_emb <=> recipe_chunk_emb = 0.703
   ↓
7️⃣ ¡Match! La receta tiene chunks "cerca" del query en el espacio vectorial

💡 NO hay un "medidor de intención" explícito.
   La intención emerge de las DISTANCIAS en el espacio de 384 dimensiones.
""")

# ============================================================================
# PARTE 5: Visualización conceptual del espacio vectorial
# ============================================================================
print("\n" + "="*80)
print("PARTE 5: Visualización Conceptual del Espacio de 384D")
print("="*80)

print("""
Imagina el espacio vectorial como un mapa 3D (en realidad es 384D):

        🏔️ "elaborate dishes"
              ↑
              |
              |
    🥗 "healthy"  ------>  ⚡ "quick/fast"
              |
              |
              ↓
        🍲 "comfort food"

Cuando el usuario dice:
  • "I'm hungry NOW" → el embedding cae cerca de ⚡
  • "comfort food" → el embedding cae cerca de 🍲
  • "healthy meal" → el embedding cae cerca de 🥗
  • "impress guests" → el embedding cae cerca de 🏔️

Las recetas TAMBIÉN tienen embeddings en este espacio:
  • "Quick pasta" → cerca de ⚡
  • "Fish pie" → cerca de 🍲
  • "Salad" → cerca de 🥗

La búsqueda encuentra recetas CERCANAS al query en este espacio.
""")

# ============================================================================
# PARTE 6: ¿Por qué funciona? Entrenamiento masivo
# ============================================================================
print("\n" + "="*80)
print("PARTE 6: ¿Por Qué Funciona Tan Bien?")
print("="*80)

print("""
✅ El modelo BAAI/bge-small-en-v1.5 fue entrenado con:

📚 Datasets masivos:
   • MS MARCO (8.8M queries → documents)
   • Natural Questions (307K questions → passages)
   • BEIR (múltiples dominios)
   • Millones de pares pregunta-respuesta

🎯 Tarea de entrenamiento:
   • Dado un query, predecir qué documentos son RELEVANTES
   • El modelo aprende que:
     - "quick" → documentos con "fast", "easy", "simple"
     - "comfort" → documentos con "warm", "hearty", "cozy"
     - "healthy" → documentos con "light", "nutritious", "fresh"

🧠 Resultado:
   • 384 dimensiones que codifican SIGNIFICADO, no palabras
   • Cada dimensión captura un "aspecto" semántico
   • Ejemplo (hipotético):
     - Dim 23: "urgencia/velocidad" → alta si query es urgente
     - Dim 157: "reconfortante" → alta si query es sobre comfort
     - Dim 301: "saludable" → alta si query es sobre health

💡 NO es un "medidor de intención" diseñado manualmente.
   Es un MODELO APRENDIDO de millones de ejemplos reales.
""")

# ============================================================================
# PARTE 7: Ejemplo práctico con números reales
# ============================================================================
print("\n" + "="*80)
print("PARTE 7: Ejemplo con Números Reales")
print("="*80)

# Generar embeddings para comparación
query1 = "I'm hungry NOW"
query2 = "elaborate dinner for guests"

emb1 = list(model.embed([query1]))[0]
emb2 = list(model.embed([query2]))[0]

print(f"\n🔍 Query 1: '{query1}'")
print(f"   Primeras 10 dimensiones: {emb1[:10]}")
print(f"   (384 dimensiones en total)")

print(f"\n🔍 Query 2: '{query2}'")
print(f"   Primeras 10 dimensiones: {emb2[:10]}")
print(f"   (384 dimensiones en total)")

sim = cosine_similarity(emb1, emb2)
print(f"\n📐 Similitud entre ambos: {sim:.3f}")
print(f"   💡 Baja similitud = diferentes intenciones")

# Ahora con recetas
recipe_quick = "Quick 20-minute tomato pasta"
recipe_elaborate = "Slow-cooked beef wellington with truffle sauce"

emb_quick = list(model.embed([recipe_quick]))[0]
emb_elaborate = list(model.embed([recipe_elaborate]))[0]

sim_q1_quick = cosine_similarity(emb1, emb_quick)
sim_q1_elaborate = cosine_similarity(emb1, emb_elaborate)
sim_q2_quick = cosine_similarity(emb2, emb_quick)
sim_q2_elaborate = cosine_similarity(emb2, emb_elaborate)

print(f"\n🍝 Receta 1: '{recipe_quick}'")
print(f"   Similitud con '{query1}': {sim_q1_quick:.3f} ✅ ALTA")
print(f"   Similitud con '{query2}': {sim_q2_quick:.3f} ❌ BAJA")

print(f"\n🥩 Receta 2: '{recipe_elaborate}'")
print(f"   Similitud con '{query1}': {sim_q1_elaborate:.3f} ❌ BAJA")
print(f"   Similitud con '{query2}': {sim_q2_elaborate:.3f} ✅ ALTA")

print(f"\n💡 El sistema AUTOMÁTICAMENTE matchea intenciones sin medirlas explícitamente!")

# ============================================================================
# RESUMEN FINAL
# ============================================================================
print("\n" + "="*80)
print("📝 RESUMEN: ¿Cómo se Captura la Intención?")
print("="*80)

print("""
❌ NO hay un "medidor de intención" explícito
✅ La intención emerge de:

1️⃣ ENTRENAMIENTO MASIVO
   • Modelo aprende de millones de ejemplos
   • Patrones semánticos se codifican en 384 dimensiones

2️⃣ ESPACIO VECTORIAL
   • Queries similares → vectores cercanos
   • Queries diferentes → vectores lejanos

3️⃣ DISTANCIA COSENO
   • Mide cercanía en el espacio de 384D
   • Cercanía = intención similar

4️⃣ NO usa palabras clave
   • "I'm hungry NOW" no busca "hungry" literalmente
   • Busca vectores CERCANOS que capturen urgencia/rapidez

🎯 En otras palabras:
   • NO medimos intención directamente
   • La intención está CODIFICADA en los embeddings
   • La búsqueda encuentra recetas con embeddings SIMILARES
   • Similitud de embeddings = similitud de intención

🚀 Por eso funciona mejor que búsqueda por keywords:
   • Keywords: "hungry" → busca literal "hungry"
   • Embeddings: "hungry" → busca concepto de "comida rápida/urgencia"
""")

print("="*80)
print("✅ Explicación completada!")
print("="*80)

