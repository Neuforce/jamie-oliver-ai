# Test Chunks - Script de Visualización

Script para visualizar los chunks inteligentes generados por Llama a partir de PDFs de recetas, sin guardarlos en la base de datos.

## Requisitos Previos

1. **Ollama instalado y corriendo**
   ```bash
   # Verificar si Ollama está corriendo
   curl http://localhost:11434/api/tags
   
   # Si no está corriendo, iniciarlo
   ollama serve
   ```

2. **Modelo Llama3.1 instalado**
   ```bash
   ollama pull llama3.1
   ```

3. **Entorno virtual activado con dependencias instaladas**
   ```bash
   cd jamie-oliver-ai
   source .venv/bin/activate
   ```

4. **Paciencia** ⏱️
   - El procesamiento con Llama puede tardar **2-5 minutos** por PDF
   - Ollama está configurado con timeout de 5 minutos
   - El primer request después de iniciar Ollama puede ser más lento

## Uso

### Procesar PDF por defecto (happy-fish-pie.pdf)
```bash
python tests/test_chunks.py
```

### Procesar un PDF específico
```bash
python tests/test_chunks.py --pdf data/processed_pdfs/beef-quince-stew-beef-recipes-jamie-oliver.pdf
```

### Usar un modelo diferente
```bash
python tests/test_chunks.py --model llama3.2
```

### Ver logs detallados
```bash
python tests/test_chunks.py --verbose
```

### Ver ayuda completa
```bash
python tests/test_chunks.py --help
```

## Salida del Script

El script muestra:

1. **Proceso de extracción**: Pasos del pipeline con indicadores de progreso
2. **Chunks individuales**: Cada chunk con:
   - Número de chunk (ej: Chunk 1/5)
   - Search intent (intención de búsqueda)
   - Tamaño en caracteres
   - Hash SHA256 (primeros 16 caracteres)
   - LLM Analysis (metadata generada por Llama)
   - Texto completo del chunk (formateado a 80 caracteres por línea)

3. **Estadísticas agregadas**:
   - Total de chunks generados
   - Tamaño promedio/mínimo/máximo
   - Lista de search intents únicos

## Ejemplo de Salida

```
============================================================
Processing: happy-fish-pie.pdf
============================================================

Step 1: Extracting text from PDF...
✓ Extracted 1866 characters

Step 2: Understanding recipe with Llama...
✓ Recipe understood
  Title: Happy Fish Pie

Step 3: Building JOAv0 structure...
✓ JOAv0 document created

Step 4: Generating intelligent chunks...
✓ Generated 5 chunks

============================================================
CHUNKS
============================================================

Chunk 1/5
────────────────────────────────────────
Search Intent: quick weeknight fish dinners
Size: 145 characters
Hash: a1b2c3d4e5f6g7h8...
Analysis: {"keywords": ["fish", "pie", "easy"], "difficulty": "medium"}

Text:
  Happy Fish Pie is a comforting family meal featuring white fish
  and salmon in a creamy sauce, topped with golden mashed potatoes.
  Perfect for weeknight dinners.

[... más chunks ...]

============================================================
STATISTICS
============================================================
Total chunks: 5
Average size: 132.4 characters
Min size: 87 characters
Max size: 201 characters

Search Intents (5):
  1. quick weeknight fish dinners
  2. family-friendly seafood recipes
  3. comfort food with fish
  4. easy fish pie recipe
  5. creamy baked fish dishes
```

## Características

- ✅ **Sin persistencia**: No guarda en Supabase (usa `no_db=True`)
- ✅ **Formato legible**: Colores ANSI para terminal
- ✅ **Estadísticas útiles**: Métricas agregadas de los chunks
- ✅ **Flexible**: Acepta cualquier PDF de receta
- ✅ **Verbose mode**: Para debugging con `--verbose`

## Notas

- El script usa el pipeline completo de Llama pero NO guarda los chunks en la base de datos
- Los chunks se generan en memoria y se muestran en pantalla solamente
- Ideal para validar cómo Llama está interpretando y chunkeando las recetas
- Los PDFs deben estar en formato compatible con PyMuPDF

## Troubleshooting

### Error: "Ollama not running" o "timed out"
```bash
# 1. Verificar que Ollama está corriendo
ps aux | grep ollama

# 2. Si no está corriendo, iniciarlo
ollama serve

# 3. Verificar que responde
curl http://localhost:11434/api/tags

# 4. Si está muy lento, reiniciar Ollama
pkill ollama
ollama serve
```

**Nota sobre timeouts**: Si Ollama está tardando mucho:
- Verificar uso de CPU/memoria (Llama usa mucha RAM)
- Probar con un PDF más pequeño primero (ej: `tomato-mussel-pasta.pdf`)
- Aumentar el timeout en `recipe_pdf_agent_llama/ollama_client.py` (actualmente 300s)
- Considerar usar un modelo más pequeño como `llama3.2`

### Error: "Model llama3.1 not found"
```bash
# Descargar el modelo
ollama pull llama3.1

# O usar un modelo más pequeño/rápido
ollama pull llama3.2
python tests/test_chunks.py --model llama3.2 --pdf [tu_pdf]
```

### Error: "PDF file not found"
```bash
# Verificar que el PDF existe
ls -la data/processed_pdfs/
```

### Error: "ModuleNotFoundError"
```bash
# Asegurarse de que el venv está activado
source .venv/bin/activate
```

### El script se "congela" en Step 2
Esto es **normal** - Llama está procesando el texto. Puede tardar 2-5 minutos.
Para ver progreso, ejecutar con `--verbose`:
```bash
python tests/test_chunks.py --pdf [tu_pdf] --verbose
```

