# Python version requirements

## Issue with Python 3.14+

backend-search requires `fastembed` and `onnxruntime`, which **do not currently ship builds for Python 3.14+**.

## Supported versions

- ✅ **Python 3.10** — Supported
- ✅ **Python 3.11** — Recommended
- ✅ **Python 3.12** — Recommended
- ❌ **Python 3.13** — May cause issues
- ❌ **Python 3.14+** — Not supported

## Fix: Use Python 3.11 or 3.12

### Option 1: pyenv (recommended)

```bash
# Install Python 3.11
pyenv install 3.11.9

# Set local version for this project
cd apps/backend-search
pyenv local 3.11.9

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Option 2: System Python

If Python 3.11 or 3.12 is already installed:

```bash
cd apps/backend-search
python3.11 -m venv .venv
# or
python3.12 -m venv .venv

source .venv/bin/activate
pip install -e .
```

### Option 3: Install Python 3.11/3.12

**macOS (Homebrew):**

```bash
brew install python@3.11
# or
brew install python@3.12
```

**Linux:**

```bash
sudo apt-get install python3.11 python3.11-venv
# or
sudo apt-get install python3.12 python3.12-venv
```

## Check version

```bash
python3 --version
# Should show Python 3.11.x or 3.12.x
```

## Script behavior

The `dev-backend-search.sh` and `fix-backend-search.sh` scripts now:

- Automatically detect Python 3.14+
- Show warnings and suggestions
- Try to use `python3.11` or `python3.12` when available
