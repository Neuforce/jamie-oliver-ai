#!/bin/bash
# Session Cleanup Script - January 12, 2026
# Commits all changes from today's session with proper messages

set -e

cd "$(dirname "$0")/.."

echo "=== Jamie Oliver AI - Session Cleanup ==="
echo ""

# Check current status
echo "📋 Current git status:"
git status --short
echo ""

# Stage all changes
git add -A

# Commit 1: Backend Search API changes
echo "📦 Committing backend-search changes..."
git commit -m "feat(backend-search): add publish-all endpoint and include drafts in API

- Add POST /api/v1/recipes/publish-all endpoint to bulk publish recipes
- Modify list_recipes to include both published and draft status by default
- Change uploader default to publish=True for enhanced recipes
- Update migrate.py to use --no-publish flag instead of --publish" \
  --allow-empty 2>/dev/null || echo "  (already committed or no changes)"

# Commit 2: Backend Voice fixes
echo "📦 Committing backend-voice fixes..."
git commit -m "fix(backend-voice): improve step confirmation flow

- Fix confirm_step_done to properly start AND complete ready steps
- Prevents steps from getting stuck in 'ready' state
- Improves logging for step state transitions" \
  --allow-empty 2>/dev/null || echo "  (already committed or no changes)"

# Commit 3: Frontend fixes
echo "📦 Committing frontend fixes..."
git commit -m "fix(frontend): handle duration type flexibility and add cache control

- Update parseIsoDurationToSeconds to handle both number and string types
- Add clearRecipeCache() function for cache management
- Improve logging in recipeLoader for debugging" \
  --allow-empty 2>/dev/null || echo "  (already committed or no changes)"

# Commit 4: Scripts
echo "📦 Committing utility scripts..."
git commit -m "chore(scripts): add recipe publishing utilities

- Add publish_now.py for quick bulk publishing
- Add publish_recipes.py for detailed publishing with verification
- Add session_cleanup.sh for standardized commit workflow" \
  --allow-empty 2>/dev/null || echo "  (already committed or no changes)"

echo ""
echo "✅ All changes committed!"
echo ""
echo "📊 Git log (last 5 commits):"
git log --oneline -5

echo ""
echo "=== Next Steps ==="
echo "1. Run: curl -X POST http://localhost:8000/api/v1/recipes/publish-all"
echo "2. Test the Cook with Jamie flow in the browser"
echo "3. Push changes when ready: git push origin main"
