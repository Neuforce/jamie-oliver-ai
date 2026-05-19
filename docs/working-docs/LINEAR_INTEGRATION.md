# Linear integration

The project queries Linear (issues, state) via **GraphQL API** using `curl`. There is no “magic integration”: you only need **LINEAR_API_KEY** in the environment.

## 1. Create a Linear API key

1. Go to [Linear](https://linear.app/neuforce).
2. **Settings** → **API** → **Personal API keys**.
3. **Create key**, copy the value (starts with `lin_api_...`).

## 2. How to expose the key to the agent and scripts

So **Cursor’s agent** and scripts can query Linear, `LINEAR_API_KEY` must be defined when commands run.

### Option A: Workspace environment variables (recommended for the agent)

If Cursor injects workspace `env` when running commands:

1. Create or edit `.cursor/environment.json` at the repo root.
2. Add your key (and keep the file out of git if you do not want to commit the key):

```json
{
  "env": {
    "LINEAR_API_KEY": "lin_api_xxxxxxxx"
  }
}
```

3. Add to `.gitignore` if needed:  
   `.cursor/environment.json`

### Option B: `.env` file at the repo root

1. At the repo root (next to `package.json` / `apps/`), create or edit `.env.local`.
2. Add:

```bash
LINEAR_API_KEY=lin_api_xxxxxxxx
```

3. For the agent to use it, Cursor must run commands in a shell that loads this file (depends on your setup). For **your** terminal you can always do:

```bash
source .env.local
./scripts/linear.sh list
```

### Option C: Export in the session

In the terminal where you run the script or curls:

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxx"
./scripts/linear.sh list
```

## 3. Verify it works

```bash
./scripts/linear.sh list
```

If you see a list of issues (or JSON with `data.issues`), the integration is configured. If you see "Authentication required" or 401, the key is missing or invalid.

## 4. Linear project

- **Supertab - JamieOliverAI:**  
  https://linear.app/neuforce/project/supertab-jamieoliverai-41f9c9877729
