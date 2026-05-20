#!/usr/bin/env python3
"""
How does the system capture user INTENT?

Short answer: it does not measure intent explicitly. Intent EMERGES from
embedding model training on millions of texts.
"""

import numpy as np
from fastembed import TextEmbedding

print("=" * 80)
print("How Does the System Capture User INTENT?")
print("=" * 80)

model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

# ============================================================================
# PART 1: No explicit "intent" logic
# ============================================================================
print("\n" + "=" * 80)
print("PART 1: The Model Has No Explicit 'Intent' Rules")
print("=" * 80)

print("""
❌ The model does NOT do:
   if "hungry" in query and "NOW" in query:
       intention = "quick_meal"

❌ No if/else intent templates

✅ Instead it was trained on millions of texts where:
   • "I'm hungry" co-occurred with "quick", "fast", "easy"
   • "impress guests" co-occurred with "elegant", "sophisticated", "special"
   • "comfort food" co-occurred with "warm", "hearty", "cozy"

   …and learned to place those concepts NEAR each other in vector space.
""")

# ============================================================================
# PART 2: Same intent → similar vectors
# ============================================================================
print("\n" + "=" * 80)
print("PART 2: Same Intent → Similar Vectors")
print("=" * 80)

quick_queries = [
    "I'm hungry and need something NOW",
    "quick recipe",
    "fast meal",
    "what can I make in 10 minutes?",
    "I don't have much time",
]

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


print("\n🔍 Group 1: 'FAST / URGENT' intent\n")
quick_embeddings = [get_embedding(q) for q in quick_queries]

print("Similarity within the SAME group (same intent):\n")
for i, q1 in enumerate(quick_queries[:3]):
    for j, q2 in enumerate(quick_queries[i + 1 : 4], i + 1):
        sim = cosine_similarity(quick_embeddings[i], quick_embeddings[j])
        print(f"  '{q1[:40]}...'")
        print(f"  '{q2[:40]}...'")
        print(f"  → Similarity: {sim:.3f}\n")

print("\n🔍 Group 2: 'IMPRESS / FANCY' intent\n")
impress_embeddings = [get_embedding(q) for q in impress_queries]

print("Similarity within the SAME group (same intent):\n")
for i, q1 in enumerate(impress_queries[:3]):
    for j, q2 in enumerate(impress_queries[i + 1 : 4], i + 1):
        sim = cosine_similarity(impress_embeddings[i], impress_embeddings[j])
        print(f"  '{q1[:40]}...'")
        print(f"  '{q2[:40]}...'")
        print(f"  → Similarity: {sim:.3f}\n")

print("\n📊 ACROSS groups (different intents):\n")
sim_cross = cosine_similarity(quick_embeddings[0], impress_embeddings[0])
print(f"  '{quick_queries[0]}'")
print("  vs")
print(f"  '{impress_queries[0]}'")
print(f"  → Similarity: {sim_cross:.3f}")
print("\n  💡 LOWER because intents differ")

# ============================================================================
# PART 3: How the model learns these links
# ============================================================================
print("\n" + "=" * 80)
print("PART 3: How Did the Model Learn These Links?")
print("=" * 80)

print("""
🧠 TRAINING (BAAI/bge-small-en-v1.5):

1️⃣  CORPUS (millions of documents):
   • Cooking articles: "quick dinner recipes for busy weeknights"
   • Reviews: "I was hungry and needed something fast"
   • Blogs: "impress your guests with this elegant dish"
   • Recipes: "sophisticated gourmet meal for similar occasions"

2️⃣  OBJECTIVE:
   • Texts in SIMILAR contexts → nearby vectors
   • Texts in DIFFERENT contexts → farther vectors

   Example cloze:
   - "I'm [MASK]" → "hungry", "starving", "famished" (similar)
   - "Quick [MASK]" → "recipe", "meal", "dish" (similar)

3️⃣  RESULT:
   The model learns:
   • "hungry" + "NOW" + "quick" share context
   • "impress" + "guests" + "elegant" share another context
   • Those two bundles rarely overlap → farther apart

4️⃣  NO EXPLICIT RULES:
   ❌ No: if "hungry" then intent="quick"
   ✅ Only math: nearby vectors = similar meaning

💡 "Intent" emerges from patterns in massive text.
""")

# ============================================================================
# PART 4: Simplified visualization
# ============================================================================
print("\n" + "=" * 80)
print("PART 4: Vector Space Picture (384D → 2D sketch)")
print("=" * 80)

