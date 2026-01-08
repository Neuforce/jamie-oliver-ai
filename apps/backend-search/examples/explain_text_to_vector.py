#!/usr/bin/env python3
"""
Explicación: ¿Cómo un texto se convierte en un vector de 384 dimensiones?

Vamos a desglosar TODO el proceso, desde las palabras hasta los números.
"""

import numpy as np
from fastembed import TextEmbedding

print("="*80)
print("¿Cómo un TEXTO se convierte en un VECTOR de 384 dimensiones?")
print("="*80)

# ============================================================================
# PASO 1: El Input (texto crudo)
# ============================================================================
print("\n" + "="*80)
print("PASO 1: El Input - Texto Crudo")
print("="*80)

text = "quick pasta recipe"
print(f"\nTexto original: '{text}'")
print(f"Tipo: {type(text)}")
print(f"Longitud: {len(text)} caracteres")

# ============================================================================
# PASO 2: Tokenización (texto → tokens numéricos)
# ============================================================================
print("\n" + "="*80)
print("PASO 2: Tokenización - Dividir en 'Tokens'")
print("="*80)

print("""
❓ ¿Qué es un token?
   Un token es una unidad básica de texto que el modelo entiende.
   Puede ser:
   • Una palabra completa: "pasta" → 1 token
   • Parte de una palabra: "running" → "run" + "##ning" (2 tokens)
   • Puntuación: "!" → 1 token
   • Espacio: puede ser parte de un token

📝 BAAI/bge-small-en-v1.5 usa WordPiece tokenizer:
   • Vocabulario de ~30,000 tokens
   • Descompone palabras en subpalabras
   • Convierte cada token a un ID numérico
""")

# Simulación del proceso de tokenización
print(f"\n🔍 Tokenización de '{text}':\n")
print("   Paso 2.1: Dividir en palabras")
words = text.split()
print(f"   Palabras: {words}\n")

print("   Paso 2.2: Convertir cada palabra a token IDs")
print("   (Simulado - el modelo real usa WordPiece)")
token_ids = {
    "quick": 2032,
    "pasta": 8459,
    "recipe": 7394,
}
print(f"   'quick' → Token ID: {token_ids['quick']}")
print(f"   'pasta' → Token ID: {token_ids['pasta']}")
print(f"   'recipe' → Token ID: {token_ids['recipe']}\n")

print("   Resultado: [2032, 8459, 7394] (3 tokens)")
print("\n   💡 El texto ahora es una secuencia de números enteros")

# ============================================================================
# PASO 3: Embedding Table Lookup (token IDs → vectores iniciales)
# ============================================================================
print("\n" + "="*80)
print("PASO 3: Embedding Table - De IDs a Vectores Iniciales")
print("="*80)

print("""
El modelo tiene una TABLA DE EMBEDDINGS:
   • Es una matriz gigante: [vocab_size × embedding_dim]
   • Para BAAI/bge: [30,000 tokens × 384 dimensiones]
   • Cada token tiene su propio vector de 384 números

📊 Tabla de Embeddings (simplificado):
   
   Token ID │ Embedding (384 dims)
   ─────────┼────────────────────────────────────
   0        │ [0.023, -0.145, 0.067, ..., 0.091]
   1        │ [-0.089, 0.234, -0.012, ..., 0.156]
   ...      │ ...
   2032     │ [-0.109, -0.018, 0.017, ..., 0.003]  ← "quick"
   ...      │ ...
   8459     │ [0.234, -0.156, 0.089, ..., -0.045]  ← "pasta"
   ...      │ ...
   7394     │ [0.067, 0.123, -0.091, ..., 0.078]   ← "recipe"
   ...      │ ...
   29999    │ [0.145, -0.067, 0.234, ..., -0.023]

🔍 Lookup de cada token:
""")

# Simulación de embeddings iniciales
embedding_quick = np.random.randn(384) * 0.1
embedding_pasta = np.random.randn(384) * 0.1
embedding_recipe = np.random.randn(384) * 0.1

