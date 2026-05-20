#!/usr/bin/env python3
"""
How does text become a 384-dimensional vector?

We walk through the whole process, from words to numbers.
"""

import numpy as np
from fastembed import TextEmbedding

print("=" * 80)
print("How does TEXT become a 384-dimensional VECTOR?")
print("=" * 80)

# ============================================================================
# STEP 1: Input (raw text)
# ============================================================================
print("\n" + "=" * 80)
print("STEP 1: Input — Raw Text")
print("=" * 80)

text = "quick pasta recipe"
print(f"\nOriginal text: '{text}'")
print(f"Type: {type(text)}")
print(f"Length: {len(text)} characters")

# ============================================================================
# STEP 2: Tokenization (text → numeric tokens)
# ============================================================================
print("\n" + "=" * 80)
print("STEP 2: Tokenization — Split into tokens")
print("=" * 80)

print("""
❓ What is a token?
   A token is a basic unit of text the model understands.
   It can be:
   • A full word: "pasta" → 1 token
   • Part of a word: "running" → "run" + "##ning" (2 tokens)
   • Punctuation: "!" → 1 token
   • Whitespace: may be part of a token

📝 BAAI/bge-small-en-v1.5 uses a WordPiece tokenizer:
   • Vocabulary of ~30,000 tokens
   • Splits words into subwords
   • Maps each token to a numeric ID
""")

# Simulated tokenization
print(f"\n🔍 Tokenizing '{text}':\n")
print("   Step 2.1: Split on spaces")
words = text.split()
print(f"   Words: {words}\n")

print("   Step 2.2: Map each word to token IDs")
print("   (Simulated — the real model uses WordPiece)")
token_ids = {
    "quick": 2032,
    "pasta": 8459,
    "recipe": 7394,
}
print(f"   'quick' → token ID: {token_ids['quick']}")
print(f"   'pasta' → token ID: {token_ids['pasta']}")
print(f"   'recipe' → token ID: {token_ids['recipe']}\n")

print("   Result: [2032, 8459, 7394] (3 tokens)")
print("\n   💡 The text is now a sequence of integers")

# ============================================================================
# STEP 3: Embedding table lookup (token IDs → initial vectors)
# ============================================================================
print("\n" + "=" * 80)
print("STEP 3: Embedding Table — From IDs to Initial Vectors")
print("=" * 80)

print("""
The model has an EMBEDDING TABLE:
   • One large matrix: [vocab_size × embedding_dim]
   • For BAAI/bge: [30,000 tokens × 384 dimensions]
   • Each token has its own 384-number vector

📊 Embedding table (simplified):

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

🔍 Lookup each token:
""")

# Simulated initial embeddings
embedding_quick = np.random.randn(384) * 0.1
embedding_pasta = np.random.randn(384) * 0.1
embedding_recipe = np.random.randn(384) * 0.1

print(f"\n   Token 'quick' (ID: 2032)")
print(
    f"   → Initial vector: [{embedding_quick[0]:.3f}, {embedding_quick[1]:.3f}, ..., {embedding_quick[-1]:.3f}]"
)
print(f"      (384 numbers)\n")

print(f"   Token 'pasta' (ID: 8459)")
print(
    f"   → Initial vector: [{embedding_pasta[0]:.3f}, {embedding_pasta[1]:.3f}, ..., {embedding_pasta[-1]:.3f}]"
)
print(f"      (384 numbers)\n")

print(f"   Token 'recipe' (ID: 7394)")
print(
    f"   → Initial vector: [{embedding_recipe[0]:.3f}, {embedding_recipe[1]:.3f}, ..., {embedding_recipe[-1]:.3f}]"
)
print(f"      (384 numbers)\n")

print("   We now have: 3 vectors of 384 dimensions")
print("   Shape: [3 tokens × 384 dims]\n")

print("   💡 These are STATIC embeddings (unchanged across queries)")

# ============================================================================
# STEP 4: Transformer encoder (context)
# ============================================================================
print("\n" + "=" * 80)
print("STEP 4: Transformer Encoder — Process Context")
print("=" * 80)

