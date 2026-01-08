# Recipe Cron (GitHub Actions)

## Flujo
- Fuente de PDFs: `data/recipes` en el repo.
- Procesado: `python -m recipe_pdf_agent_llama.cli run data/recipes`.
- Salida: upsert a Supabase (tablas configuradas en el código).

## Secrets requeridos (GitHub)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (Opcional) `OLLAMA_URL` si usas un endpoint LLM remoto en vez de Ollama local.

## Limitación
GitHub Actions no dispone de Ollama local. Para que el cron funcione:
- Usa un LLM remoto (adaptar cliente/vars a tu proveedor), **o**
- Ejecuta el cron en otra infraestructura que tenga Ollama disponible.

## Desencadenar
- Automático: cada 30 minutos (config en `.github/workflows/recipe-cron.yml`).
- Manual: desde Actions > recipe-cron > Run workflow.



