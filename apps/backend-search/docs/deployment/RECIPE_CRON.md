# Recipe cron (GitHub Actions)

## Flow
- PDF source: `data/recipes` in the repo.
- Processing: `python -m recipe_pdf_agent_llama.cli run data/recipes`.
- Output: upsert to Supabase (tables configured in code).

## Required GitHub secrets
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (Optional) `OLLAMA_URL` if you use a remote LLM instead of local Ollama.

## Limitation
GitHub Actions runners do not ship with local Ollama. For this cron to work end-to-end:
- Use a remote LLM (adjust client / env for your provider), **or**
- Run the job on infra where Ollama is available.

## Triggers
- Automatic: every 30 minutes (see `.github/workflows/recipe-cron.yml`).
- Manual: Actions → recipe-cron → Run workflow.
