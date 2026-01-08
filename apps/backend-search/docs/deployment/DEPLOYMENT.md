# Deployment Guide for jo-sem-search

This guide explains how to deploy the FastAPI backend (`jo-sem-search`) on Vercel as serverless functions.

## Prerequisites

- Vercel account
- Supabase project with vector database configured
- Python 3.11+ (Vercel supports this automatically)

## Quick Start

1. **Install Vercel CLI** (optional):
   ```bash
   npm i -g vercel
   ```

2. **Deploy from Vercel Dashboard**:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - **Configure Project**:
     - **Root Directory**: Click "Edit" or "Configure" button
     - In the "Root Directory" field, select or type: `jo-sem-search`
     - Click "Continue"
   - Vercel will detect `vercel.json` and `api/index.py`

3. **Set Environment Variables** (antes de hacer Deploy):
   - Haz clic en **"Environment Variables"** o **"Add Environment Variable"**
   - Agrega:
     ```
     SUPABASE_URL = https://your-project.supabase.co
     SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
     PYTHON_VERSION = 3.11
     ```
   - Selecciona los ambientes: Production, Preview, Development

4. **Deploy**:
   - Haz clic en **"Deploy"**
   - O push a `main` branch (auto-deploy si está configurado)
   - O usa `vercel` command para deploy manual

## Project Structure

```
jo-sem-search/
├── api/
│   └── index.py          # Vercel serverless function entry point
├── recipe_search_agent/
│   ├── api.py            # FastAPI app
│   └── search.py         # Search logic
├── vercel.json           # Vercel configuration
├── requirements.txt      # Python dependencies
└── pyproject.toml        # Python project config
```

## How It Works

1. **Vercel detects** `vercel.json` and `api/index.py`
2. **Builds** Python serverless function using `@vercel/python`
3. **Routes** `/api/v1/*` requests to the FastAPI app
4. **Uses Mangum** to convert ASGI (FastAPI) to AWS Lambda handler format

## API Endpoints

After deployment, your API will be available at:
- `https://your-project.vercel.app/api/v1/recipes/search` (POST)
- `https://your-project.vercel.app/api/v1/recipes/{recipe_id}` (GET)
- `https://your-project.vercel.app/docs` (Swagger UI)
- `https://your-project.vercel.app/health` (Health check)

## Environment Variables

Required:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (has admin access)

Optional:
- `PYTHON_VERSION`: Python version (default: 3.11)

## Testing Locally

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set environment variables**:
   ```bash
   export SUPABASE_URL=your-url
   export SUPABASE_SERVICE_ROLE_KEY=your-key
   ```

3. **Run with Vercel CLI**:
   ```bash
   vercel dev
   ```

4. **Or run directly**:
   ```bash
   python3 -m uvicorn recipe_search_agent.api:app --reload
   ```

## Troubleshooting

### Function Timeout
- Vercel Hobby plan: 10s timeout
- Vercel Pro plan: 60s timeout
- If searches take longer, consider:
  - Optimizing the search query
  - Reducing `top_k` parameter
  - Using caching

### Import Errors
- Ensure all dependencies are in `requirements.txt`
- Check that `mangum` is included (required for Vercel)

### Supabase Connection
- Verify credentials are correct
- Check Supabase project is active
- Ensure vector extension is enabled

### CORS Issues
- FastAPI CORS is configured to allow all origins (`*`)
- For production, restrict to your frontend domain:
  ```python
  allow_origins=["https://your-frontend.vercel.app"]
  ```

## Updating Dependencies

1. Update `requirements.txt`:
   ```bash
   pip freeze > requirements.txt
   ```

2. Or manually add to `requirements.txt`

3. Push to trigger new deployment

## Monitoring

- Check Vercel dashboard for function logs
- Use `/health` endpoint to verify status
- Monitor Supabase dashboard for query performance

## Cost Considerations

- Vercel Hobby: Free tier with limits
- Vercel Pro: $20/month for better limits
- Supabase: Free tier available, pay for usage

## Next Steps

After deployment:
1. Update `VITE_API_BASE_URL` in `jo-ai-v1` to point to this backend
2. Test the API endpoints
3. Monitor performance and adjust as needed