print("""
🧠 THIS IS WHERE THE MAGIC HAPPENS — the Transformer:

Initial embeddings are only the starting point.
The Transformer (BERT-like) processes these vectors to:
   • Capture CONTEXT for each word
   • Model relationships between words
   • Adjust vectors for global meaning

📐 Transformer stack (BAAI/bge-small-en-v1.5):

   Input: [3 tokens × 384 dims]
      ↓
   ┌─────────────────────────────────────┐
   │ TRANSFORMER ENCODER (12 layers)     │
   │                                     │
   │  Layer 1: Self-Attention +          │
   │           Feed-Forward              │
   │     ↓                               │
   │  Layer 2: Self-Attention +          │
   │           Feed-Forward              │
   │     ↓                               │
   │  ...                                │
   │     ↓                               │
   │  Layer 12: Self-Attention +          │
   │            Feed-Forward             │
   └─────────────────────────────────────┘
      ↓
   Output: [3 tokens × 384 dims]
      (adjusted for context)

🔍 What does SELF-ATTENTION do?

Example with "quick pasta recipe":

   The word "pasta" looks at:
   • "quick" → is it fast pasta? (weight: 0.6)
   • "pasta" → itself (weight: 0.3)
   • "recipe" → pasta recipe? (weight: 0.8)

   And updates its vector from these contexts:

   vector_pasta_new =
       0.6 * vector_quick +
       0.3 * vector_pasta +
       0.8 * vector_recipe

   💡 Now "pasta" encodes the FULL context

This repeats 12 times (12 layers).
Each layer captures more abstract relations.

🎯 After the Transformer:
   • "quick" is influenced by "pasta" and "recipe"
   • "pasta" is influenced by "quick" and "recipe"
   • "recipe" is influenced by "quick" and "pasta"

   Each vector now encodes the FULL CONTEXT
""")

# ============================================================================
# STEP 5: Pooling (many vectors → one)
# ============================================================================
print("\n" + "=" * 80)
print("STEP 5: Pooling — Combine into ONE Vector")
print("=" * 80)

print("""
🎯 Problem: we have 3 vectors (one per token) but want 1.

💡 Solution: POOLING (merge vectors)

Pooling strategies:

A) MEAN POOLING (average):
   vector_final = (vector_quick + vector_pasta + vector_recipe) / 3

   ✅ Common for sentence embeddings
   ✅ Uses every token
   ✅ BAAI/bge-small-en-v1.5 uses mean pooling

B) CLS TOKEN (special first token):
   vector_final = vector_[CLS]

   ✅ Classic BERT
   ❌ Drops other token information

C) MAX POOLING:
   Per dimension, take the max across tokens

   ❌ Less common for embeddings

📊 Mean pooling in action:
""")

print("\n   Vectors after the Transformer:")
print(
    f"   'quick':  [{embedding_quick[0]:.3f}, {embedding_quick[1]:.3f}, ..., {embedding_quick[-1]:.3f}]"
)
print(
    f"   'pasta':  [{embedding_pasta[0]:.3f}, {embedding_pasta[1]:.3f}, ..., {embedding_pasta[-1]:.3f}]"
)
print(
    f"   'recipe': [{embedding_recipe[0]:.3f}, {embedding_recipe[1]:.3f}, ..., {embedding_recipe[-1]:.3f}]\n"
)

# Simulated mean pooling
final_embedding = (embedding_quick + embedding_pasta + embedding_recipe) / 3

print("   Mean pooling (per dimension):")
print(
    f"   Dim 0: ({embedding_quick[0]:.3f} + {embedding_pasta[0]:.3f} + {embedding_recipe[0]:.3f}) / 3 = {final_embedding[0]:.3f}"
)
print(
    f"   Dim 1: ({embedding_quick[1]:.3f} + {embedding_pasta[1]:.3f} + {embedding_recipe[1]:.3f}) / 3 = {final_embedding[1]:.3f}"
)
print("   ...")
print(
    f"   Dim 383: ({embedding_quick[-1]:.3f} + {embedding_pasta[-1]:.3f} + {embedding_recipe[-1]:.3f}) / 3 = {final_embedding[-1]:.3f}\n"
)

print(
    f"   Final vector: [{final_embedding[0]:.3f}, {final_embedding[1]:.3f}, ..., {final_embedding[-1]:.3f}]"
)
print(f"   Dimensions: {final_embedding.shape[0]}\n")

print("   💡 This vector represents the full meaning of 'quick pasta recipe'")

# ============================================================================
# STEP 6: Normalization (optional but important)
# ============================================================================
print("\n" + "=" * 80)
print("STEP 6: Normalization — Scale the Vector")
print("=" * 80)

print("""
🎯 L2 normalization (unit norm):
   Scale the vector so its length = 1.0

   Formula:
   vector_norm = vector / ||vector||

   where ||vector|| = sqrt(sum(x² for x in vector))

📊 Why normalize?
   • Cosine distance simplifies to dot product
   • All vectors share the same magnitude
   • Only DIRECTION matters, not length
""")

