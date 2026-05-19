# Similarity threshold — controlling match quality

## What is `similarity_threshold`?

The **similarity threshold** is the minimum score a hit must have to be included in the response.

```
similarity_threshold = N  (where 0 < N ≤ 1)

Only recipes with: similarity_score >= N
```

---

## Values and meaning

| Threshold | Description | When to use |
|-----------|-------------|-------------|
| `0.1-0.2` | Very permissive | Broad exploration, “show me anything related” |
| **`0.3`** | **Default — balanced** | General use, solid results |
| `0.4-0.5` | Moderately strict | Better matches, less noise |
| `0.6-0.7` | Strict | Only highly relevant results |
| `0.8-0.9` | Very strict | Near-exact matches only |
| `0.95+` | Extremely strict | Near-identical text |

---

## Payload examples

### Example 1: Default (threshold = 0.3)

```json
{
  "query": "quick pasta",
  "top_k": 10
  // similarity_threshold omitted → default 0.3
}
```

**Behavior:**
- Returns recipes with `similarity_score >= 0.3`
- Balance of count vs. quality

---

### Example 2: Low threshold (more results)

```json
{
  "query": "pasta",
  "top_k": 20,
  "similarity_threshold": 0.2
}
```

**Behavior:**
- Returns recipes with `similarity_score >= 0.2`
- **More results**, less precision
- Good for exploration

---

### Example 3: High threshold (top matches only)

```json
{
  "query": "tomato mussel pasta",
  "top_k": 5,
  "similarity_threshold": 0.7
}
```

**Behavior:**
- Only recipes with `similarity_score >= 0.7`
- **Fewer results**, very precise
- Good for specific searches

---

### Example 4: Very high threshold (near exact)

```json
{
  "query": "christmas salad jamie oliver",
  "top_k": 3,
  "similarity_threshold": 0.85
}
```

**Behavior:**
- Only recipes with `similarity_score >= 0.85`
- **Very few results** (or none)
- Good to check if a specific recipe exists

---

## How it works internally

```sql
-- In hybrid_recipe_search()

WHERE
  (1 - (c.embedding <=> query_embedding))::FLOAT > similarity_threshold

-- If similarity_threshold = 0.7:
-- Only vectors with cosine distance < 0.3 (similarity > 0.7)
```

**Flow:**
```
1. Compute similarity for all candidate recipes
2. FILTER: keep only similarity_score >= threshold
3. Sort by score (high → low)
4. Return top K of the filtered set
```

---

## Visualization

```
All recipes with scores:

1. TOMATO & MUSSEL PASTA     → 0.850  ✅ passes 0.7
2. Smoked Salmon Pasta        → 0.750  ✅ passes 0.7
3. Happy fish pie             → 0.680  ❌ below 0.7
4. Christmas salad            → 0.590  ❌ below 0.7
5. Somali Beef Stew           → 0.450  ❌ below 0.7
...

With threshold = 0.7 and top_k = 5:
→ Only recipes 1 and 2 return (2 total)
  Even though top_k=5, only 2 pass the threshold
```

---

## Real-world cases

### Case 1: General search (low threshold)

```json
{
  "query": "dinner ideas",
  "top_k": 20,
  "similarity_threshold": 0.25
}
```

**Goal:** Explore many options  
**Result:** ~15–20 varied recipes

---

### Case 2: Specific search (medium threshold)

```json
{
  "query": "quick pasta with seafood",
  "top_k": 5,
  "similarity_threshold": 0.5
}
```

**Goal:** Relevant hits  
**Result:** ~3–5 relevant recipes

---

### Case 3: Exact check (high threshold)

```json
{
  "query": "christmas salad",
  "top_k": 1,
  "similarity_threshold": 0.8
}
```

**Goal:** Does this exact recipe exist?  
**Result:** 0–1 recipes (only on near-exact match)

---

### Case 4: Autocomplete (medium–high)

```json
{
  "query": "chri",  // user is typing
  "top_k": 5,
  "similarity_threshold": 0.6
}
```

**Goal:** Suggestions while typing  
**Result:** Only fairly related recipes

---

## Performance impact

```python
# Performance barely changes

threshold = 0.1  → ~250ms (~50 recipes)
threshold = 0.5  → ~245ms (~10 recipes)
threshold = 0.9  → ~240ms (~1 recipe)

# Similarity is computed the same way
# Only the filter changes how many rows return
```

---

## Experiment: different thresholds

```python
import requests

query = "pasta"
thresholds = [0.2, 0.4, 0.6, 0.8]

for threshold in thresholds:
    response = requests.post(
        "http://localhost:8000/api/v1/recipes/search",
        json={
            "query": query,
            "top_k": 20,
            "similarity_threshold": threshold
        }
    )

    data = response.json()
    print(f"\nThreshold {threshold}:")
    print(f"  Results: {data['total']}")

    if data['results']:
        top = data['results'][0]
        print(f"  Top score: {top['similarity_score']:.3f}")
        print(f"  Top: {top['title']}")

# Expected output:
# Threshold 0.2:
#   Results: 15
#   Top score: 0.707
#   Top: TOMATO & MUSSEL PASTA
#
# Threshold 0.4:
#   Results: 8
#   ...
```

---

## Recommendations

### General UI
```json
{
  "query": user_query,
  "top_k": 10,
  "similarity_threshold": 0.3
}
```

### Power search
```json
{
  "query": user_query,
  "top_k": 20,
  "similarity_threshold": user_selectable_threshold
}
```

### Autocomplete
```json
{
  "query": partial_query,
  "top_k": 5,
  "similarity_threshold": 0.5
}
```

### Verification
```json
{
  "query": exact_title,
  "top_k": 1,
  "similarity_threshold": 0.85
}
```

---

## Combining with filters

```json
{
  "query": "pasta",
  "category": "dinner",
  "complexity": "easy",
  "similarity_threshold": 0.5,
  "top_k": 5
}
```

**Behavior:**
1. Filter `category = "dinner"` and `complexity = "easy"`
2. Compute similarity only on filtered recipes
3. Keep those with similarity >= 0.5
4. Cap at top 5

**Result:** Few recipes, highly on-target

---

## Very high thresholds

```json
{
  "query": "pasta",
  "similarity_threshold": 0.95,
  "top_k": 10
}
```

**Issue:** You may get **zero** results.

**Fix:** use a fallback:

```python
def search_with_fallback(query, threshold=0.7, fallback_threshold=0.4):
    results = search(query, similarity_threshold=threshold)

    if len(results) < 3:
        results = search(query, similarity_threshold=fallback_threshold)

    return results
```

---

## Summary

```
similarity_threshold = quality gate

• Default: 0.3 (balanced)
• Range: 0.0–1.0
• Low (0.1–0.3): more results, lower precision
• Mid (0.4–0.6): balance
• High (0.7–0.9): few results, high precision
• Very high (0.95+): near duplicates (may return 0)

With top_k:
  • threshold = QUALITY filter
  • top_k = COUNT cap
```

---

## Try it

```bash
./scripts/start_api.sh

python -c "
import requests
response = requests.post(
    'http://localhost:8000/api/v1/recipes/search',
    json={
        'query': 'pasta',
        'top_k': 10,
        'similarity_threshold': 0.6
    }
)
print(response.json()['total'], 'results')
"

open http://localhost:8000/docs
```

You now control how strict semantic matching is.
