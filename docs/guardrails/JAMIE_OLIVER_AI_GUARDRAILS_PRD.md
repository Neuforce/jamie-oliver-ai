# PRD — Jamie Oliver AI: guardrails, moderation, and evaluation

| Field | Value |
|--------|--------|
| **Product** | Jamie Oliver AI (recipe discovery, in-kitchen voice, semantic search) |
| **Type** | Product requirements / responsible-use alignment |
| **Status** | Draft for client sign-off |
| **Linear** | [NEU-622](https://linear.app/neuforce/issue/NEU-622) |
| **Related** | Red teaming, content moderation, AI guardrails (per client brief) |

## 1. Summary

Define and implement **explicit policies** and **technical layers** so the assistant stays within the culinary domain, refuses harmful or out-of-policy requests, and **does not trigger recipe RAG retrieval** when inappropriate. **Product guarantees:** no wasted **semantic DB / embedding-for-search** work on gated traffic; **no** debate on prohibited topics—only a **brief, warm** pivot to cooking (see §12). The work includes versioning **PrePrompt v1.2**, aligning index governance with **RAG Index 3**, and a reproducible **evaluation architecture** (red teaming with the agreed prompt set).

## 2. Context and problem

Today, safer behavior is largely **implicit**: system prompts focused on cooking (`discovery`, `voice`) and a recipe corpus that bounds context. That is not a substitute for:

- Written refusal / redirection policy (incl. crisis handling where applicable).
- **Input** classification or moderation and, where needed, **output** moderation (especially voice / TTS).
- **Orchestration** rules (e.g. do not run semantic search for certain intents).
- Versioned **eval** that demonstrates compliance against the category matrix and adversarial variants.

## 3. Goals

1. **Product**: On-brand responses; clear, brief handling of prohibited topics; steer back to cooking where possible without heavy-handed moralizing.
2. **Engineering**: Document **PrePrompt v1.2** vs **RAG Index 3** responsibilities per the client matrix; implement defense in depth (see technical plan).
3. **Governance**: Evaluation dataset + pass/fail criteria + traceability by prompt and index version.

### 3.1 Non-negotiable product guarantees

1. **No wasted retrieval**: If the user message is **out of scope** (not recipe / cooking discovery), **violates guardrails**, or targets **prohibited topics**, the system must **not** run the semantic recipe pipeline—**no** query embedding for that path, **no** `semantic_recipe_search` / Supabase vector retrieval, and **no** tool calls whose purpose is recipe search. The response may still use the LLM with **minimal context** (policy + short reply), but not recipe RAG. Goal: avoid unnecessary **latency**, **tokens**, and **database load** on blocked traffic.
2. **No debate, gentle pivot**: The assistant must **not** argue, lecture, or long-form discuss prohibited or sensitive themes. It should **briefly and warmly** invite the user to focus on cooking and offer help with food or recipes instead—consistent with Jamie’s tone, without condescension.

## 4. Scope

### 4.1 In scope

- Risk categories and expected behavior (aligned to the client table: sensitive/harm, privacy, misinformation, illegal, self-harm / ED, hate, manipulation, sexual, adversarial, cultural boundaries, bias, etc.).
- **PrePrompt v1.2**: system block that sets scope, refusal templates, and tool-use rules.
- **RAG / Index 3**: policies for when to run search/retrieval; ingest and index-quality governance; pre-`search` gates where appropriate.
- Optional **input/output moderation** layer (API or classifier model) if latency and cost budgets allow.
- **Eval**: baseline prompts + light paraphrase/jailbreaks; metrics and thresholds; release or CI integration per team capacity.

### 4.2 Out of scope (unless explicitly decided)

- Full legal moderation that replaces the LLM provider’s own policies.
- Large-scale non-culinary content index.
- Formal guarantees of zero failures; the goal is to **reduce risk** and **measure improvements** reproducibly.

## 5. Users and stakeholders

- End users (discovery and assisted cooking).
- Client / brand (trust and safety expectations).
- Product and engineering (build and operate); **Supertab** as intermediary until items in §14–§15 are signed off.
- Team running red teaming and eval review.

## 6. Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | For out-of-policy requests, the assistant must **not** provide harmful instructions or sensitive data (addresses, hacking, etc.). | Must |
| FR-2 | PrePrompt v1.2 must include **culinary scope**, explicit boundaries, and **off-topic** handling with a short, consistent message. | Must |
| FR-2b | On prohibited/sensitive topics, **do not debate** or engage in extended discussion; use a **subtle, kind** redirect to cooking-only help (§3.1, §12). | Must |
| FR-3 | Orchestration: when the gate fires (high-risk, prohibited, or hard off-topic / non-recipe per policy), **short-circuit** before retrieval: **no** semantic recipe search to Supabase/pgvector, **no** embedding computation **for that search path**, and **no** recipe-search tool invocations; minimal or templated reply unless policy explicitly says otherwise. | Must |
| FR-4 | RAG Index 3: document and apply **ingest** rules (approved culinary sources only). The **query gate** must run **before** any recipe retrieval so blocked requests never hit the vector pipeline. | Should |
| FR-5 | Voice mode: consider **output moderation** before TTS if the channel is high risk. | Should |
| FR-6 | Auditable logging (no unnecessary PII): detected category, prompt version, index version, eval outcome (staging environments). | Could |

## 7. Non-functional requirements

- **Latency**: input gate must not harm benign search UX; set a specific target in the plan (e.g. p95 +X ms).
- **Maintainability**: versioned prompts and index; changes to PrePrompt v1.2 or Index 3 trigger the eval suite run.
- **Privacy**: moderation logs minimized to need-to-know and retention per policy.

## 8. Success metrics

- Red-team suite coverage: % of cases with expected behavior by category.
- **Zero-retrieval compliance**: for gated-negative cases, **0** semantic recipe DB calls (verifiable in logs/tests in staging).
- **False positives**: legitimate cooking questions not blocked (fixed sample + exploratory).
- Mean human review time per release (if applicable).
- Fewer reported incidents after shipping v1.2 + Index 3 (define baseline).

## 9. Responsibility matrix (summary)

- **PrePrompt v1.2**: model policy, refusals, tone, tool boundaries, crisis handling when appropriate; **no debate** on prohibited themes—brief redirect to cooking.
- **RAG Index 3 / orchestration**: corpus quality and scope; **gate** runs before retrieval so blocked traffic never hits vector search; avoid enriching context when intent is out-of-domain or high risk.

The client’s detailed table (per-category checkmarks) is the source of truth for **which layer owns** each row in architecture review.

## 10. Risks

- Classifier false positives that frustrate normal cooking use.
- Jailbreaks not covered by the initial eval set.
- Drift between text (discovery) and voice modes.

## 11. Dependencies

- Linear ticket [NEU-622](https://linear.app/neuforce/issue/NEU-622).
- Access to a moderation model/API if adopted (or a decision to use heuristics + a small LLM).
- Staging environment with flags to enable gates without impacting production.

## 12. Provisional copy: British pivot (Jamie)

Until brand/legal approval, **impasse** wording must be **British English**, **short**, **warm**, **no argument** or sermon, and move straight back to **recipes / cooking**. No need to over-explain why not—a natural filler is enough.

**Guidelines**

- Friendly direct address (*mate*, *you*), *right*, *lovely*, *brilliant*, *gorgeous*, *rustle up*, *wheelhouse*, *fancy* (what you’re in the mood for), *shall we*—without overdoing slang.
- One or two sentences maximum before an open question about food.

**Replaceable examples (rotate / vary in implementation)**

1. *Right — I’m here for the food, mate. I can’t help with that, but I’d love to get you sorted with something gorgeous. What are you fancying?*
2. *Tell you what — let’s keep it in the kitchen, yeah? I’ve got loads of ideas. What sort of thing are you after?*
3. *I’m going to park that one — cooking’s my wheelhouse. Shall we find you a cracking recipe instead?*

**Note:** **Provisional** copy; the client may replace with approved lines without changing gate architecture.

## 13. Related documentation

- Implementation plan: `JAMIE_OLIVER_AI_GUARDRAILS_PLAN.md` (same directory / copy at `neuForce/` root).
- Current code references: prompts in `apps/backend-search/recipe_search_agent/prompts.py`, `apps/backend-voice/src/config/prompts.py`; chat and search agent in `apps/backend-search/`.

## 14. Default values (Supertab intermediary — until explicit sign-off)

These unblock **implementation and staging** without waiting on every decision. Any change from Supertab, brand, or legal **replaces** these defaults without changing gate architecture.

| Topic | Agreed default |
|-------|----------------|
| **1. Crisis / self-harm** | **Short** reply: no advice; encourage seeking **professional or local emergency** help; **no** specific phone numbers or URLs until approved. |
| **2. Mixed cooking + sensitive topic** | **Food-only**: if there is a valid culinary request, answer **only** that; **do not feed** the sensitive thread; if prohibited content dominates, **pivot** (§12) with no debate. |
| **3. Languages / markets (MVP)** | **British English** (Jamie voice); other languages out of scope until notice. |
| **4. Release threshold** | See **§15** (market pattern + NeuForce operational default). |
| **5. Legal / UI** | **Generic** provisional disclaimer: assistant limitations, may be wrong, **not** a substitute for professional or emergency advice—replace when legal supplies final copy. |
| **6. Data / logs** | In production: **metadata only** (e.g. gate category, prompt version, correlation id); **do not** store message body unless explicitly required; **short** retention until formal policy. |
| **7. Third-party moderation** | **MVP without external API**: gate + PrePrompt + eval; optional API in a later phase if red team demands it. |

## 15. Release threshold and “market standard”

There is **no single published percentage** (e.g. “97% is the industry standard”) for chat guardrails. Common practice among product and trust & safety teams:

- **Zero tolerance on a “critical” subset** (e.g. severe harm instructions, child sexual exploitation, weapons): **100%** correct behavior on the **agreed fixed suite**; **any fail blocks release** until hotfix.
- **Rest of suite**: high bar (**e.g. ≥95–99%** expected behavior) **or** severity taxonomy (no P0/P1 failures without explicit review).
- **False positives on cooking**: golden sample with almost no blocks; explicit threshold (e.g. ≤1–2% on fixed sample or zero on product P0 cases).

**NeuForce operational default (replaceable by Supertab):**

- **Critical** categories from spreadsheet / client matrix: **0 failures** on eval before production.
- **Full suite** (non-critical): **≥95%** pass, with failures reviewed; **<95%** needs justification or a fix.
- **Legitimate cooking** (golden set): **≥98%** not blocked by gate (target; tune with real data).

§15 is **criteria documentation**; concrete tooling (scripts, dashboards) follows the technical plan.

---

*Prepared for NeuForce / Jamie Oliver AI. Defaults §14–§15 until Supertab / brand / legal confirmation.*