norm = np.linalg.norm(final_embedding)
normalized_embedding = final_embedding / norm

print("\n   Before normalization:")
print(f"   Norm (length): {norm:.3f}")
print(
    f"   Vector: [{final_embedding[0]:.3f}, {final_embedding[1]:.3f}, ..., {final_embedding[-1]:.3f}]\n"
)

print("   After normalization:")
print(f"   Norm (length): {np.linalg.norm(normalized_embedding):.3f} (≈1.0)")
print(
    f"   Vector: [{normalized_embedding[0]:.3f}, {normalized_embedding[1]:.3f}, ..., {normalized_embedding[-1]:.3f}]\n"
)

print("   💡 The normalized vector is the FINAL embedding")

# ============================================================================
# STEP 7: Real demo with the model
# ============================================================================
print("\n" + "=" * 80)
print("STEP 7: Real Demo — Full Pipeline")
print("=" * 80)

print("\n🚀 Using the real model: BAAI/bge-small-en-v1.5\n")

model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

texts = ["quick pasta recipe", "fast spaghetti dish", "chocolate cake dessert"]

print("   Generating embeddings...\n")
embeddings_real = list(model.embed(texts))

for t, emb in zip(texts, embeddings_real):
    print(f"   '{t}'")
    print(f"   → Vector: [{emb[0]:.3f}, {emb[1]:.3f}, {emb[2]:.3f}, ..., {emb[-1]:.3f}]")
    print(f"   → Dimensions: {len(emb)}")
    print(f"   → Norm: {np.linalg.norm(emb):.3f}")
    print()

# ============================================================================
# STEP 8: What does each dimension mean?
# ============================================================================
print("\n" + "=" * 80)
print("STEP 8: What Does Each Dimension Mean?")
print("=" * 80)

print("""
❓ Common question: what do the 384 numbers mean?

💡 Answer: there is no direct human-readable label per dimension.

📊 Each dimension is a LATENT feature:
   • NOT "speed" or "flavor" or "difficulty"
   • Abstract mixes learned during training
   • The model found 384 dims that work well for semantic similarity

🎯 Analogy — RGB colors:
   • (255, 0, 0) reads as "red"
   • But the middle green channel being 0 is not a story by itself
   • It is just a numeric encoding

   For embeddings:
   • [0.123, -0.456, ...] encodes "quick pasta recipe"
   • 0.123 in dim 0 is not a named concept
   • It is a learned representation

🔬 What we DO know:
   • Nearby vectors → similar meaning
   • Direction → kind of concept
   • Magnitude (before norm) → strength of signal

🧪 Example "directions" in vector space:

   vector("quick") - vector("slow") ≈ vector("fast") - vector("sluggish")

   There is a "speed" direction, but it is spread across many dims,
   not one coordinate.
""")

# ============================================================================
# FULL SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("📝 SUMMARY: Text → 384-D Vector")
print("=" * 80)

print("""
FULL PIPELINE:

1️⃣  TOKENIZATION
    "quick pasta recipe"
    → ["quick", "pasta", "recipe"]
    → [2032, 8459, 7394]

2️⃣  EMBEDDING TABLE LOOKUP
    [2032, 8459, 7394]
    → [vector_quick, vector_pasta, vector_recipe]
    → Matrix [3 × 384]

3️⃣  TRANSFORMER ENCODER (12 layers)
    • Self-attention: every token attends to every other
    • Feed-forward: nonlinear transform
    • Repeat 12×
    → CONTEXT-aware vectors

4️⃣  POOLING (mean)
    [3 vectors × 384 dims]
    → average across tokens
    → [1 vector × 384 dims]

5️⃣  NORMALIZATION
    vector / ||vector||
    → norm = 1.0
    → FINAL embedding

🎯 RESULT:
    "quick pasta recipe"
    → [-0.109, -0.018, 0.017, ..., 0.003]
    → 384 numbers representing full meaning

⚡ SPEED:
    • Full pass: ~10–50 ms CPU
    • GPU: ~1–5 ms
    • Model is optimized to be fast

💾 MODEL SIZE:
    • BAAI/bge-small-en-v1.5: ~134 MB
    • ~33M parameters
    • Compact and efficient

🚀 IN SEARCH:
    1. User query → embedding (~50 ms)
    2. Compare to all chunks in DB → pgvector (~200 ms)
    3. Return top K

    Total: ~250 ms over thousands of recipes
""")

print("\n" + "=" * 80)
print("✅ Explanation complete!")
print("=" * 80)
