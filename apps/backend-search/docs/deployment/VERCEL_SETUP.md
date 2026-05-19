# Visual guide: set Root Directory on Vercel

## Step by step in the Vercel dashboard

### 1. Create a new project

1. Open https://vercel.com/new
2. Choose **Import Git Repository**
3. Pick your GitHub repo

### 2. Configure Root Directory

**Important:** After picking the repo, you land on project settings. This is where you set **Root Directory**:

#### Option A: You see a “Root Directory” field
1. Find **Root Directory** or **Configure Project**
2. Click **Edit** or **Configure**
3. Enter or select: `jo-sem-search`
4. Click **Continue** or **Deploy**

#### Option B: The field is not obvious at first
1. After import you should see Project Name, Framework Preset, **Root Directory**
2. Click **Root Directory** or **Edit** next to it
3. Choose `jo-sem-search` from the list or type it
4. Click **Continue**

### 3. Environment variables

Before the first deploy:

1. Open **Environment Variables** / **Add Environment Variable**
2. Add:
   ```
   SUPABASE_URL = https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
   PYTHON_VERSION = 3.11
   ```
3. Apply to Production, Preview, and Development as needed

### 4. Deploy

1. Click **Deploy**
2. Wait for the build
3. Check `https://your-project.vercel.app/health`

## Project already exists with wrong root

1. Open the project → **Settings** → **General**
2. Find **Root Directory**
3. **Edit** → set to `jo-sem-search`
4. Save — this triggers a new deployment

## Verify it worked

1. **Health:** `https://your-project.vercel.app/health` → `{"status": "healthy", ...}`
2. **Docs:** `https://your-project.vercel.app/docs` → Swagger
3. **Logs:** Project → **Deployments** → latest → **Logs** — Python + deps detected

## Troubleshooting

### No “Root Directory” field
- Use the pre-deploy configure screen, or **Settings** → **General** → Root Directory

### “No vercel.json found”
- Ensure `vercel.json` lives at `jo-sem-search/vercel.json`
- Confirm Root Directory points at `jo-sem-search`

### “No api/index.py found”
- Ensure `api/index.py` is at `jo-sem-search/api/index.py`
- Confirm Root Directory

### Build fails
- Read deployment logs
- Check `requirements.txt`
- Confirm env vars are set
