# feat(guardrails): NeuGate discovery + voice + search API, eval, CI (NEU-622)

## Summary

Implements the guardrails slice for [NEU-622](https://linear.app/neuforce/issue/NEU-622): NeuGate (**`POST /v1/evaluate`** with `project_id` + **`policy`**), PrePrompt v1.2 (discovery + voice), Jamie policy from `config/guardrails/jamie-policy.json`, fail-safe and tool guard, REST search gate, optional inline fallback when NeuGate errors, optional **FR-5** output check before TTS, CI, and documentation.

**Discovery (`backend-search`)**

- **Gate:** `recipe_search_agent/guardrails/` — `evaluate_message` before `SimpleBrain.process()`; blocked turn streams pivot, no brain, `reset_gate_blocked()` so `ContextVar` does not leak.
- **Tool guard:** `search_recipes` / mood / plan skip `RecipeSearchAgent.search()` and embeddings when `is_gate_blocked()`.
- **REST:** `POST /api/v1/recipes/search` runs gate before semantic search; `X-Correlation-ID` (or generated UUID); response fields `guardrail_blocked`, `guardrail_category`.
- **Inline fallback:** `inline_fallback.py` + `NEUGATE_INLINE_FALLBACK_ON_ERROR` (default on) — conservative substring block when NeuGate is enabled but unreachable; else fail-safe `proceed`.
- **Logging:** structured `extra` on gate paths (`preprompt_version`, `correlation_id`, `gate_category`, `gate_source`, `guardrail_blocked`) where applicable.

**Voice (`backend-voice`)**

- **`CookingVoiceAssistant.brain_process`:** gate user transcript before brain; on block, `synth_and_send(pivot)` and skip super (no memory ingest); `reset_gate_blocked()`.
- **FR-5 (optional):** `NEUGATE_OUTPUT_MODERATION_ENABLED` + `NEUGATE_OUTPUT_MODERATION_MIN_CHARS` — second NeuGate pass on assistant text **after** TTS enrichment, before ElevenLabs; only when `NEUGATE_ENABLED=true`.
- **Package** `src/guardrails/` (config, gate, client, policy loader, inline fallback) + `config/guardrails/jamie-policy.json` copy; `httpx` in Poetry; `package-mode = false`, pytest asyncio mode.

**Docs / ops**

- `docs/guardrails/RAG_INDEX_3.md` — ingest, tables, rollback, release checklist; PRD §13 link.
- **Plan** `JAMIE_OLIVER_AI_GUARDRAILS_PLAN.md` — **closed (engineering)**; follow-up = merge/deploy/Linear/Later phases only.

**CI & local tests**

- `.github/workflows/guardrails-unit.yml` — unit guardrails tests (search + voice), **no** live certification.
- `.github/workflows/guardrails-certification.yml` — **`workflow_dispatch`** only; requires secrets `NEUGATE_URL` (+ `NEUGATE_API_KEY` if needed); `pytest -m guardrails`.
- `Makefile` **`test-guardrails`** + `scripts/test-guardrails.sh`; documented in root `README.md`.

**Defaults**

- `NEUGATE_ENABLED` **false** by default (omit env or explicit `false`); documented in `.env.example` files.

## NeuGate dependency

Ship with `NEUGATE_ENABLED=false` until NeuGate is deployed. Enable on staging after smoke. Certification workflow is manual.

## Test plan

**Unit (no live NeuGate required)**

```bash
make test-guardrails
# or see README.md → Guardrails unit tests
```

**Live certification (NeuGate reachable)**

```bash
export NEUGATE_ENABLED=true
export NEUGATE_URL=http://localhost:8080
export NEUGATE_API_KEY=<if required>
cd apps/backend-search
PYTHONPATH=. python -m pytest tests/test_guardrails_certification.py -m guardrails -v
```

**Manual (staging)**

- [ ] `NEUGATE_ENABLED=false` — discovery and voice UX unchanged (bypass).
- [ ] `NEUGATE_ENABLED=true` + NeuGate up — pivots on violations; no recipe search on blocked turns; REST search returns empty + `guardrail_blocked` when gated.
- [ ] NeuGate down + flag on — fail-safe `proceed` (or inline block on substring when fallback on).
