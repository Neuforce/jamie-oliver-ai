# Deployment Guide for jo-ai-v1

This guide explains how to deploy `jo-ai-v1` (frontend), `jo-sem-search` (backend), and connect to `agent-v0` on Vercel.

## Architecture Overview

```
┌─────────────────┐
│   jo-ai-v1       │  Frontend (Vite + React)
│   (Vercel)       │  → Static site
└────────┬─────────┘
         │
         ├─→ jo-sem-search (Vercel Serverless Functions)
         │   → Semantic search API
         │
         └─→ agent-v0 (AWS ECS)
             → Voice assistant WebSocket
```

## 1. Deploy Frontend (jo-ai-v1)

### Prerequisites
- Vercel account
- GitHub repository connected to Vercel

### Steps

1. **Install Vercel CLI** (optional, for local testing):
   ```bash
   npm i -g vercel
   ```

2. **Deploy from Vercel Dashboard**:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - **Configure Project**:
     - **Root Directory**: Click "Edit" next to the project name
     - Select `jo-ai-v1` from the dropdown or type `jo-ai-v1`
     - Click "Continue"
   - Vercel will auto-detect Vite configuration

3. **Configure Build Settings** (if needed):
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Set Environment Variables** (antes de hacer Deploy):
   - Haz clic en **"Environment Variables"** o **"Add Environment Variable"**
   - Agrega:
     ```
     VITE_WS_URL = wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice
     VITE_API_BASE_URL = https://your-jo-sem-search-url.vercel.app
     ```
   - Selecciona los ambientes: Production, Preview, Development

5. **Deploy**:
   - Haz clic en **"Deploy"**
   - O push a `main` branch (auto-deploy si está configurado)
   - O usa `vercel` command para deploy manual

## 2. Deploy Backend (jo-sem-search)

### Prerequisites
- Python 3.11+ runtime on Vercel
- Supabase credentials

### Steps

1. **Create `requirements.txt`** for Vercel (if not exists):
   ```bash
   cd jo-sem-search
   pip freeze > requirements.txt
   ```
   Or create manually with key dependencies:
   ```
   fastapi>=0.115.0
   uvicorn[standard]>=0.32.0
   supabase>=2.6.0
   fastembed>=0.7.0
   mangum>=0.17.0
   python-dotenv>=1.0.1
   ```

2. **Deploy from Vercel Dashboard**:
   - Create a new Vercel project
   - Select the `jo-sem-search` directory as root
   - Vercel will detect `vercel.json` and `api/index.py`

3. **Set Environment Variables** in Vercel Dashboard:
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   PYTHON_VERSION=3.11
   ```

4. **Deploy**:
   - Push to `main` branch
   - Vercel will build and deploy the serverless functions

5. **Update Frontend API URL**:
   - After deployment, update `VITE_API_BASE_URL` in `jo-ai-v1` Vercel project
   - Use the URL from `jo-sem-search` deployment (e.g., `https://jo-sem-search.vercel.app`)

## 3. Connect to agent-v0

The `agent-v0` backend is already deployed on AWS ECS. You just need to configure the WebSocket URL:

1. **Set `VITE_WS_URL`** in `jo-ai-v1` Vercel project:
   ```
   VITE_WS_URL=wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice
   ```

2. **Verify Connection**:
   - The frontend will automatically connect to this WebSocket when entering cooking mode
   - Check browser console for connection status

## 4. Environment Variables Summary

### jo-ai-v1 (Frontend)
```
VITE_WS_URL=wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice
VITE_API_BASE_URL=https://jo-sem-search.vercel.app
```

### jo-sem-search (Backend)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PYTHON_VERSION=3.11
```

## 5. Testing Deployment

1. **Test Frontend**:
   - Visit your Vercel deployment URL
   - Verify recipes load correctly
   - Test semantic search in chat

2. **Test Backend**:
   - Visit `https://your-jo-sem-search-url.vercel.app/docs`
   - Test `/api/v1/recipes/search` endpoint

3. **Test WebSocket**:
   - Start a recipe in cooking mode
   - Verify WebSocket connection to agent-v0
   - Test voice interaction

## 6. Troubleshooting

### Frontend Issues
- **Build fails**: Check `package.json` scripts and dependencies
- **Assets not loading**: Verify `vite.config.ts` output directory
- **API calls fail**: Check `VITE_API_BASE_URL` is set correctly

### Backend Issues
- **Function timeout**: Increase timeout in Vercel dashboard (max 60s for Hobby, 300s for Pro)
- **Import errors**: Ensure all dependencies are in `requirements.txt`
- **Supabase connection**: Verify credentials are set correctly

### WebSocket Issues
- **Connection fails**: Verify `VITE_WS_URL` is correct and backend is accessible
- **CORS errors**: Check backend CORS configuration allows your frontend domain

## 7. Custom Domain (Optional)

1. Add custom domain in Vercel dashboard
2. Update CORS in `jo-sem-search` to allow your domain
3. Update `VITE_API_BASE_URL` if needed

## Notes

- Vercel serverless functions have a 10s timeout on Hobby plan, 60s on Pro
- For long-running operations, consider using background jobs
- WebSocket connections from Vercel frontend work fine (client-side)
- FastAPI on Vercel uses serverless functions, not a persistent server
