# Python Version Requirements

## Problema con Python 3.14+

El backend-search requiere `fastembed` y `onnxruntime`, que actualmente **no tienen builds disponibles para Python 3.14+**.

## Versiones Soportadas

- ✅ **Python 3.10** - Compatible
- ✅ **Python 3.11** - Recomendado
- ✅ **Python 3.12** - Recomendado
- ❌ **Python 3.13** - Puede tener problemas
- ❌ **Python 3.14+** - No compatible

## Solución: Usar Python 3.11 o 3.12

### Opción 1: Usar pyenv (Recomendado)

```bash
# Instalar Python 3.11
pyenv install 3.11.9

# Establecer versión local para el proyecto
cd apps/backend-search
pyenv local 3.11.9

# Crear virtual environment
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Opción 2: Usar Python del Sistema

Si tienes Python 3.11 o 3.12 instalado:

```bash
cd apps/backend-search
python3.11 -m venv .venv
# o
python3.12 -m venv .venv

source .venv/bin/activate
pip install -e .
```

### Opción 3: Instalar Python 3.11/3.12

**macOS (Homebrew):**
```bash
brew install python@3.11
# o
brew install python@3.12
```

**Linux:**
```bash
sudo apt-get install python3.11 python3.11-venv
# o
sudo apt-get install python3.12 python3.12-venv
```

## Verificar Versión

```bash
python3 --version
# Debe mostrar: Python 3.11.x o Python 3.12.x
```

## Scripts Actualizados

Los scripts `dev-backend-search.sh` y `fix-backend-search.sh` ahora:
- Detectan automáticamente Python 3.14+
- Muestran advertencia y sugerencias
- Intentan usar `python3.11` o `python3.12` si están disponibles
