#!/usr/bin/env bash
# Run NeuGate/guardrails unit suites (no live NeuGate required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== backend-search guardrails (unit) =="
cd "${ROOT}/apps/backend-search"
export PYTHONPATH=.
if [[ -x .venv/bin/python ]]; then
  PY=(.venv/bin/python)
elif command -v python3.12 >/dev/null 2>&1; then
  PY=(python3.12)
else
  PY=(python3)
fi
# DiscoveryChatAgent tests import ccai (monorepo package; not a backend-search wheel dep).
"${PY[@]}" -m pip install -q -e "${ROOT}/packages/ccai"
"${PY[@]}" -m pip install -q -e "${ROOT}/packages/jamie-guardrails"
"${PY[@]}" -m pytest \
  tests/test_guardrails_gate.py \
  tests/test_guardrails_inline_fallback.py \
  tests/test_guardrails_chat_agent.py \
  tests/test_guardrails_policy_loader.py \
  tests/test_guardrails_policy_render.py \
  tests/test_guardrails_golden_cooking.py \
  tests/test_guardrails_neugate_client.py \
  tests/test_preprompt_v1_2.py \
  -q --tb=short

echo "== backend-voice guardrails =="
cd "${ROOT}/apps/backend-voice"
if command -v poetry >/dev/null 2>&1; then
  poetry run pytest tests/test_voice_guardrails.py -q --tb=short
else
  echo "Install Poetry (https://python-poetry.org/) to run voice guardrails tests, or run them in CI." >&2
  exit 1
fi

echo "Done."