print("""
📐 Real space: 384 dimensions (not drawable)

📊 2D cartoon (illustration only):

   "impress guests" ●────────────────────────● "elegant meal"
                    │                         │
                    │  Region: FANCY          │
                    │                         │
                    ●─────────────────────────●



   "quick recipe"   ●────────────────────────● "fast meal"
                    │                         │
                    │  Region: FAST          │
                    │                         │
   "I'm hungry NOW" ●─────────────────────────●


💡 In real 384D:
   • Same-intent queries are CLOSE (small cosine distance)
   • Different intents are FAR
   • Search returns vectors NEAREST the query
""")

# ============================================================================
# PART 5: What search does
# ============================================================================
print("\n" + "=" * 80)
print("PART 5: What Happens When You Search?")
print("=" * 80)

print("""
STEP BY STEP:

1️⃣  User: "I'm hungry and need something NOW"
    ↓

2️⃣  System builds a 384-D embedding:
    query_vector = [-0.109, -0.018, 0.017, ..., 0.003]
    ↓

3️⃣  Cosine similarity vs ALL chunks in the DB:

    "TOMATO & MUSSEL PASTA - Quick 20min recipe"
    recipe_vector = [-0.105, -0.021, 0.019, ..., 0.005]
    similarity = cosine(query_vector, recipe_vector)
    → 0.703 (close!)

    "Christmas Pudding - Traditional 3-hour recipe"
    recipe_vector = [0.089, 0.112, -0.034, ..., -0.022]
    similarity = cosine(query_vector, recipe_vector)
    → 0.412 (farther)
    ↓

4️⃣  Sort by similarity (closest first):
    1. TOMATO & MUSSEL PASTA (0.703) ← fast intent
    2. Quick Fish Pie (0.655) ← fast intent
    3. … other quick recipes
    ↓

5️⃣  User gets recipes matching intent
    even without saying "quick" or "fast"

💡 The system does not "detect intent" as a label.
   It finds NEARBY vectors — near because training aligned them.
""")

# ============================================================================
# PART 6: Explicit vs implicit wording
# ============================================================================
print("\n" + "=" * 80)
print("PART 6: Explicit vs Implicit Wording")
print("=" * 80)

queries_comparison = [
    ("quick pasta", "EXPLICIT (has keyword)"),
    ("I need something fast", "IMPLICIT (no word 'quick')"),
    ("I'm starving", "IMPLICIT (no speed keywords)"),
]

print("\nComparing embeddings:\n")
embeddings_comp = [get_embedding(q[0]) for q in queries_comparison]

for i, (q1, desc1) in enumerate(queries_comparison):
    for j, (q2, desc2) in enumerate(queries_comparison[i + 1 :], i + 1):
        sim = cosine_similarity(embeddings_comp[i], embeddings_comp[j])
        print(f"  '{q1}' ({desc1})")
        print("  vs")
        print(f"  '{q2}' ({desc2})")
        print(f"  → Similarity: {sim:.3f}")
        print()

print("""
💡 Notice:
   • "quick pasta" and "I need something fast" → HIGH similarity
   • Different words, SAME rough intent
   • Learned alignment — not hand rules
""")

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("📝 SUMMARY: Intent Without Measuring It")
print("=" * 80)

print("""
✅ NO dedicated "intent detection" layer:
   • No if/else rules
   • No intent classifier head
   • No syntactic intent parse

✅ GEOMETRY in vector space:
   • Each text → 384 numbers
   • Same MEANING → nearby vectors
   • Similarity = cosine distance

✅ LEARNED at training:
   • Saw millions of texts
   • "hungry NOW" and "quick recipe" co-occur → placed nearby
   • Intent is an emergent pattern

✅ AT QUERY TIME:
   1. Query → vector
   2. Distance to every chunk
   3. Sort by closeness
   4. Return top matches

   That's it — linear algebra, not magic.

🎯 ANALOGY:
   GPS does not "understand cities",
   but Paris and Lyon are close on a 2D map.

   Embeddings: "I'm hungry NOW" and "quick recipe" are neighbors
   on a 384D semantic map.

🚀 WHY IT WORKS:
   • You do not enumerate every phrasing
   • The model already learned relations from data
   • Search = nearest neighbors
""")

print("\n" + "=" * 80)
print("✅ Explanation complete!")
print("=" * 80)
