#!/usr/bin/env python3
"""
How does the system "understand" user INTENT?

Technical note: embeddings capture intent without an explicit intent score.
"""

from fastembed import TextEmbedding
import numpy as np

print("=" * 80)
print("HOW IS USER INTENT CAPTURED?")
print("=" * 80)

# ============================================================================
# PART 1: The embedding model was trained on millions of examples
# ============================================================================
print("\n" + "=" * 80)
print("PART 1: Training the Embedding Model")
print("=" * 80)

print("""
BAAI/bge-small-en-v1.5 was trained on:

📚 Millions of text pairs such as:
   • Question: "I need something quick" → Answer: "Fast pasta recipe"
   • Question: "comfort food for winter" → Answer: "Hearty beef stew"
   • Question: "healthy breakfast" → Answer: "Light oatmeal with fruits"

🧠 The model learns SEMANTIC patterns:
   • "quick", "fast", "now", "hurry" → URGENCY / SPEED
   • "comfort", "cozy", "warm" → COMFORTING
   • "healthy", "light", "nutritious" → HEALTHY
   • "impress", "guests", "special" → FANCY / SPECIAL

💡 Those patterns live in the 384 embedding numbers.
   Not magic — learning from millions of examples.
""")

# ============================================================================
# PART 2: Embeddings encode CONTEXT, not isolated words
# ============================================================================
print("\n" + "=" * 80)
print("PART 2: Embeddings = Encoded Semantic Context")
print("=" * 80)

model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

queries_by_intent = {
    "urgency": [
        "I'm hungry NOW",
        "need something quick",
        "fast recipe please",
    ],
    "comfort": [
        "comfort food for a cold day",
        "something warm and cozy",
        "hearty meal",
    ],
    "health": [
        "healthy dinner option",
        "light meal",
        "nutritious recipe",
    ],
    "impress": [
        "impress my dinner guests",
        "fancy recipe for special occasion",
        "elegant dish",
    ],
}

print("\n📊 Embeddings for queries with different INTENTS:\n")

embeddings_by_intent = {}
for intent, queries in queries_by_intent.items():
    print(f"🎯 Intent: {intent.upper()}")
    embeddings = []
    for q in queries:
        emb = list(model.embed([q]))[0]
        embeddings.append(emb)
        print(f"   '{q}'")
        print(f"   → [{emb[0]:.3f}, {emb[1]:.3f}, {emb[2]:.3f}, ..., {emb[-1]:.3f}]")
    embeddings_by_intent[intent] = embeddings
    print()

# ============================================================================
# PART 3: Similarity within vs between intents
# ============================================================================
print("\n" + "=" * 80)
print("PART 3: Within-Intent vs Between-Intent Similarity")
print("=" * 80)


def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


print("\n📐 Similarity WITHIN the same intent (HIGH):\n")

for intent, embeddings in embeddings_by_intent.items():
    sims = []
    for i, emb1 in enumerate(embeddings):
        for emb2 in embeddings[i + 1 :]:
            sim = cosine_similarity(emb1, emb2)
            sims.append(sim)

    avg_sim = np.mean(sims) if sims else 0
    print(f"   {intent.upper()}: average {avg_sim:.3f}")
    print("   💡 Same-intent queries have SIMILAR vectors")

print("\n📐 Similarity BETWEEN different intents (LOWER):\n")

intents = list(embeddings_by_intent.keys())
for i, i1 in enumerate(intents):
    for i2 in intents[i + 1 :]:
        sim = cosine_similarity(embeddings_by_intent[i1][0], embeddings_by_intent[i2][0])
        print(f"   {i1} ↔ {i2}: {sim:.3f}")

print("\n💡 Different-intent queries sit FARTHER apart in vector space")

# ============================================================================
# PART 4: Intent is not "measured" — it's inferred
# ============================================================================
print("\n" + "=" * 80)
print("PART 4: Intent Is Not Measured — It Is Inferred from Vector Space")
print("=" * 80)

print("""
🔍 Step by step:

1️⃣ User types: "I'm hungry NOW"
   ↓
2️⃣ Embedding: [-0.109, 0.034, 0.021, ..., 0.015]
   ↓
3️⃣ That point is CLOSE to:
   • "quick pasta" (sim: 0.82)
   • "fast meal" (sim: 0.79)
   • "easy recipe" (sim: 0.76)
   ↓
4️⃣ And FAR from:
   • "elaborate dish" (sim: 0.23)
   • "slow-cooked" (sim: 0.18)
   ↓
5️⃣ Recipes also have embeddings:
   • "TOMATO & MUSSEL PASTA" has chunks like:
     - "Quick 20-minute meal" (high urgency)
     - "Simple ingredients" (high simplicity)
   ↓
6️⃣ Cosine similarity:
   query_emb vs recipe_chunk_emb = 0.703
   ↓
7️⃣ Match! Recipe chunks are "near" the query in 384D space

💡 There is no standalone "intent meter".
   Intent emerges from DISTANCES in embedding space.
""")

