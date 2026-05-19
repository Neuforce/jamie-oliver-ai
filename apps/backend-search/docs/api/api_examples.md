# Semantic search API — payload examples

## Main endpoint

```
POST http://localhost:8000/api/v1/recipes/search
Content-Type: application/json
```

---

## Minimal payload

```json
{
  "query": "quick pasta recipe"
}
```

**Response:**
```json
{
  "query": "quick pasta recipe",
  "filters_applied": {
    "category": null,
    "mood": null,
    "complexity": null,
    "cost": null,
    "ingredients_query": null
  },
  "results": [
    {
      "recipe_id": "tomato-mussel-pasta",
      "title": "TOMATO & MUSSEL PASTA",
      "similarity_score": 0.707,
      "combined_score": 0.707,
      "category": null,
      "mood": null,
      "complexity": null,
      "cost": null,
      "file_path": "data/recipes_json/tomato-mussel-pasta.json",
      "match_explanation": "High semantic similarity (0.71)",
      "matching_chunks": [
        {
          "chunk_id": "uuid-123",
          "chunk_text": "Quick 20-minute pasta with fresh mussels...",
          "similarity": 0.85
        }
      ],
      "full_recipe": null
    }
  ],
  "total": 1,
  "took_ms": 234.5
}
```

---

## Payloads with filters

### Example 1: complexity

```json
{
  "query": "pasta dish",
  "complexity": "easy",
  "top_k": 5
}
```

### Example 2: category + mood

```json
{
  "query": "something special",
  "category": "dinner",
  "mood": "festive",
  "top_k": 3
}
```

### Example 3: cost

```json
{
  "query": "meal for tonight",
  "cost": "budget",
  "complexity": "easy",
  "top_k": 10
}
```

---

## Ingredient-aware search

```json
{
  "query": "italian recipe",
  "ingredients_query": "tomato basil mozzarella",
  "top_k": 5
}
```

**Notes:**
- `query` — general semantic search  
- `ingredients_query` — full-text search on ingredients (~20% of blended score)  

---

## Full payload (all common options)

```json
{
  "query": "quick vegetarian dinner",
  "category": "dinner",
  "mood": "comfort",
  "complexity": "easy",
  "cost": "budget",
  "ingredients_query": "pasta vegetables",
  "top_k": 10,
  "include_full_recipe": true,
  "include_chunks": true
}
```

**Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | ✅ Yes | — | Natural-language query |
| `category` | string | No | `null` | breakfast, lunch, dinner, dessert |
| `mood` | string | No | `null` | comfort, light, festive, etc. |
| `complexity` | string | No | `null` | easy, medium, hard |
| `cost` | string | No | `null` | budget, moderate, premium |
| `ingredients_query` | string | No | `null` | Ingredient FTS string |
| `top_k` | integer | No | `10` | Max results (1–50) |
| `include_full_recipe` | boolean | No | `false` | Include full recipe JSON |
| `include_chunks` | boolean | No | `true` | Include matching chunks |

---

## Client examples

### Python (requests)

```python
import requests

response = requests.post(
    "http://localhost:8000/api/v1/recipes/search",
    json={
        "query": "quick pasta",
        "top_k": 5
    }
)

results = response.json()
print(f"Found {results['total']} recipes in {results['took_ms']}ms")

for recipe in results['results']:
    print(f"- {recipe['title']} (score: {recipe['combined_score']:.2f})")
```

### Python (httpx async)

```python
import httpx
import asyncio

async def search_recipes():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/api/v1/recipes/search",
            json={
                "query": "comfort food",
                "mood": "comfort",
                "top_k": 3
            }
        )
        return response.json()

results = asyncio.run(search_recipes())
```

### JavaScript (fetch)

```javascript
const searchRecipes = async (query) => {
  const response = await fetch('http://localhost:8000/api/v1/recipes/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: query,
      top_k: 5
    })
  });

  return await response.json();
};

searchRecipes('quick dinner')
  .then(data => {
    console.log(`Found ${data.total} recipes`);
    data.results.forEach(recipe => {
      console.log(`- ${recipe.title} (${recipe.combined_score.toFixed(2)})`);
    });
  });
```

### cURL

