# 🔍 API de Búsqueda Semántica - Ejemplos de Payloads

## 📡 Endpoint Principal

```
POST http://localhost:8000/api/v1/recipes/search
Content-Type: application/json
```

---

## 📝 **Payload Básico (Mínimo)**

```json
{
  "query": "quick pasta recipe"
}
```

**Respuesta:**
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
      "match_explanation": "Alta similitud semántica (0.71)",
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

## 🎯 **Payload con Filtros**

### **Ejemplo 1: Filtro por Complejidad**

```json
{
  "query": "pasta dish",
  "complexity": "easy",
  "top_k": 5
}
```

### **Ejemplo 2: Filtro por Categoría + Mood**

```json
{
  "query": "something special",
  "category": "dinner",
  "mood": "festive",
  "top_k": 3
}
```

### **Ejemplo 3: Filtro por Costo**

```json
{
  "query": "meal for tonight",
  "cost": "budget",
  "complexity": "easy",
  "top_k": 10
}
```

---

## 🥕 **Búsqueda por Ingredientes**

```json
{
  "query": "italian recipe",
  "ingredients_query": "tomato basil mozzarella",
  "top_k": 5
}
```

**Explicación:**
- `query`: Búsqueda semántica general
- `ingredients_query`: Full-text search en los ingredientes (20% del score)

---

## 📊 **Payload Completo (Todas las Opciones)**

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

**Campos:**

| Campo | Tipo | Requerido | Default | Descripción |
|-------|------|-----------|---------|-------------|
| `query` | string | ✅ Sí | - | Query en lenguaje natural |
| `category` | string | ❌ No | `null` | breakfast, lunch, dinner, dessert |
| `mood` | string | ❌ No | `null` | comfort, light, festive, etc. |
| `complexity` | string | ❌ No | `null` | easy, medium, hard |
| `cost` | string | ❌ No | `null` | budget, moderate, premium |
| `ingredients_query` | string | ❌ No | `null` | Ingredientes para FTS |
| `top_k` | integer | ❌ No | `10` | Número de resultados (1-50) |
| `include_full_recipe` | boolean | ❌ No | `false` | Incluir JSON completo |
| `include_chunks` | boolean | ❌ No | `true` | Incluir chunks relevantes |

---

## 🚀 **Ejemplos de Uso**

### **Python (requests)**

```python
import requests

# Búsqueda simple
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

### **Python (httpx + async)**

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

### **JavaScript (fetch)**

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

// Uso
searchRecipes('quick dinner')
  .then(data => {
    console.log(`Found ${data.total} recipes`);
    data.results.forEach(recipe => {
      console.log(`- ${recipe.title} (${recipe.combined_score.toFixed(2)})`);
    });
  });
```

### **cURL**

```bash
# Búsqueda simple
curl -X POST "http://localhost:8000/api/v1/recipes/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "quick pasta",
    "top_k": 3
  }'

# Con filtros
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

## 📋 **Otros Endpoints**

### **1. Obtener Receta por ID**

```bash
GET http://localhost:8000/api/v1/recipes/{recipe_id}?include_chunks=true
```

**Ejemplo:**
```bash
curl "http://localhost:8000/api/v1/recipes/tomato-mussel-pasta?include_chunks=true"
```

**Respuesta:**
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

### **2. Listar Recetas con Filtros**

```bash
GET http://localhost:8000/api/v1/recipes?category=dessert&complexity=easy&limit=10
```

**Ejemplo:**
```bash
curl "http://localhost:8000/api/v1/recipes?category=dinner&limit=5"
```

**Respuesta:**
```json
{
  "recipes": [
    {
      "id": "tomato-mussel-pasta",
      "title": "TOMATO & MUSSEL PASTA",
      "category": "dinner",
      ...
    }
  ],
  "total": 5,
  "limit": 5,
  "offset": 0
}
```

### **3. Health Check**

```bash
GET http://localhost:8000/health
```

**Respuesta:**
```json
{
  "status": "healthy",
  "supabase": "connected",
  "embedding_model": "BAAI/bge-small-en-v1.5"
}
```

---

## 🎯 **Casos de Uso Reales**

### **Caso 1: Búsqueda Natural**

```json
{
  "query": "I'm hungry and need something quick",
  "top_k": 5
}
```

**¿Por qué funciona?**
- Búsqueda semántica entiende la INTENCIÓN
- Encuentra recetas rápidas sin usar la palabra "quick" explícitamente

---

### **Caso 2: Búsqueda con Restricciones**

```json
{
  "query": "dinner for tonight",
  "category": "dinner",
  "complexity": "easy",
  "cost": "budget",
  "top_k": 10
}
```

**Score combinado:**
- 80% vector similarity ("dinner for tonight")
- 20% full-text search (si hay `ingredients_query`)
- Filtros exactos (solo recetas que cumplan)

---

### **Caso 3: Búsqueda por Ingredientes**

```json
{
  "query": "what can I make?",
  "ingredients_query": "chicken tomato rice",
  "top_k": 5
}
```

**¿Cómo funciona?**
- `query` → Búsqueda semántica general
- `ingredients_query` → Full-text search en `ingredients_text`
- Combina ambos scores (80/20)

---

### **Caso 4: Búsqueda Detallada (con JSON completo)**

```json
{
  "query": "christmas salad",
  "include_full_recipe": true,
  "include_chunks": true,
  "top_k": 1
}
```

**Respuesta incluye:**
- ✅ Metadata (title, category, mood, etc.)
- ✅ Score de similitud
- ✅ Chunks más relevantes
- ✅ **JSON completo de la receta** (ingredients, steps, etc.)

Útil para mostrar la receta completa al usuario.

---

## 🧪 **Probar la API**

### **Opción 1: Swagger UI (Interactivo)**

```bash
# Iniciar API
./scripts/start_api.sh

# Abrir en navegador
open http://localhost:8000/docs
```

Interface visual para probar todos los endpoints.

### **Opción 2: Script Python**

```python
# test_api.py
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
    print(f"✅ Found {data['total']} recipes in {data['took_ms']}ms\n")
    
    for i, recipe in enumerate(data['results'], 1):
        print(f"{i}. {recipe['title']}")
        print(f"   Score: {recipe['combined_score']:.3f}")
        print(f"   Explanation: {recipe['match_explanation']}\n")

if __name__ == "__main__":
    test_search()
```

### **Opción 3: Postman/Insomnia**

Importa esta colección:

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

## ⚡ **Tips de Performance**

### **1. Limitar `top_k`**
```json
{
  "query": "pasta",
  "top_k": 5  // ✅ Más rápido que 50
}
```

### **2. Desactivar `include_full_recipe` si no lo necesitas**
```json
{
  "query": "pasta",
  "include_full_recipe": false  // ✅ No carga JSONs
}
```

### **3. Usar filtros para reducir el espacio de búsqueda**
```json
{
  "query": "pasta",
  "category": "dinner",  // ✅ Solo busca en recetas de cena
  "top_k": 5
}
```

---

## 🐛 **Errores Comunes**

### **Error 1: 422 Validation Error**

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

**Solución:** El campo `query` es obligatorio.

### **Error 2: 500 Internal Server Error**

```json
{
  "detail": "Search failed: [Errno 8] nodename nor servname provided, or not known"
}
```

**Solución:** Verifica que Supabase esté configurado correctamente en `.env`.

---

## 📚 **Documentación Completa**

Una vez que la API esté corriendo:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

¡Todas las rutas, payloads y respuestas documentadas automáticamente! 🚀

