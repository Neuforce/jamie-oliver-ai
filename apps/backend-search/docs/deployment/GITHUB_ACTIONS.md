# 🤖 GitHub Actions Automation

## What It Does

Automatically processes recipe PDFs on a schedule (every 6 hours) using GitHub Actions runners. Installs Ollama, pulls Llama model, runs the ingestion pipeline, and uploads results to Supabase.

**Input:** PDFs in `data/recipes/` directory  
**Output:** Processed JSONs + embeddings in Supabase  
**Schedule:** Every 6 hours (configurable)

---

## Libraries Used

- **GitHub Actions** - CI/CD automation
- **Ollama** - Local LLM runtime (installed on runner)
- **Python 3.11** - Runtime environment
- All ingestion pipeline dependencies (see INGESTION.md)

---

## Workflow Diagram

```text
┌─────────────────────────────────────────────────────┐
│  TRIGGER: Cron (every 6 hours) or Manual            │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  1. SETUP ENVIRONMENT                               │
│     • Checkout code                                 │
│     • Setup Python 3.11                             │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  2. INSTALL OLLAMA                                  │
│     • Download and install Ollama                   │
│     • Start Ollama server                           │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  3. PULL MODEL                                      │
│     • ollama pull llama3.1 (~4.9 GB)                │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  4. INSTALL DEPENDENCIES                            │
│     • pip install -r requirements.txt               │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  5. RUN INGESTION PIPELINE                          │
│     • Load secrets (SUPABASE_URL, SERVICE_ROLE_KEY) │
│     • Process all PDFs in data/recipes/             │
│     • Generate JSONs, chunks, embeddings            │
│     • Upload to Supabase                            │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  6. UPLOAD ARTIFACTS                                │
│     • Save processed JSONs as artifacts             │
│     • Generate processing summary                   │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  OUTPUT: Summary (PDFs processed, errors, etc.)     │
└─────────────────────────────────────────────────────┘
```

---

## Setup

### 1. Configure Secrets

In GitHub: **Settings → Secrets → Actions**

Add:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### 2. Upload PDFs

```bash
cp /path/to/recipe.pdf data/recipes/
git add data/recipes/
git commit -m "Add recipe PDFs"
git push
```

### 3. Run

**Manual:**
- Actions tab → Recipe Ingestion → Run workflow

**Automatic:**
- Runs every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC

---

## Workflow File

`.github/workflows/recipe-cron.yml`

```yaml
on:
  schedule:
    - cron: "0 */6 * * *"  # Every 6 hours
  workflow_dispatch:        # Manual trigger
```

---

## Performance

- **First run:** ~10-15 min (downloads Ollama + model)
- **Subsequent runs:** ~3-5 min per PDF

---

## Documentation

- `GITHUB_ACTIONS.md` - This document
- `INGESTION.md` - Pipeline details
