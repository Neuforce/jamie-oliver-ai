# Recipe Search API — usage guide

## Description

REST API for semantic recipe search using embeddings, structured filters, and full-text search on ingredients.

---

## Quick start

### 1. Install dependencies

```bash
pip install fastapi uvicorn supabase fastembed python-dotenv
```

### 2. Environment variables

Add these to `.env`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

### 3. Apply SQL functions in Supabase

Run these in the Supabase SQL editor:

1. `db/search_function.sql` — hybrid search function  
2. `db/match_chunks_function.sql` — relevant chunks helper  

### 4. Start the server

```bash
./scripts/start_api.sh
```

Or manually:

```bash
python -m uvicorn recipe_search_agent.api:app --reload
```

Then open:
- API: `http://localhost:8000`  
- Swagger: `http://localhost:8000/docs`  
- ReDoc: `http://localhost:8000/redoc`  

---

## Endpoints

### 1. `POST /api/v1/recipes/search`

Semantic recipe search.

#### Request

```json
{
  "query": "quick vegetarian pasta under 30 minutes",
  "complexity": "easy",
  "category": "dinner",
  "top_k": 5,
  "include_full_recipe": false,
  "include_chunks": true
}
```

#### Response

```json
{
  "query": "quick vegetarian pasta under 30 minutes",
  "filters_applied": {
    "category": "dinner",
    "complexity": "easy",
    ...
  },
  "results": [
    {
      "recipe_id": "vegetarian-pasta-primavera",
      "title": "Vegetarian Pasta Primavera",
      "similarity_score": 0.87,
      "combined_score": 0.89,
      "category": "dinner",
      "complexity": "easy",
      "match_explanation": "High semantic similarity (0.87) | Difficulty: easy",
      "matching_chunks": [
        {
          "chunk_text": "Quick vegetarian pasta with fresh vegetables...",
          "similarity": 0.91
        }
      ],
      "full_recipe": null
    }
  ],
  "total": 5,
  "took_ms": 234.5
}
```

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | Natural-language query |
| `category` | string | ❌ | breakfast, lunch, dinner, dessert |
| `mood` | string | ❌ | comfort, light, festive, etc. |
| `complexity` | string | ❌ | easy, medium, hard |
| `cost` | string | ❌ | budget, moderate, premium |
| `ingredients_query` | string | ❌ | FTS over ingredients |
| `top_k` | int | ❌ | Result count (1–50, default 10) |
| `include_full_recipe` | bool | ❌ | Include full JSON (default false) |
| `include_chunks` | bool | ❌ | Include matching chunks (default true) |

---

### 2. `GET /api/v1/recipes/{recipe_id}`

Fetch one recipe by ID.

```bash
GET /api/v1/recipes/christmas-salad-jamie-oliver-recipes?include_chunks=true
```

---

### 3. `GET /api/v1/recipes`

List recipes with optional filters.

```bash
GET /api/v1/recipes?category=dessert&complexity=easy&limit=10
```

---

### 4. `GET /health`

Service health.

```json
{
  "status": "healthy",
  "supabase": "connected",
  "embedding_model": "BAAI/bge-small-en-v1.5"
}
```

---

## Usage examples

### Simple search (Python)

```python
import requests

response = requests.post(
    "http://localhost:8000/api/v1/recipes/search",
    json={"query": "pasta", "top_k": 3}
)

results = response.json()
for recipe in results["results"]:
    print(f"{recipe['title']} (score: {recipe['combined_score']:.2f})")
```

### Filters (cURL)

```bash
curl -X POST "http://localhost:8000/api/v1/recipes/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "quick dinner",
    "category": "dinner",
    "complexity": "easy",
    "top_k": 5
  }'
```

### Ingredients (JavaScript)

```javascript
fetch('http://localhost:8000/api/v1/recipes/search', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    query: 'recipe with tomatoes',
    ingredients_query: 'tomato basil mozzarella',
    top_k: 5
  })
})
.then(res => res.json())
.then(data => console.log(data.results));
```

---

## Testing

### Automated tests

```bash
python tests/test_search_agent.py
```

Covers:
- Basic search (no filters)  
- Filters (category, mood, complexity)  
- Ingredient search  
- Detailed response with chunks + full JSON  

### Interactive

Open `http://localhost:8000/docs` for Swagger.

---

## Ranking

```
combined_score = (similarity_score * 0.8) + (ingredient_rank * 0.2)
```

- **`similarity_score`**: Cosine similarity vs chunks (0–1)  
- **`ingredient_rank`**: FTS on ingredients (0–1, normalized)  

Weights are configurable in `db/search_function.sql`.

---

## Example queries

### Natural language

```json
{"query": "I want something quick and healthy for breakfast"}
```

Finds quick, healthy breakfast-style recipes.

### Specific filters

```json
{
  "query": "pasta",
  "category": "dinner",
  "complexity": "easy",
  "cost": "budget"
}
```

Dinner pasta that is easy and budget-friendly.

### Ingredients

```json
{
  "query": "italian recipe",
  "ingredients_query": "tomato basil parmesan"
}
```

Italian recipes leaning on those ingredients.

### Combined

```json
{
  "query": "festive dessert for christmas",
  "category": "dessert",
  "mood": "festive",
  "complexity": "medium"
}
```

---

## Advanced configuration

### Score weights

Edit `db/search_function.sql`:

```sql
-- Emphasize vector similarity
(similarity_score * 0.9 + ingredient_rank * 0.1) AS combined_score

-- Balance with ingredients
(similarity_score * 0.5 + ingredient_rank * 0.5) AS combined_score
```

### Similarity threshold

```json
{
  "query": "pasta",
  "similarity_threshold": 0.5
}
```

Or in Python (`search.py`):

```python
agent.search(query="pasta", similarity_threshold=0.5)
```

---

## Deployment

### Railway / Render

1. Push to GitHub  
2. Connect Railway/Render  
3. Set env vars  
4. Deploy  

### Docker

```dockerfile
FROM python:3.13-slim

WORKDIR /app
COPY . /app

RUN pip install -e .

CMD ["uvicorn", "recipe_search_agent.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t recipe-search-api .
docker run -p 8000:8000 --env-file .env recipe-search-api
```

### Vercel (serverless)

See `vercel.json` in the deployable package and `docs/deployment/DEPLOYMENT.md`.

```json
{
  "builds": [
    {"src": "recipe_search_agent/api.py", "use": "@vercel/python"}
  ],
  "routes": [
    {"src": "/(.*)", "dest": "recipe_search_agent/api.py"}
  ]
}
```

---

## References

- [FastAPI](https://fastapi.tiangolo.com/)  
- [Supabase Python](https://supabase.com/docs/reference/python)  
- [FastEmbed](https://github.com/qdrant/fastembed)  
- Local OpenAPI: http://localhost:8000/docs  
