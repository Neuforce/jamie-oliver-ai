#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d ".venv" ]]; then
  echo "Creating venv (.venv) ..."
  python3 -m venv .venv
fi

source .venv/bin/activate
python -m pip install -U pip >/dev/null
python -m pip install -e . >/dev/null

echo "Starting watcher on data/recipes ..."
recipe-pdf watch data/recipes


