# 🎯 Similarity Threshold - Control de Umbral de Similitud

## ¿Qué es `similarity_threshold`?

El **umbral de similitud** es el score mínimo que debe tener un resultado para ser incluido en la respuesta.

```
similarity_threshold = N  (donde 0 < N ≤ 1)

Solo retorna recetas con: similarity_score >= N
```

---

## 📊 **Valores y Su Significado**

| Threshold | Descripción | Cuándo Usar |
|-----------|-------------|-------------|
| `0.1-0.2` | Muy permisivo | Exploración amplia, "muéstrame cualquier cosa relacionada" |
| **`0.3`** | **Default - Balanceado** | Uso general, buenos resultados |
| `0.4-0.5` | Moderadamente estricto | Mejores matches, menos ruido |
| `0.6-0.7` | Estricto | Solo resultados muy relevantes |
| `0.8-0.9` | Muy estricto | Solo matches casi exactos |
| `0.95+` | Extremadamente estricto | Prácticamente idénticos |

---

## 📝 **Ejemplos de Payloads**

### **Ejemplo 1: Default (threshold = 0.3)**

```json
{
  "query": "quick pasta",
  "top_k": 10
  // similarity_threshold no especificado, usa default = 0.3
}
```

**Comportamiento:**
- Retorna recetas con `similarity_score >= 0.3`
- Balance entre cantidad y calidad

---

### **Ejemplo 2: Threshold Bajo (más resultados)**

```json
{
  "query": "pasta",
  "top_k": 20,
  "similarity_threshold": 0.2
}
```

**Comportamiento:**
- Retorna recetas con `similarity_score >= 0.2`
- **Más resultados**, pero menos precisos
- Útil para exploración

---

### **Ejemplo 3: Threshold Alto (solo mejores matches)**

```json
{
  "query": "tomato mussel pasta",
  "top_k": 5,
  "similarity_threshold": 0.7
}
```

**Comportamiento:**
- Solo recetas con `similarity_score >= 0.7`
- **Menos resultados**, pero muy precisos
- Útil para búsquedas específicas

---

### **Ejemplo 4: Threshold Muy Alto (casi exacto)**

```json
{
  "query": "christmas salad jamie oliver",
  "top_k": 3,
  "similarity_threshold": 0.85
}
```

**Comportamiento:**
- Solo recetas con `similarity_score >= 0.85`
- **Muy pocos resultados** (o ninguno si no hay matches exactos)
- Útil para verificar si existe una receta específica

---

## 🔍 **Cómo Funciona Internamente**

```sql
-- En la función SQL hybrid_recipe_search()

WHERE 
  (1 - (c.embedding <=> query_embedding))::FLOAT > similarity_threshold
  
-- Si similarity_threshold = 0.7:
-- Solo vectores con distancia coseno < 0.3 (similitud > 0.7)
```

**Flujo:**
```
1. Calcula similitud con todas las recetas
2. FILTRA: solo las que cumplen similarity_score >= threshold
3. Ordena por score (mayor a menor)
4. Retorna top K de las filtradas
```

---

## 📊 **Visualización**

```
Todas las recetas con sus scores:

1. TOMATO & MUSSEL PASTA     → 0.850  ✅ threshold >= 0.7
2. Smoked Salmon Pasta        → 0.750  ✅ threshold >= 0.7
3. Happy fish pie             → 0.680  ❌ threshold < 0.7
4. Christmas salad            → 0.590  ❌ threshold < 0.7
5. Somali Beef Stew           → 0.450  ❌ threshold < 0.7
...

Con threshold = 0.7 y top_k = 5:
→ Solo retorna recetas 1 y 2 (total: 2)
  Aunque pediste top_k=5, solo 2 cumplen el umbral
```

---

## 🎯 **Casos de Uso Reales**

### **Caso 1: Búsqueda General (threshold bajo)**

```json
{
  "query": "dinner ideas",
  "top_k": 20,
  "similarity_threshold": 0.25
}
```

**Objetivo:** Explorar muchas opciones
**Resultado:** ~15-20 recetas variadas

---

### **Caso 2: Búsqueda Específica (threshold medio)**

```json
{
  "query": "quick pasta with seafood",
  "top_k": 5,
  "similarity_threshold": 0.5
}
```

**Objetivo:** Resultados relevantes
**Resultado:** ~3-5 recetas relevantes

---

### **Caso 3: Verificación Exacta (threshold alto)**

```json
{
  "query": "christmas salad",
  "top_k": 1,
  "similarity_threshold": 0.8
}
```