print(f"\n   Token 'quick' (ID: 2032)")
print(f"   → Vector inicial: [{embedding_quick[0]:.3f}, {embedding_quick[1]:.3f}, ..., {embedding_quick[-1]:.3f}]")
print(f"      (384 números)\n")

print(f"   Token 'pasta' (ID: 8459)")
print(f"   → Vector inicial: [{embedding_pasta[0]:.3f}, {embedding_pasta[1]:.3f}, ..., {embedding_pasta[-1]:.3f}]")
print(f"      (384 números)\n")

print(f"   Token 'recipe' (ID: 7394)")
print(f"   → Vector inicial: [{embedding_recipe[0]:.3f}, {embedding_recipe[1]:.3f}, ..., {embedding_recipe[-1]:.3f}]")
print(f"      (384 números)\n")

print("   Tenemos ahora: 3 vectores de 384 dimensiones")
print("   Forma: [3 tokens × 384 dims]\n")

print("   💡 Estos son embeddings ESTÁTICOS (no cambian entre queries)")

# ============================================================================
# PASO 4: Transformer Encoder (procesa contexto)
# ============================================================================
print("\n" + "="*80)
print("PASO 4: Transformer Encoder - Procesar Contexto")
print("="*80)

print("""
🧠 AQUÍ ESTÁ LA MAGIA - El Transformer:

Los embeddings iniciales son solo el punto de partida.
El Transformer (arquitectura BERT-like) procesa estos vectores para:
   • Entender el CONTEXTO de cada palabra
   • Capturar relaciones entre palabras
   • Ajustar los vectores según el significado global

📐 Arquitectura del Transformer (BAAI/bge-small-en-v1.5):
   
   Input: [3 tokens × 384 dims]
      ↓
   ┌─────────────────────────────────────┐
   │ TRANSFORMER ENCODER (12 capas)      │
   │                                     │
   │  Capa 1: Self-Attention +           │
   │          Feed-Forward               │
   │     ↓                               │
   │  Capa 2: Self-Attention +           │
   │          Feed-Forward               │
   │     ↓                               │
   │  ...                                │
   │     ↓                               │
   │  Capa 12: Self-Attention +          │
   │           Feed-Forward              │
   └─────────────────────────────────────┘
      ↓
   Output: [3 tokens × 384 dims]
      (ajustados según contexto)

🔍 ¿Qué hace SELF-ATTENTION?

Ejemplo con "quick pasta recipe":
   
   Palabra "pasta" mira a:
   • "quick" → ¿Es pasta rápida? (peso: 0.6)
   • "pasta" → Sí mismo (peso: 0.3)
   • "recipe" → ¿Receta de pasta? (peso: 0.8)
   
   Y ajusta su vector según estos contextos:
   
   vector_pasta_nuevo = 
       0.6 * vector_quick +
       0.3 * vector_pasta +
       0.8 * vector_recipe
   
   💡 Ahora "pasta" tiene información de TODO el contexto

Este proceso se repite 12 veces (12 capas).
Cada capa captura relaciones más abstractas.

🎯 Resultado después del Transformer:
   • Vector de "quick" está ajustado por "pasta" y "recipe"
   • Vector de "pasta" está ajustado por "quick" y "recipe"
   • Vector de "recipe" está ajustado por "quick" y "pasta"
   
   Cada vector ahora REPRESENTA EL CONTEXTO COMPLETO
""")

# ============================================================================
# PASO 5: Pooling (múltiples vectores → un solo vector)
# ============================================================================
print("\n" + "="*80)
print("PASO 5: Pooling - Combinar en UN Solo Vector")
print("="*80)

print("""
🎯 Problema: Tenemos 3 vectores (uno por token), pero queremos 1 solo.

💡 Solución: POOLING (combinar vectores)

Estrategias de pooling:

A) MEAN POOLING (promedio):
   vector_final = (vector_quick + vector_pasta + vector_recipe) / 3
   
   ✅ Más usado en embeddings de texto
   ✅ Captura información de todos los tokens
   ✅ BAAI/bge-small-en-v1.5 usa mean pooling

B) CLS TOKEN (primer token especial):
   vector_final = vector_[CLS]
   
   ✅ Usado en BERT original
   ❌ Ignora información de otros tokens

C) MAX POOLING:
   Para cada dimensión, toma el valor máximo de todos los tokens
   
   ❌ Menos común para embeddings

📊 Proceso de Mean Pooling:
""")

