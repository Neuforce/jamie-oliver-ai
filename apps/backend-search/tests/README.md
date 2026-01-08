# Tests

Este directorio contiene todos los tests del backend-search.

## Archivos

- **`test_api_examples.py`**: Tests de ejemplos de uso de la API
- **`test_chunker.py`**: Tests del chunker de recetas
- **`test_chunks.py`**: Tests de chunks generados
- **`test_search_agent.py`**: Tests del agente de búsqueda semántica
- **`test_workflow_locally.sh`**: Script para probar el workflow completo localmente

## Ejecutar Tests

```bash
# Todos los tests
pytest tests/

# Test específico
pytest tests/test_search_agent.py

# Con verbose
pytest tests/ -v

# Workflow local completo
bash tests/test_workflow_locally.sh
```
