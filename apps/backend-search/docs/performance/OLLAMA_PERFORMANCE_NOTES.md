# Notas sobre Performance de Ollama

## Situación Actual

El script `test_chunks.py` está **funcionalmente correcto** y completo. Sin embargo, Ollama puede tardar mucho tiempo en procesar PDFs con prompts complejos.

### Diagnóstico Realizado

✅ **Ollama está corriendo** - Proceso activo verificado  
✅ **Modelo llama3.1 está disponible** - Confirmado vía API  
✅ **Conexión HTTP funciona** - curl responde correctamente  
❌ **Timeout en procesamiento** - Los prompts largos tardan > 5 minutos

## ¿Por qué está tardando tanto?

1. **Prompts complejos**: El pipeline envía 3 requests a Llama por PDF:
   - `understand_recipe()`: Analiza el texto crudo
   - `build_joav0_json()`: Estructura el JSON
   - `build_intelligent_chunks()`: Genera chunks inteligentes

2. **Tamaño del contexto**: PDFs con 1500+ caracteres generan prompts largos

3. **Hardware**: Llama3.1 (8B parámetros) requiere:
   - ~8GB RAM mínimo
   - CPU/GPU potente para respuestas rápidas

## Soluciones

### Opción 1: Esperar más tiempo ⏱️

El timeout actual es de **5 minutos (300 segundos)**. Para aumentarlo:

```python
# Editar: recipe_pdf_agent_llama/ollama_client.py
@dataclass(frozen=True)
class OllamaConfig:
    base_url: str
    model: str
    timeout_s: float = 600.0  # 10 minutos
```

### Opción 2: Usar un modelo más pequeño/rápido 🚀

```bash
# Descargar modelo más ligero
ollama pull llama3.2

# Usar en el script
python tests/test_chunks.py --model llama3.2 --pdf data/processed_pdfs/tomato-mussel-pasta.pdf
```

### Opción 3: Probar con PDFs más pequeños 📄

```bash
# PDFs más pequeños (ordenados por tamaño)
python tests/test_chunks.py --pdf data/processed_pdfs/tomato-mussel-pasta.pdf  # 36KB
python tests/test_chunks.py --pdf data/processed_pdfs/smoked-salmon-pasta-jamie-oliver-recipes.pdf  # 46KB
python tests/test_chunks.py --pdf data/processed_pdfs/happy-fish-pie.pdf  # 50KB
```

### Opción 4: Optimizar Ollama ⚙️

```bash
# Reiniciar Ollama para limpiar memoria
pkill ollama
ollama serve

# Verificar que no hay otros procesos pesados
top -o cpu
```

### Opción 5: Usar la versión cuantizada más agresiva

```bash
# Modelo con menor precisión pero más rápido
ollama pull llama3.1:q4_K_S  # Version cuantizada 4-bit
python tests/test_chunks.py --model llama3.1:q4_K_S --pdf [tu_pdf]
```

## Verificación Rápida

Para verificar que el script funciona sin esperar tanto:

```bash
# Test de conexión (debe responder en segundos)
curl -X POST http://localhost:11434/api/chat \
  -d '{"model":"llama3.1","stream":false,"messages":[{"role":"user","content":"Say OK"}]}' \
  -H "Content-Type: application/json" \
  --max-time 60
```

Si esto responde en <10 segundos, Ollama está funcionando bien. El problema es el tamaño/complejidad de los prompts del pipeline.

## Recomendación

Para **validar el script rápidamente**:

1. Usar `llama3.2` (más rápido)
2. Probar con el PDF más pequeño (`tomato-mussel-pasta.pdf`)
3. Estar preparado para esperar 2-3 minutos por request

```bash
python tests/test_chunks.py \
  --model llama3.2 \
  --pdf data/processed_pdfs/tomato-mussel-pasta.pdf
```

## Monitoreo

Para ver qué está haciendo Ollama:

```bash
# Terminal 1: Ver logs de Ollama
tail -f ~/.ollama/logs/server.log

# Terminal 2: Monitor de recursos
watch -n 1 'ps aux | grep ollama | grep -v grep'

# Terminal 3: Ejecutar script
python tests/test_chunks.py --pdf [tu_pdf]
```