print("\n   Vectores después del Transformer:")
print(f"   'quick':  [{embedding_quick[0]:.3f}, {embedding_quick[1]:.3f}, ..., {embedding_quick[-1]:.3f}]")
print(f"   'pasta':  [{embedding_pasta[0]:.3f}, {embedding_pasta[1]:.3f}, ..., {embedding_pasta[-1]:.3f}]")
print(f"   'recipe': [{embedding_recipe[0]:.3f}, {embedding_recipe[1]:.3f}, ..., {embedding_recipe[-1]:.3f}]\n")

# Simular mean pooling
final_embedding = (embedding_quick + embedding_pasta + embedding_recipe) / 3

print("   Mean Pooling (promedio por dimensión):")
print(f"   Dim 0: ({embedding_quick[0]:.3f} + {embedding_pasta[0]:.3f} + {embedding_recipe[0]:.3f}) / 3 = {final_embedding[0]:.3f}")
print(f"   Dim 1: ({embedding_quick[1]:.3f} + {embedding_pasta[1]:.3f} + {embedding_recipe[1]:.3f}) / 3 = {final_embedding[1]:.3f}")
print("   ...")
print(f"   Dim 383: ({embedding_quick[-1]:.3f} + {embedding_pasta[-1]:.3f} + {embedding_recipe[-1]:.3f}) / 3 = {final_embedding[-1]:.3f}\n")

print(f"   Vector final: [{final_embedding[0]:.3f}, {final_embedding[1]:.3f}, ..., {final_embedding[-1]:.3f}]")
print(f"   Dimensiones: {final_embedding.shape[0]}\n")

print("   💡 Este vector REPRESENTA el significado completo de 'quick pasta recipe'")

# ============================================================================
# PASO 6: Normalización (opcional pero importante)
# ============================================================================
print("\n" + "="*80)
print("PASO 6: Normalización - Estandarizar el Vector")
print("="*80)

print("""
🎯 Normalización L2 (unit norm):
   Escalar el vector para que tenga longitud = 1.0
   
   Fórmula:
   vector_normalizado = vector / ||vector||
   
   Donde ||vector|| = sqrt(sum(x² for x in vector))

📊 ¿Por qué normalizar?
   • Distancia coseno se simplifica a dot product
   • Todos los vectores tienen la misma "magnitud"
   • Solo importa la DIRECCIÓN, no la longitud
""")

norm = np.linalg.norm(final_embedding)
normalized_embedding = final_embedding / norm

print(f"\n   Vector antes de normalizar:")
print(f"   Norma (longitud): {norm:.3f}")
print(f"   Vector: [{final_embedding[0]:.3f}, {final_embedding[1]:.3f}, ..., {final_embedding[-1]:.3f}]\n")

print(f"   Vector después de normalizar:")
print(f"   Norma (longitud): {np.linalg.norm(normalized_embedding):.3f} (siempre 1.0)")
print(f"   Vector: [{normalized_embedding[0]:.3f}, {normalized_embedding[1]:.3f}, ..., {normalized_embedding[-1]:.3f}]\n")

print("   💡 El vector normalizado es el EMBEDDING FINAL")

# ============================================================================
# PASO 7: Demostración REAL con el modelo
# ============================================================================
print("\n" + "="*80)
print("PASO 7: Demostración REAL - Todo el Proceso")
print("="*80)

print(f"\n🚀 Usando el modelo REAL: BAAI/bge-small-en-v1.5\n")

model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

# Generar embedding real
texts = ["quick pasta recipe", "fast spaghetti dish", "chocolate cake dessert"]

print("   Generando embeddings...\n")
embeddings_real = list(model.embed(texts))

