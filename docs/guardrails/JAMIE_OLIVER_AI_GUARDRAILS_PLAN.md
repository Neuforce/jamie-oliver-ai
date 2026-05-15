# Plan — Jamie Oliver AI: guardrails, moderation, and evaluation

| Field | Value |
|--------|--------|
| **Reference** | `JAMIE_OLIVER_AI_GUARDRAILS_PRD.md` |
| **Linear** | [NEU-622](https://linear.app/neuforce/issue/NEU-622) |
| **Deliverables** | PrePrompt v1.2, RAG Index 3 agreement, eval suite, technical gates |

**Defaults until Supertab sign-off:** see PRD **§14–§15** (crisis without URLs, food-only on mixed prompts, EN-GB MVP, generic disclaimer, minimal logs, no moderation API in MVP, documented release thresholds).

## 1. Principles

1. **Defense in depth**: no single layer replaces the others; PrePrompt + orchestration + (optional) moderation + RAG gate.
2. **Measurable**: each milestone unlocks red-team suite runs.
3. **MVP first**: system policy + simple intent gate before expensive third-party services.
4. **Zero retrieval on block**: orchestration must ensure **no** Supabase/pgvector semantic recipe query and **no** embedding work **for the recipe-search path** when the gate marks input as guardrail violation, prohibited topic, or out-of-scope (non-recipe). Avoid wasting **DB**, **latency**, and **tokens** on traffic we already turn away.
5. **Redirect, don’t debate**: PrePrompt copy instructs the model to avoid argument or long discussion on sensitive/prohibited subjects; one short, warm pivot to cooking.

## 2. Phases

### Phase 0 — Alignment (Week 0)

**Deliverables**

- Frozen category list and examples (client table + agreed variants).
- Definition of **expected behavior** per category (refusal, redirection, crisis resource if applicable).
- Owners: product + engineering + legal/compliance advisor if available.

**Exit criteria**

- PrePrompt vs RAG matrix reviewed and signed off for implementation.

### Phase 1 — PrePrompt v1.2 (Weeks 1–2)

**Work**

- Draft the policy block in English (or primary model language) consistent with Jamie’s tone.
- **Pivot copy (provisional)**: **British** English, brief and kind; see PRD §12 (*mate*, *right*, *wheelhouse*, open question toward recipes). Replace when brand approves final copy.
- Add explicit rules: no weapons, no illegality, no hate, no PII, no medical/conspiracy misinformation, no sexual content, no self-harm/ED instruction, etc.
- Tool rule: **do not invent recipes** (existing) + **do not call recipe search tools** when the message is gated negative—**orchestration enforces this** even if the model misbehaves (classifier/heuristic when available).

**Code targets**

- Discovery: `apps/backend-search/recipe_search_agent/prompts.py` + wiring in `chat_agent.py`.
- Voice: `apps/backend-voice/src/config/prompts.py`.

**Exit criteria**

- Version labeled `preprompt-v1.2` in repo (tag or constant + CHANGELOG).

### Phase 2 — Orchestration and RAG Index 3 (Weeks 2–3)

**Work**

- **Query gate** placed **before** any recipe path that computes **query embeddings** or calls **semantic_recipe_search** / Supabase vector paths: if the message is high-risk, prohibited, or hard off-topic / not cooking discovery, respond from a **no-RAG** branch (short LLM reply or template only).
- Document **RAG Index 3**: tables/chunks, ingest policy, exclusions, index version in release process.
- Assess whether extra SQL filtering is needed (usually low for recipe-only corpus; main value is **not entering** the vector pipeline when gated).

**Exit criteria**

- Documented flow diagram (input → **gate** → (blocked: no-embed / no-DB) OR (allowed: LLM + tools + search) → output).
- Deployment checklist: “index version X compatible with gate Y.”
- Staging evidence: blocked prompts produce **no** semantic search calls (metrics or integration tests).

### Phase 3 — Optional moderation (Weeks 3–4, parallel if budget allows)

**Work**

- Evaluate vendor (e.g. OpenAI moderation) vs a small classifier.
- Integrate on **input**; assess **output** for the voice pipeline.

**Exit criteria**

- Agreed latency SLO; fallbacks if the service fails (default: conservative behavior).

### Phase 4 — Eval and red teaming (continuous from Phase 1)

**Work**

- Versioned dataset (YAML/JSON): prompt, expected category, expected behavior (refuse / redirect / crisis template).
- Scripts or tests that hit staging and validate criteria (keyword asserts + periodic human review).
- Expand with paraphrases and “boundary pushing” attacks from the client table.
- Include assertions that gated prompts **never** trigger recipe semantic search (automated where possible).

**Exit criteria**

- Minimum per-category threshold agreed; block release on critical regressions.
- Red-team includes **non-debate** and **cooking-only pivot** checks for prohibited categories.

## 3. Roles

| Role | Responsibility |
|------|----------------|
| Tech lead | Gate architecture, PR review |
| Backend | `chat_agent`, search API, moderation integration |
| ML/Eval (if any) | Dataset, metrics, runs |
| Product | Prioritization, refusal-message copy |

## 4. Technical dependencies

- Feature flags or staging with the same model as prod when possible.
- Secrets for moderation APIs if used.

## 5. Operational risks and mitigation

| Risk | Mitigation |
|------|------------|
| False positives on cooking | Mandatory “golden” culinary questions in eval |
| Latency | Async gate only if viable; else small model or heuristics |
| Drift between discovery and voice | Same base policy; separate cases in suite |

## 6. MVP acceptance checklist

- [ ] PrePrompt v1.2 shipped in discovery and voice (aligned base text): includes **no debate** + **warm British cooking pivot** on prohibited topics (PRD §12).
- [ ] Gate documented and implemented: when RAG / semantic recipe DB is **not** called; blocked flows do **not** run embeddings for search or hit Supabase vector search.
- [ ] RAG Index 3 documented (version, ingest, rollback).
- [ ] Initial eval suite with client categories run in staging; **zero** semantic recipe queries for blocked cases (verified).
- [ ] Linear updated with links to PRD/plan and PRs.

---

*Operational plan for NeuForce. Adjust dates to team capacity.*