```bash
curl -X POST "http://localhost:8000/api/v1/recipes/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "quick pasta",
    "top_k": 3
  }'

curl -X POST "http://localhost:8000/api/v1/recipes/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "italian dish",
    "category": "dinner",
    "complexity": "easy",
    "ingredients_query": "tomato basil",
    "top_k": 5
  }'
```

---

## Other endpoints

### Get recipe by ID

```bash
GET http://localhost:8000/api/v1/recipes/{recipe_id}?include_chunks=true
```

```bash
curl "http://localhost:8000/api/v1/recipes/tomato-mussel-pasta?include_chunks=true"
```

**Response:**
```json
{
  "recipe_id": "tomato-mussel-pasta",
  "title": "TOMATO & MUSSEL PASTA",
  "category": null,
  "mood": null,
  "complexity": null,
  "cost": null,
  "file_path": "data/recipes_json/tomato-mussel-pasta.json",
  "full_recipe": {
    "recipe": {...},
    "ingredients": [...],
    "steps": [...]
  },
  "chunks": [...]
}
```

### List recipes with filters

```bash
GET http://localhost:8000/api/v1/recipes?category=dessert&complexity=easy&limit=10
```

```bash
curl "http://localhost:8000/api/v1/recipes?category=dinner&limit=5"
```

### Health

```bash
GET http://localhost:8000/health
```

---

## Real-world cases

### Case 1: Natural query

```json
{
  "query": "I'm hungry and need something quick",
  "top_k": 5
}
```

**Why it works:** semantics capture intent; fast meals match without the word “quick”.

---

### Case 2: Hard constraints

```json
{
  "query": "dinner for tonight",
  "category": "dinner",
  "complexity": "easy",
  "cost": "budget",
  "top_k": 10
}
```

**Scoring:** ~80% vector + ~20% ingredient FTS when `ingredients_query` is set; filters apply exactly.

---

### Case 3: Pantry ingredients

```json
{
  "query": "what can I make?",
  "ingredients_query": "chicken tomato rice",
  "top_k": 5
}
```

**How:** `query` for general semantics; `ingredients_query` for `ingredients_text` FTS; blended score.

---

### Case 4: Full recipe in response

```json
{
  "query": "christmas salad",
  "include_full_recipe": true,
  "include_chunks": true,
  "top_k": 1
}
```

Returns metadata, similarity, best chunks, and **full recipe JSON** — handy for detail screens.

---

## Try the API

### Swagger

```bash
./scripts/start_api.sh
open http://localhost:8000/docs
```

### Python snippet

```python
import requests

API_URL = "http://localhost:8000"

def test_search():
    response = requests.post(
        f"{API_URL}/api/v1/recipes/search",
        json={
            "query": "quick pasta",
            "top_k": 3
        }
    )

    data = response.json()
    print(f"Found {data['total']} recipes in {data['took_ms']}ms\n")

    for i, recipe in enumerate(data['results'], 1):
        print(f"{i}. {recipe['title']}")
        print(f"   Score: {recipe['combined_score']:.3f}")
        print(f"   Explanation: {recipe['match_explanation']}\n")

if __name__ == "__main__":
    test_search()
```

### Postman / Insomnia

Import a collection like:

```json
{
  "info": {
    "name": "Recipe Search API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Search Recipes",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"query\": \"quick pasta\",\n  \"top_k\": 5\n}"
        },
        "url": {
          "raw": "http://localhost:8000/api/v1/recipes/search",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8000",
          "path": ["api", "v1", "recipes", "search"]
        }
      }
    }
  ]
}
```

---

## Performance tips

### Keep `top_k` small

```json
{
  "query": "pasta",
  "top_k": 5
}
```

### Skip full recipe when not needed

```json
{
  "query": "pasta",
  "include_full_recipe": false
}
```

### Narrow with filters

```json
{
  "query": "pasta",
  "category": "dinner",
  "top_k": 5
}
```

---

## Common errors

### 422 — validation

```json
{
  "detail": [
    {
      "loc": ["body", "query"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**Fix:** `query` is required.

### 500 — search failure

**Fix:** verify Supabase URL/key in `.env` and network reachability.

---

## Full API docs

When the server is running:

- Swagger: http://localhost:8000/docs  
- ReDoc: http://localhost:8000/redoc  
- OpenAPI JSON: http://localhost:8000/openapi.json  

Routes, request bodies, and responses are generated from the FastAPI app.
