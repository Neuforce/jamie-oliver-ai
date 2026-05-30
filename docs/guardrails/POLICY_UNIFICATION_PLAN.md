# Plan: unificación de policy de guardrails (Jamie)

**Objetivo:** una sola fuente de verdad para las reglas de safety compartidas entre NeuGate y el PrePrompt.  
**Fuera de alcance:** persona Jamie, reglas de UI/tools, `inline_fallback` (fase 2 opcional).  
**Relacionado:** `JAMIE_OLIVER_AI_GUARDRAILS_PLAN.md`, NEU-622.

---

## 1. Problema

Hoy la misma intención vive en dos sitios:

| Artefacto | Ubicación | Consumidor |
|-----------|-----------|------------|
| `jamie-policy.json` | `apps/backend-search/config/guardrails/` + copia en `backend-voice` | NeuGate (`POST /v1/evaluate`), inline fallback (pivots) |
| `GUARDRAILS_POLICY_BLOCK` | `prompts.py` (search + voice) | System prompt del LLM |

Riesgo: cambiar uno y olvidar el otro → drift entre gate y modelo.

---

## 2. Estado objetivo

```text
packages/jamie-guardrails/
  jamie_guardrails/data/jamie-policy.json   ← policy canónica
  jamie_guardrails/policy.py                ← load, neugate_policy, render_preprompt_block
  jamie_guardrails/gate.py                  ← evaluate_message (+ client, inline fallback, config)
         │
         ├─► pip install -e (search + voice, como ccai)
         │
         ├─► NeuGate body `policy` (critical_blocks, soft_blocks, pivot_templates)
         │
         └─► render_preprompt_block(discovery|voice) → prompts.py
```

Apps mantienen `recipe_search_agent/guardrails/` y `src/guardrails/` como **re-exports finos** (imports estables + `@patch` en tests apuntan a `jamie_guardrails.*`).

- **NeuGate** sigue recibiendo el mismo shape: `critical_blocks`, `soft_blocks`, `pivot_templates`.
- **PrePrompt** genera el bloque markdown desde el JSON + variantes por canal (`discovery` | `voice`).
- Persona, tono Jamie y reglas de producto **permanecen** en cada `prompts.py`.

---

## 3. Inventario de archivos

### Nuevos (3)

| Archivo | Rol |
|---------|-----|
| `config/guardrails/jamie-policy.json` | Policy canónica (mover desde `backend-search`) |
| `config/guardrails/schema/jamie-policy.schema.json` | Validación JSON (opcional pero recomendado) |
| `packages/jamie-guardrails/jamie_guardrails/render_preprompt.py` | Render del bloque PrePrompt + tests unitarios |

> **Alternativa mínima:** si no queremos paquete nuevo, un solo módulo compartido en `config/guardrails/render_preprompt.py` importado vía path relativo desde ambos backends. Preferir `packages/jamie-guardrails` si ya usamos `packages/ccai` como patrón.

### Modificar (7)

| Archivo | Cambio |
|---------|--------|
| `apps/backend-search/recipe_search_agent/prompts.py` | Quitar string hardcodeado; importar `render_preprompt_block("discovery")` |
| `apps/backend-voice/src/config/prompts.py` | Idem con `render_preprompt_block("voice")` |
| `apps/backend-search/recipe_search_agent/guardrails/policy_loader.py` | Apuntar a policy canónica en monorepo root |
| `apps/backend-voice/src/guardrails/policy_loader.py` | Idem |
| `apps/backend-search/tests/test_preprompt_v1_2.py` | Assert sobre bloque generado, no string inline |
| `apps/backend-voice/tests/test_preprompt_v1_2.py` | Idem |
| `apps/backend-search/tests/test_guardrails_policy_loader.py` | Path canónico + test de render |

Opcional: `scripts/test-guardrails.sh`, `.github/workflows/guardrails-unit.yml` (añadir test del paquete).

### Eliminar (2)

| Archivo | Motivo |
|---------|--------|
| `apps/backend-search/config/guardrails/jamie-policy.json` | Reemplazado por copia canónica |
| `apps/backend-voice/config/guardrails/jamie-policy.json` | Duplicado idéntico |

---

## 4. Extensión del schema (`jamie-policy.json`)

Mantener campos actuales para NeuGate. Añadir sección para PrePrompt:

