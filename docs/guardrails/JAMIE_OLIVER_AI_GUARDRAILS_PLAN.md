# Plan — Jamie Oliver AI: guardrails, moderación y evaluación

| Campo | Valor |
|--------|--------|
| **Referencia** | `JAMIE_OLIVER_AI_GUARDRAILS_PRD.md` |
| **Ticket Linear** | [NEU-622](https://linear.app/neuforce/issue/NEU-622) |
| **Salida** | PrePrompt v1.2, acuerdo RAG Index 3, suite de eval, gates técnicos |

## 1. Principios

1. **Defensa en profundidad**: ninguna capa sustituye a las demás; PrePrompt + orquestación + (opcional) moderación + RAG gate.
2. **Medible**: cada milestone desbloquea corridas del suite de red teaming.
3. **Mínimo viable primero**: política en sistema + gate simple de intención antes de integrar servicios costosos.

## 2. Fases

### Fase 0 — Alineación (Semana 0)

**Entregables**

- Lista cerrada de categorías y ejemplos (la tabla del cliente + variantes acordadas).
- Definición de “comportamiento esperado” por categoría (rechazo, derivación, recurso de crisis si aplica).
- Owners: producto + ingeniería + (si existe) advisor legal/compliance.

**Criterio de salida**

- Matriz PrePrompt vs RAG revisada y firmada para implementación.

### Fase 1 — PrePrompt v1.2 (Semanas 1–2)

**Trabajo**

- Redactar bloque de política en inglés (o idioma del modelo principal) coherente con tono “Jamie”.
- Añadir reglas explícitas: no armas, no ilegal, no odio, no PII, no desinformación médica/conspirativa, no contenido sexual, no autolesión/TCA como instrucción, etc.
- Regla de herramientas: **no inventar recetas** (existente) + **no usar búsqueda** si el mensaje fue clasificado como fuera de política (cuando exista clasificador).

**Ubicación código (objetivo)**

- Discovery: `apps/backend-search/recipe_search_agent/prompts.py` + ensamblado en `chat_agent.py`.
- Voz: `apps/backend-voice/src/config/prompts.py`.

**Criterio de salida**

- Versión etiquetada `preprompt-v1.2` en repo (tag o constante + CHANGELOG).

### Fase 2 — Orquestación y RAG Index 3 (Semanas 2–3)

**Trabajo**

- **Query gate** antes de `semantic_recipe_search` / tools: si mensaje = alto riesgo u off-topic duro, responder sin recuperación (o con flujo acotado).
- Documentar **RAG Index 3**: qué tablas/chunks, políticas de ingesta, exclusiones, versionado del índice en despliegue.
- Revisar si hace falta filtrado adicional en SQL (normalmente bajo para corpus solo-recetas; valor principal = no llamar RAG innecesariamente).

**Criterio de salida**

- Flujo documentado en diagrama (entrada → gate → LLM / tools → salida).
- Checklist de despliegue: “versión de índice X compatible con gate Y”.

### Fase 3 — Moderación opcional (Semanas 3–4, en paralelo si hay presupuesto)

**Trabajo**

- Evaluar proveedor (OpenAI moderation u otro) vs clasificador pequeño.
- Integrar en **entrada**; valorar **salida** para pipeline de voz.

**Criterio de salida**

- SLO de latencia acordado; fallbacks si el servicio fall (default: comportamiento conservador).

### Fase 4 — Eval y red teaming (continuo desde Fase 1)

**Trabajo**

- Crear dataset versionado (YAML/JSON): prompt, categoría esperada, comportamiento esperado (refuse / redirect / crisis template).
- Scripts o tests que envíen prompts a staging y validen criterios (puede ser aserción por keywords + revisión humana periódica).
- Expandir con paráfrasis y ataques de “boundary pushing” de la tabla del cliente.

**Criterio de salida**

- Umbral mínimo por categoría acordado; bloqueo de release si regresión crítica.

## 3. Roles

| Rol | Responsabilidad |
|-----|------------------|
| Tech lead | Arquitectura de gates, revisiones de PR |
| Backend | `chat_agent`, API búsqueda, integración de moderación |
| ML/Eval (si aplica) | Dataset, métricas, corridas |
| Producto | Priorización, copy de mensajes de rechazo |

## 4. Dependencias técnicas

- Feature flags o entorno staging con mismo modelo que prod cuando sea posible.
- Secretos para API de moderación si se usan.

## 5. Riesgos operativos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Falsos positivos en cocina | Muestra “golden” de preguntas culinarias en eval obligatorio |
| Latencia | Gate asíncrono solo si es viable; en caso contrario modelo pequeño o heurísticas |
| Deriva entre discovery y voz | Misma política base; pruebas separadas en suite |

## 6. Checklist de aceptación (MVP)

- [ ] PrePrompt v1.2 desplegado en discovery y voz (texto base alineado).
- [ ] Gate documentado: cuándo **no** se llama RAG.
- [ ] RAG Index 3 documentado (versión, ingesta, rollback).
- [ ] Suite inicial de eval con categorías del cliente ejecutada en staging.
- [ ] Linear actualizado con enlaces a PRD/plan y PRs.

---

*Plan operativo NeuForce. Ajustar fechas con capacidad del equipo.*