**Objetivo:** ¿Existe exactamente esta receta?
**Resultado:** 0-1 recetas (solo si hay match casi exacto)

---

### **Caso 4: Autocompletado (threshold medio-alto)**

```json
{
  "query": "chri",  // Usuario está escribiendo
  "top_k": 5,
  "similarity_threshold": 0.6
}
```

**Objetivo:** Sugerencias mientras escribe
**Resultado:** Solo recetas bastante relacionadas

---

## ⚡ **Impacto en Performance**

```python
# Performance NO cambia significativamente

threshold = 0.1  → ~250ms (retorna ~50 recetas)
threshold = 0.5  → ~245ms (retorna ~10 recetas)
threshold = 0.9  → ~240ms (retorna ~1 receta)

# El cálculo de similitud es el mismo
# Solo cambia cuántas se filtran y retornan
```

---

## 🧪 **Experimento: Diferentes Thresholds**

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
    print(f"  Resultados: {data['total']}")
    
    if data['results']:
        top = data['results'][0]
        print(f"  Top score: {top['similarity_score']:.3f}")
        print(f"  Top: {top['title']}")

# Output esperado:
# Threshold 0.2:
#   Resultados: 15
#   Top score: 0.707
#   Top: TOMATO & MUSSEL PASTA
#
# Threshold 0.4:
#   Resultados: 8
#   Top score: 0.707
#   Top: TOMATO & MUSSEL PASTA
#
# Threshold 0.6:
#   Resultados: 2
#   Top score: 0.707
#   Top: TOMATO & MUSSEL PASTA
#
# Threshold 0.8:
#   Resultados: 0
```

---

## 💡 **Recomendaciones**

### **Para UI General:**
```json
{
  "query": user_query,
  "top_k": 10,
  "similarity_threshold": 0.3  // Default, funciona bien
}
```

### **Para Búsqueda Avanzada:**
```json
{
  "query": user_query,
  "top_k": 20,
  "similarity_threshold": user_selectable_threshold  // Slider 0.2-0.8
}
```

### **Para Autocompletado:**
```json
{
  "query": partial_query,
  "top_k": 5,
  "similarity_threshold": 0.5  // Solo resultados buenos
}
```

### **Para Verificación:**
```json
{
  "query": exact_title,
  "top_k": 1,
  "similarity_threshold": 0.85  // Casi exacto
}
```

---

## 🔄 **Combinación con Filtros**

```json
{
  "query": "pasta",
  "category": "dinner",
  "complexity": "easy",
  "similarity_threshold": 0.5,
  "top_k": 5
}
```

**Comportamiento:**
1. Filtra por category = "dinner" y complexity = "easy"
2. Calcula similitud solo con las recetas filtradas
3. Retorna las que tienen similarity >= 0.5
4. Limita a top 5

**Resultado:** Pocas recetas pero MUY relevantes

---

## ⚠️ **Cuidado con Thresholds Muy Altos**

```json
{
  "query": "pasta",
  "similarity_threshold": 0.95,
  "top_k": 10
}
```

**Problema:** Puede retornar 0 resultados!

**Solución:** Implementa fallback:

```python
def search_with_fallback(query, threshold=0.7, fallback_threshold=0.4):
    # Intenta con threshold alto
    results = search(query, similarity_threshold=threshold)
    
    if len(results) < 3:  # Muy pocos resultados
        # Intenta con threshold más bajo
        results = search(query, similarity_threshold=fallback_threshold)
    
    return results
```

---

## 📝 **Resumen**

```
similarity_threshold = Filtro de calidad

• Default: 0.3 (balanceado)
• Rango: 0.0 - 1.0
• Bajo (0.1-0.3): Más resultados, menos precisión
• Medio (0.4-0.6): Balance cantidad/calidad
• Alto (0.7-0.9): Pocos resultados, muy precisos
• Muy alto (0.95+): Casi exactos (puede retornar 0)

Combina con top_k:
  • threshold = filtro de CALIDAD
  • top_k = límite de CANTIDAD
```

---

## 🚀 **Probarlo**

```bash
# Inicia la API
./scripts/start_api.sh

# En Python
python -c "
import requests
response = requests.post(
    'http://localhost:8000/api/v1/recipes/search',
    json={
        'query': 'pasta',
        'top_k': 10,
        'similarity_threshold': 0.6  # ← AQUÍ
    }
)
print(response.json()['total'], 'resultados')
"

# O en Swagger UI
open http://localhost:8000/docs
```

¡Ahora tienes control total sobre la calidad de los resultados! 🎯