```json
{
  "version": "policy-v1.0",
  "critical_blocks": [ "..." ],
  "soft_blocks": [ "..." ],
  "pivot_templates": [ "..." ],
  "preprompt": {
    "prohibited_topics": [
      "Weapons, violence, crime, or illegal activity",
      "Hacking, surveillance, fake identities, or other people's private data (PII)"
    ],
    "self_harm_guidance": "be kind; encourage professional or emergency help...",
    "language": "British English only unless product says otherwise",
    "channels": {
      "discovery": {
        "scope": "food, recipes, meal planning, and cooking discovery",
        "tool_rules": [
          "Do not call search_recipes, suggest_recipes_for_mood, plan_meal..."
        ],
        "refusal_note": "when the safety gate did not already reply for you"
      },
      "voice": {
        "scope": "cook this recipe and food/cooking questions for the session",
        "extra_rules": [
          "Do not switch recipes — direct them to the recipe gallery"
        ]
      }
    }
  }
}
```

**Regla:** `pivot_templates` del JSON alimentan tanto NeuGate como los “example pivots” del PrePrompt (misma lista, no reescribir a mano).

---

## 5. Pasos de implementación

### Paso 1 — Policy canónica
1. Crear `jamie-oliver-ai/config/guardrails/jamie-policy.json` migrando contenido actual + nueva sección `preprompt`.
2. Codificar en JSON el contenido equivalente de `GUARDRAILS_POLICY_BLOCK` (discovery y voice).
3. Borrar las dos copias bajo `apps/*/config/guardrails/`.

### Paso 2 — Renderer
1. Implementar `render_preprompt_block(channel: Literal["discovery", "voice"]) -> str`.
2. Salida debe ser **byte-stable** con el bloque actual (snapshot test) para no cambiar comportamiento del LLM en el PR.
3. Exportar `POLICY_VERSION` desde el JSON (`version` field).

### Paso 3 — Wire-up backends
1. Actualizar ambos `policy_loader.py` con path resuelto: `{monorepo_root}/config/guardrails/jamie-policy.json`.
2. En `prompts.py` de cada backend:
   ```python
   GUARDRAILS_POLICY_BLOCK = render_preprompt_block("discovery")  # o "voice"
   ```
3. Mantener `PREPROMPT_VERSION = "preprompt-v1.2"` hasta validar snapshot; bump a `v1.3` solo si el texto generado difiere intencionalmente.

### Paso 4 — Tests
1. Snapshot: texto generado == bloque actual (discovery + voice).
2. `load_jamie_policy()` devuelve shape válido para NeuGate (sin enviar `preprompt` en el body — strip en client o subdict `neugate_policy()`).
3. Regresión: `make test-guardrails` verde.
4. Opcional live: `test_guardrails_certification.py` sin cambios de contrato NeuGate.

### Paso 5 — Docs
1. Una línea en `JAMIE_OLIVER_AI_GUARDRAILS_PLAN.md` apuntando a este plan.
2. Nota en PR: “cambios de policy → editar solo `config/guardrails/jamie-policy.json`”.

---

## 6. Contrato NeuGate (no romper)

El client `evaluate_via_neugate` debe seguir enviando:

```json
{
  "critical_blocks": [...],
  "soft_blocks": [...],
  "pivot_templates": [...]
}
```

Implementar en `policy_loader.py`:

```python
def neugate_policy(full: dict) -> dict:
    return {k: full[k] for k in ("critical_blocks", "soft_blocks", "pivot_templates")}
```

La clave `preprompt` **no** viaja a NeuGate.

---

## 7. Criterios de aceptación

- [ ] Un solo `jamie-policy.json` en el monorepo.
- [ ] Cero strings duplicados de prohibidos en `prompts.py`.
- [ ] Snapshot tests pasan (sin cambio de UX LLM no intencional).
- [ ] NeuGate evaluate + certificación red-team sin regresión.
- [ ] Discovery y voice cargan la misma policy desde la misma ruta.

---

## 8. Fase 2 (opcional, no bloqueante)

| Item | Archivos | Notas |
|------|----------|-------|
| Unificar `inline_fallback` substrings | `inline_fallback.py` ×2 | Mover `_BLOCKED_SUBSTRINGS` a JSON `fallback_substrings[]` |
| CI drift check | script en `scripts/` | Falla si `render_preprompt_block` ≠ snapshot committed |

---

## 9. Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Cambio accidental del texto del PrePrompt | Snapshot tests antes de merge |
| Path resolution en Docker/prod | Env `JAMIE_POLICY_PATH` opcional; default relativo a monorepo root |
| Paquete compartido no instalado en voice | `pip install -e packages/jamie-guardrails` en CI y Poetry path |

---

## 10. Entrega

**Un solo PR** (`feat/unify-guardrails-policy`): policy canónica, renderer, wire-up, tests, eliminación de duplicados.

Follow-up opcional (PR separado): unificar `inline_fallback` substrings en el JSON.