for text, emb in zip(texts, embeddings_real):
    print(f"   '{text}'")
    print(f"   → Vector: [{emb[0]:.3f}, {emb[1]:.3f}, {emb[2]:.3f}, ..., {emb[-1]:.3f}]")
    print(f"   → Dimensiones: {len(emb)}")
    print(f"   → Norma: {np.linalg.norm(emb):.3f}")
    print()

# ============================================================================
# PASO 8: ¿Qué representa cada dimensión?
# ============================================================================
print("\n" + "="*80)
print("PASO 8: ¿Qué Representa Cada Dimensión?")
print("="*80)

print("""
❓ Pregunta común: ¿Qué significa cada uno de los 384 números?

💡 Respuesta: NO tienen un significado directo interpretable.

📊 Cada dimensión es una CARACTERÍSTICA LATENTE:
   • NO es "velocidad" o "sabor" o "dificultad"
   • Son combinaciones abstractas aprendidas durante el entrenamiento
   • El modelo descubrió que estas 384 dimensiones son óptimas
     para capturar relaciones semánticas

🎯 Analogía:
   Es como los colores RGB:
   • (255, 0, 0) = rojo
   • Pero el "0" del verde no significa "ausencia de verde"
   • Es solo una REPRESENTACIÓN numérica
   
   En embeddings:
   • [0.123, -0.456, ...] = "quick pasta recipe"
   • Pero 0.123 en dim 0 no significa algo específico
   • Es solo una REPRESENTACIÓN aprendida

🔬 Lo que SÍ sabemos:
   • Vectores cercanos = significados similares
   • Dirección del vector = tipo de concepto
   • Magnitud (antes de normalizar) = qué tan "fuerte" es el concepto
   
🧪 Ejemplo de "direcciones" en el espacio vectorial:
   
   vector("quick") - vector("slow") ≈ vector("fast") - vector("sluggish")
   
   Existe una "dirección" para el concepto de "velocidad"
   pero NO es una dimensión específica, es una COMBINACIÓN de todas
""")

# ============================================================================
# RESUMEN COMPLETO
# ============================================================================
print("\n" + "="*80)
print("📝 RESUMEN: Texto → Vector de 384 Dimensiones")
print("="*80)

print("""
PROCESO COMPLETO:

1️⃣  TOKENIZACIÓN
    "quick pasta recipe" 
    → ["quick", "pasta", "recipe"]
    → [2032, 8459, 7394]

2️⃣  EMBEDDING TABLE LOOKUP
    [2032, 8459, 7394]
    → [vector_quick, vector_pasta, vector_recipe]
    → Matriz [3 × 384]

3️⃣  TRANSFORMER ENCODER (12 capas)
    • Self-Attention: cada token mira a todos los demás
    • Feed-Forward: procesamiento no-lineal
    • Repite 12 veces
    → Vectores ajustados por CONTEXTO

4️⃣  POOLING (Mean Pooling)
    [3 vectores × 384 dims]
    → Promedio de todos los tokens
    → [1 vector × 384 dims]

5️⃣  NORMALIZACIÓN
    Vector / ||vector||
    → Norma = 1.0
    → EMBEDDING FINAL

🎯 RESULTADO:
    "quick pasta recipe" 
    → [-0.109, -0.018, 0.017, ..., 0.003]
    → 384 números que REPRESENTAN el significado completo

⚡ VELOCIDAD:
    • Todo este proceso: ~10-50ms en CPU
    • En GPU: ~1-5ms
    • El modelo está OPTIMIZADO para ser rápido

💾 TAMAÑO DEL MODELO:
    • BAAI/bge-small-en-v1.5: ~134 MB
    • Parametros: ~33 millones
    • Compacto y eficiente

🚀 USO EN BÚSQUEDA:
    1. Usuario escribe query → Embedding (50ms)
    2. Compara con todos los chunks en BD → pgvector (200ms)
    3. Retorna top K resultados
    
    Total: ~250ms para buscar en miles de recetas
""")

print("\n" + "="*80)
print("✅ Explicación completada!")
print("="*80)

