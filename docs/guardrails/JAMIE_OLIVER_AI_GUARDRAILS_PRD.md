# PRD — Jamie Oliver AI: guardrails, moderación y evaluación

| Campo | Valor |
|--------|--------|
| **Producto** | Jamie Oliver AI (descubrimiento de recetas, voz en cocina, búsqueda semántica) |
| **Tipo** | Requisitos de producto / cumplimiento de uso responsable |
| **Estado** | Borrador para acuerdo con cliente |
| **Linear** | [NEU-622](https://linear.app/neuforce/issue/NEU-622) |
| **Relacionado** | Red teaming, content moderation, AI guardrails (según brief del cliente) |

## 1. Resumen

Definir e implementar **políticas explícitas** y **capas técnicas** para que el asistente permanezca en el ámbito culinario, rechace solicitudes dañinas o fuera de política y **no active recuperación RAG** cuando corresponda. El trabajo incluye versionar **PrePrompt v1.2** y alinear gobierno del índice con **RAG Index 3**, más una **arquitectura de evaluación** reproducible (red teaming con el set de prompts acordado).

## 2. Contexto y problema

Hoy el comportamiento seguro es en gran parte **implícito**: prompts de sistema orientados a cocina (`discovery`, `voice`) y un corpus de recetas que limita el contexto. Eso no sustituye:

- Política escrita de rechazo / derivación (incl. crisis cuando aplique).
- Clasificación o moderación de **entrada** y, si aplica, de **salida** (especialmente voz / TTS).
- Reglas de **orquestación** (p. ej. no llamar a búsqueda semántica ante ciertas intenciones).
- **Eval** versionado que demuestre cumplimiento ante la matriz de categorías y variantes adversariales.

## 3. Objetivos

1. **Producto**: Respuestas coherentes con la marca; rechazo claro y breve ante temas prohibidos; redirección a cocina cuando sea posible sin moralizar en exceso.
2. **Ingeniería**: Documentar responsabilidades **PrePrompt v1.2** vs **RAG Index 3** según la matriz del cliente; implementar defensa en profundidad (ver plan técnico).
3. **Gobernanza**: Dataset de evaluación + criterios de paso/fallo + trazabilidad por versión de prompt e índice.

## 4. Alcance

### 4.1 Incluido

- Definición de categorías de riesgo y comportamiento esperado (alineado a la tabla del cliente: sensible/daño, privacidad, desinformación, ilegal, autolesión/ TCA, odio, manipulación, sexual, adversarial, límites culturales, sesgo, etc.).
- **PrePrompt v1.2**: bloque de sistema que fije alcance, plantillas de rechazo y reglas de uso de herramientas.
- **RAG / Index 3**: políticas sobre cuándo ejecutar búsqueda/recuperación; gobierno de ingesta y calidad del índice; gates previos a `search` donde proceda.
- Capa opcional de **moderación de entrada/salida** (API o modelo classifier) si el presupuesto de latencia y costo lo permiten.
- **Eval**: conjunto de prompts base + paráfrasis/jailbreak livianos; métricas y umbrales; integración en release o CI según capacidad del equipo.

### 4.2 Fuera de alcance (salvo decisión explícita)

- Moderación legal completa sustitutiva de políticas del proveedor LLM.
- Índice de contenido no culinario masivo.
- Garantías formales de ausencia total de fallos; el objetivo es **reducir riesgo** y **medir mejoras** de forma reproducible.

## 5. Usuarios y partes interesadas

- Usuario final de la app (descubrimiento y cocina asistida).
- Cliente / marca (requisitos de confianza y seguridad).
- Equipo de producto e ingeniería (implementación y operación).
- Equipo que ejecuta red teaming y revisión de evals.

## 6. Requisitos funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| FR-1 | Ante solicitudes fuera de política, el asistente **no** debe proporcionar instrucciones dañinas ni datos sensibles (DNI, direcciones, hackeo, etc.). | Must |
| FR-2 | PrePrompt v1.2 debe incluir **alcance culinario**, límites explícitos y manejo de **off-topic** con mensaje corto y consistente. | Must |
| FR-3 | Orquestación: ante etiquetas de alto riesgo (p. ej. autolesión, violencia, abuso sexual infantil si detectado), **acortar flujo**: respuesta mínima y/o plantilla; **omitir RAG** salvo política explícita en contra. | Must |
| FR-4 | RAG Index 3: documentar y aplicar reglas de **ingesta** (solo fuentes culinarias aprobadas) y **query gate** antes de recuperación cuando el clasificador o heurística lo indiquen. | Should |
| FR-5 | Modo voz: considerar **moderación de salida** antes de TTS si el canal es de alto riesgo. | Should |
| FR-6 | Registro auditável (sin datos personales innecesarios): categoría detectada, versión de prompt, versión de índice, resultado de eval (entornos staging). | Could |

## 7. Requisitos no funcionales

- **Latencia**: el gate de entrada no debe degradar la experiencia de búsqueda innocua; objetivo específico a fijar con el plan (p. ej. p95 +X ms).
- **Mantenibilidad**: prompts e índice versionados; cambios en PrePrompt v1.2 o Index 3 disparan corrida del suite de eval.
- **Privacidad**: logs de moderación acotados a lo necesario y retención según política.

## 8. Métricas de éxito

- Cobertura del suite de red teaming: % de casos con comportamiento esperado por categoría.
- **Falsos positivos**: preguntas de cocina legítimas no bloqueadas (muestra fija + exploratoria).
- Tiempo medio de revisión humana por release (si aplica).
- Reducción de incidentes reportados tras despliegue de v1.2 + Index 3 (definir baseline).

## 9. Matriz de responsabilidad (resumen)

- **PrePrompt v1.2**: política de modelo, rechazos, tono, límites de herramientas, manejo de crisis cuando proceda.
- **RAG Index 3**: calidad y alcance del corpus; reglas de recuperación; evitar enriquecer contexto cuando la intención está fuera de dominio o es de alto riesgo.

La tabla detallada del cliente (checkmarks por categoría) es la fuente de verdad para **quién “posee”** cada fila en revisión de arquitectura.

## 10. Riesgos

- Clasificadores con falsos positivos que frustren uso culinario normal.
- Jailbreaks no cubiertos por el set inicial de eval.
- Desalineación entre modo texto (discovery) y modo voz.

## 11. Dependencias

- Ticket Linear [NEU-622](https://linear.app/neuforce/issue/NEU-622).
- Acceso a modelo/API de moderación si se adopta (o decisión de heurística + LLM pequeño).
- Ambiente de staging con flags para activar gates sin afectar producción.

## 12. Documentación relacionada

- Plan de implementación: `JAMIE_OLIVER_AI_GUARDRAILS_PLAN.md` (mismo directorio / copia en raíz `neuForce`).
- Código de referencia actual: prompts en `apps/backend-search/recipe_search_agent/prompts.py`, `apps/backend-voice/src/config/prompts.py`; agente de chat y búsqueda en `apps/backend-search/`.

---

*Documento elaborado para NeuForce / Jamie Oliver AI. Ajustar prioridades y umbrales con el cliente antes de desarrollo.*