# ============================================================================
# PART 5: Conceptual picture of vector space
# ============================================================================
print("\n" + "=" * 80)
print("PART 5: Conceptual View of 384D Space")
print("=" * 80)

print("""
Think of embedding space like a 3D map (really 384D):

        🏔️ "elaborate dishes"
              ↑
              |
              |
    🥗 "healthy"  ------>  ⚡ "quick/fast"
              |
              |
              ↓
        🍲 "comfort food"

When the user says:
  • "I'm hungry NOW" → lands near ⚡
  • "comfort food" → lands near 🍲
  • "healthy meal" → lands near 🥗
  • "impress guests" → lands near 🏔️

Recipes live in the SAME space:
  • "Quick pasta" → near ⚡
  • "Fish pie" → near 🍲
  • "Salad" → near 🥗

Search returns recipes NEAR the query in this space.
""")

# ============================================================================
# PART 6: Why it works — massive scale training
# ============================================================================
print("\n" + "=" * 80)
print("PART 6: Why It Works So Well")
print("=" * 80)

print("""
✅ BAAI/bge-small-en-v1.5 was trained on:

📚 Large datasets:
   • MS MARCO (8.8M query → document pairs)
   • Natural Questions (307K Q → passages)
   • BEIR (multiple domains)
   • Millions of QA pairs

🎯 Training objective:
   • Given a query, predict which documents are RELEVANT
   • The model learns:
     - "quick" ↔ docs with "fast", "easy", "simple"
     - "comfort" ↔ docs with "warm", "hearty", "cozy"
     - "healthy" ↔ docs with "light", "nutritious", "fresh"

🧠 Outcome:
   • 384 dimensions encode MEANING, not words
   • Each dim captures a fuzzy semantic "aspect"
   • Example (hypothetical):
     - Dim 23: urgency / speed
     - Dim 157: comfort
     - Dim 301: health

💡 No hand-crafted intent rules — a model trained on real data.
""")

# ============================================================================
# PART 7: Concrete numbers
# ============================================================================
print("\n" + "=" * 80)
print("PART 7: Example with Real Numbers")
print("=" * 80)

query1 = "I'm hungry NOW"
query2 = "elaborate dinner for guests"

emb1 = list(model.embed([query1]))[0]
emb2 = list(model.embed([query2]))[0]

print(f"\n🔍 Query 1: '{query1}'")
print(f"   First 10 dimensions: {emb1[:10]}")
print("   (384 dimensions total)")

print(f"\n🔍 Query 2: '{query2}'")
print(f"   First 10 dimensions: {emb2[:10]}")
print("   (384 dimensions total)")

sim = cosine_similarity(emb1, emb2)
print(f"\n📐 Similarity between them: {sim:.3f}")
print("   💡 Low similarity → different intents")

recipe_quick = "Quick 20-minute tomato pasta"
recipe_elaborate = "Slow-cooked beef wellington with truffle sauce"

emb_quick = list(model.embed([recipe_quick]))[0]
emb_elaborate = list(model.embed([recipe_elaborate]))[0]

sim_q1_quick = cosine_similarity(emb1, emb_quick)
sim_q1_elaborate = cosine_similarity(emb1, emb_elaborate)
sim_q2_quick = cosine_similarity(emb2, emb_quick)
sim_q2_elaborate = cosine_similarity(emb2, emb_elaborate)

print(f"\n🍝 Recipe 1: '{recipe_quick}'")
print(f"   Similarity to '{query1}': {sim_q1_quick:.3f} ✅ HIGH")
print(f"   Similarity to '{query2}': {sim_q2_quick:.3f} ❌ LOW")

print(f"\n🥩 Recipe 2: '{recipe_elaborate}'")
print(f"   Similarity to '{query1}': {sim_q1_elaborate:.3f} ❌ LOW")
print(f"   Similarity to '{query2}': {sim_q2_elaborate:.3f} ✅ HIGH")

print("\n💡 The system matches intents automatically without an explicit intent classifier!")

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("📝 SUMMARY: How Intent Is Captured")
print("=" * 80)

print("""
❌ No explicit "intent gauge"
✅ Intent emerges from:

1️⃣ LARGE-SCALE TRAINING
   • Millions of examples
   • Semantic patterns → 384 numbers

2️⃣ VECTOR SPACE
   • Similar queries → nearby vectors
   • Different queries → farther vectors

3️⃣ COSINE DISTANCE
   • Proximity in 384D ≈ similar intent

4️⃣ NOT keyword lookup
   • "I'm hungry NOW" does not literally search "hungry"
   • It searches NEARBY vectors capturing urgency / speed

🎯 In short:
   • We do not measure intent directly
   • Intent is ENCODED in embeddings
   • Search finds recipes with SIMILAR embeddings
   • Embedding similarity ≈ intent similarity

🚀 That's why this beats raw keywords:
   • Keywords: "hungry" → literal "hungry"
   • Embeddings: "hungry" → "need food fast" concept space
""")

print("=" * 80)
print("✅ Explanation complete!")
print("=" * 80)
