# RAG Index 3 — governance (Jamie Oliver AI)

**Audience:** engineers and release owners  
**Related:** PRD `JAMIE_OLIVER_AI_GUARDRAILS_PRD.md` (FR-3, FR-4), plan `JAMIE_OLIVER_AI_GUARDRAILS_PLAN.md`, NeuGate input gate (`recipe_search_agent/guardrails/`)

## 1. What “RAG Index 3” means here

**RAG Index 3** is the **versioned recipe retrieval stack** in this monorepo: approved **culinary corpus** → **chunks + metadata** in Supabase → **hybrid semantic search** (`hybrid_recipe_search` / `RecipeSearchAgent`). It is **not** NeuGate; NeuGate is a **separate query gate** that must run **before** recipe retrieval so blocked traffic never pays for embeddings or vector queries (PRD §3.1, FR-3).

| Layer | Responsibility |
|-------|------------------|
| **PrePrompt v1.2** | Model scope, refusals, tool rules (discovery + voice). |
| **NeuGate (+ inline fallback)** | Classify user **input**; short-circuit with pivot; session `gate_blocked` for tool guard. |
| **RAG Index 3** | **Ingest + index quality**; **DB tables + RPC**; embedding model parity ingest ↔ search. |

## 2. Corpus and ingest policy (FR-4)

**In scope for indexed content**

- Recipes ingested through the **approved pipelines** documented under `apps/backend-search/docs/ingestion/` (e.g. PDF → JOAv0 JSON → chunks → Supabase).
- **Jamie / partner culinary content** only. No ad-hoc crawling or third-party full-web text in this index without an explicit product decision.

**Out of scope**

- General knowledge, news, medical, or non-culinary corpora (PRD §4.2).

**Practical rule:** if a document is not from an approved ingest run and culinary source policy, it must **not** be written to `recipe_index` / chunk tables used for live search.

## 3. Technical inventory (current codebase)

| Asset | Role |
|-------|------|
| `recipe_index` | Search metadata and filters (see ingestion docs). |
| `intelligent_recipe_chunks` (and related RPCs, e.g. `match_recipe_chunks`) | Chunk text + **pgvector** embeddings for semantic search (`recipe_search_agent/search.py`). |
| `RecipeSearchAgent._generate_embedding` | Query embedding; model name **must match ingestion** (default `BAAI/bge-small-en-v1.5`). |
| `recipe_search_agent/discovery_tools.py` | Tool entry points; **must** respect `is_gate_blocked()` so no `search()` / embeddings on gated turns. |
| `recipe_search_agent/api.py` | REST `POST /api/v1/recipes/search` — gate before agent search when enabled. |

**Index / model version**

- Treat **`BAAI/bge-small-en-v1.5`** as the **embedding model ID** for “this index generation”. Any change to model or dimensions requires a **full re-embed** of chunk tables and a coordinated release (see rollback).

Document **prompt** version separately: `PREPROMPT_VERSION` / discovery revision in `prompts.py` — that is PrePrompt, not the vector index.

## 4. Operational gates (orchestration)

1. User message → **NeuGate evaluation** (if `NEUGATE_ENABLED`) → `short_circuit` **or** `proceed`.
2. **Only if proceed** and session not blocked: discovery tools / REST search may call `RecipeSearchAgent.search()` → embeddings + hybrid retrieval.
3. **Never** run semantic recipe retrieval for a turn that is gate-blocked (enforced in tools + API; see plan §1).

## 5. Rollback and re-index

| Scenario | Action |
|----------|--------|
| Bad ingest batch | Stop writes; restore Supabase **backup** or re-run ingest from last known-good artifact; validate row counts and sample queries. |
| Wrong embedding model / dimension mismatch | Re-embed all chunks with the correct model; deploy search code that uses the same model string; smoke hybrid search in staging. |
| NeuGate / policy hotfix only | Independent of index — deploy NeuGate or Jamie policy JSON; no re-index required unless categories affect ingest (rare). |
| Emergency disable of gating | `NEUGATE_ENABLED=false` bypasses NeuGate HTTP; **does not** remove RAG tables. Use only operationally; PrePrompt still applies. |

## 6. Release checklist (touching RAG)

- [ ] Ingest change note: source approval, schema/JOAv0 version if applicable.
- [ ] Embedding model unchanged **or** full re-embed completed and verified.
- [ ] Staging: hybrid search smoke + golden cooking sample (see `tests/fixtures/golden_cooking.json`).
- [ ] NeuGate / red-team certification when policy or classifier changes (`test_guardrails_certification.py`, manual workflow).
- [ ] Bump any **internal** “index generation” tag in runbooks or tickets (Linear) so support knows which Supabase snapshot matches the release.

## 7. References

- `apps/backend-search/docs/ingestion/INGESTION.md`, `CHUNKING_SEMANTIC.md`, `PDF_Recipe_Agent*.md`
- `apps/backend-search/docs/design/SEARCH_AGENT_DESIGN.md`
- `apps/backend-search/recipe_search_agent/search.py` (`RecipeSearchAgent`, `hybrid_recipe_search`)
