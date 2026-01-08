# 🔍 Recipe Search API - Guía de Uso

## 📋 Descripción

API REST para búsqueda semántica de recetas usando embeddings + filtros + full-text search.

---

## 🚀 Inicio Rápido

### **1. Instalar Dependencias**

```bash
pip install fastapi uvicorn supabase fastembed python-dotenv
```

### **2. Configurar Variables de Entorno**

Asegúrate de tener estas variables en tu `.env`:

```bash
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

### **3. Aplicar Funciones SQL en Supabase**

Ejecuta estos archivos SQL en el SQL Editor de Supabase:

1. `db/search_function.sql` - Función de búsqueda híbrida
2. `db/match_chunks_function.sql` - Función para chunks relevantes

### **4. Iniciar el Servidor**

```bash
./scripts/start_api.sh
```

O manualmente:

```bash
python -m uvicorn recipe_search_agent.api:app --reload
```

El servidor estará disponible en:
- API: `http://localhost:8000`
- Docs interactiva: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## 📡 Endpoints

### **1. POST `/api/v1/recipes/search`**

Búsqueda semántica de recetas.

#### **Request:**

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

#### **Response:**

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
      "match_explanation": "Alta similitud semántica (0.87) | Dificultad: easy",
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

#### **Parámetros:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `query` | string | ✅ | Query en lenguaje natural |
| `category` | string | ❌ | breakfast, lunch, dinner, dessert |
| `mood` | string | ❌ | comfort, light, festive, etc. |
| `complexity` | string | ❌ | easy, medium, hard |
| `cost` | string | ❌ | budget, moderate, premium |
| `ingredients_query` | string | ❌ | Búsqueda FTS en ingredientes |
| `top_k` | int | ❌ | Número de resultados (1-50, default: 10) |
| `include_full_recipe` | bool | ❌ | Incluir JSON completo (default: false) |
| `include_chunks` | bool | ❌ | Incluir chunks relevantes (default: true) |

---

### **2. GET `/api/v1/recipes/{recipe_id}`**

Obtener receta completa por ID.

#### **Request:**

```bash
GET /api/v1/recipes/christmas-salad-jamie-oliver-recipes?include_chunks=true
```

#### **Response:**

```json
{
  "recipe_id": "christmas-salad-jamie-oliver-recipes",
  "title": "Christmas Salad",
  "category": "lunch",
  "mood": "festive",
  "complexity": "easy",
  "file_path": "data/recipes_json/christmas-salad-jamie-oliver-recipes.json",
  "full_recipe": {
    "recipe": {...},
    "ingredients": [...],
    "steps": [...],
    ...
  },
  "chunks": [...]
}
```

---

### **3. GET `/api/v1/recipes`**

Listar recetas con filtros opcionales.

#### **Request:**

```bash
GET /api/v1/recipes?category=dessert&complexity=easy&limit=10
```

#### **Response:**

```json
{
  "recipes": [
    {
      "id": "chocolate-cake",
      "title": "Easy Chocolate Cake",
      "category": "dessert",
      "complexity": "easy",
      ...
    }
  ],
  "total": 10,
  "limit": 10,
  "offset": 0
}
```

---

### **4. GET `/health`**

Health check del servicio.

#### **Response:**

```json
{
  "status": "healthy",
  "supabase": "connected",
  "embedding_model": "BAAI/bge-small-en-v1.5"
}
```

---

## 🧪 Ejemplos de Uso

### **Búsqueda Simple (Python)**

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

### **Búsqueda con Filtros (cURL)**

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

### **Búsqueda por Ingredientes (JavaScript)**

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

## 🧪 Testing

### **1. Ejecutar Tests Automáticos**

```bash
python tests/test_search_agent.py
```

Este script ejecuta:
- ✅ Búsqueda básica sin filtros
- ✅ Búsqueda con filtros (category, mood, complexity)
- ✅ Búsqueda por ingredientes
- ✅ Búsqueda detallada con chunks y JSON completo

### **2. Probar API Interactivamente**

Abre `http://localhost:8000/docs` en tu navegador para usar la interfaz Swagger UI interactiva.

---

## 📊 Algoritmo de Ranking

El score combinado se calcula como:

```
combined_score = (similarity_score * 0.8) + (ingredient_rank * 0.2)
```

Donde:
- **`similarity_score`**: Similitud coseno entre el query y los chunks (0-1)
- **`ingredient_rank`**: Ranking de full-text search en ingredientes (0-1, normalizado)

Los pesos son configurables en `db/search_function.sql`.

---

## 🎯 Casos de Uso

### **1. Búsqueda Natural**

```json
{"query": "I want something quick and healthy for breakfast"}
```

→ Encuentra recetas de desayuno rápidas y saludables

### **2. Filtros Específicos**

```json
{
  "query": "pasta",
  "category": "dinner",
  "complexity": "easy",
  "cost": "budget"
}
```

→ Solo pastas para cena, fáciles y económicas

### **3. Búsqueda por Ingredientes**

```json
{
  "query": "italian recipe",
  "ingredients_query": "tomato basil parmesan"
}
```

→ Recetas italianas que usen esos ingredientes

### **4. Combinado**

```json
{
  "query": "festive dessert for christmas",
  "category": "dessert",
  "mood": "festive",
  "complexity": "medium"
}
```

→ Postres festivos para navidad de dificultad media

---

## 🔧 Configuración Avanzada

### **Ajustar Pesos del Score**

Edita `db/search_function.sql`:

```sql
-- Priorizar vector similarity (más semántico)
(similarity_score * 0.9 + ingredient_rank * 0.1) AS combined_score

-- Priorizar ingredientes (más literal)
(similarity_score * 0.5 + ingredient_rank * 0.5) AS combined_score
```

### **Ajustar Threshold de Similitud**

En tu request:

```json
{
  "query": "pasta",
  "similarity_threshold": 0.5  // Solo resultados con >50% similitud
}
```

O en el código Python (`search.py`):

```python
agent.search(query="pasta", similarity_threshold=0.5)
```

---

## 🚀 Deployment

### **Opción 1: Railway/Render**

1. Sube el código a GitHub
2. Conecta Railway/Render
3. Configura variables de entorno
4. Deploy automático

### **Opción 2: Docker**

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

### **Opción 3: Vercel (Serverless)**

Crea `vercel.json`:

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

## 📚 Referencias

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Supabase Python Client](https://supabase.com/docs/reference/python)
- [FastEmbed](https://github.com/qdrant/fastembed)
- [OpenAPI Docs](http://localhost:8000/docs)

