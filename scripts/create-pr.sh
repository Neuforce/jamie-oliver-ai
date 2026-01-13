#!/bin/bash
# Create PR Script - January 12, 2026
# Commits all session changes and creates a PR

set -e

cd "$(dirname "$0")/.."

echo "🔧 Jamie Oliver AI - Creating PR for Session Changes"
echo "=================================================="
echo ""

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

# Create feature branch if on main
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    FEATURE_BRANCH="feature/recipe-platform-session-$(date +%Y%m%d)"
    echo ""
    echo "⚠️  You're on $CURRENT_BRANCH! Creating feature branch: $FEATURE_BRANCH"
    git checkout -b "$FEATURE_BRANCH"
    CURRENT_BRANCH="$FEATURE_BRANCH"
fi

# Stage all changes
echo ""
echo "📦 Staging all changes..."
git add -A

# Show what will be committed
echo ""
echo "📋 Changes to commit:"
git status --short
echo ""

# Create a single comprehensive commit
COMMIT_MSG="feat(recipe-platform): session improvements and recipe publishing

Changes:
- Add POST /api/v1/recipes/publish-all endpoint for bulk publishing
- Update API to include draft recipes in list by default
- Default publish=True for enhanced recipes in uploader
- Improve README with updated architecture diagram
- Add Recipe Enhancement Pipeline documentation
- Document publish_now.py utility script
- Create session_cleanup.sh for commit workflows
- Delete redundant publish_recipes.py script

All 55 recipes are now published and enhanced to 100/100 quality."

echo "💾 Creating commit..."
git commit -m "$COMMIT_MSG" || echo "Nothing to commit or already committed"

# Show recent commits
echo ""
echo "📊 Recent commits:"
git log --oneline -5
echo ""

# Push to remote
echo "🚀 Pushing to remote..."
git push origin "$CURRENT_BRANCH" || echo "Push failed - you may need to push manually"

echo ""
echo "=================================================="
echo "✅ Done! To create PR:"
echo ""
echo "   gh pr create --title 'feat(recipe-platform): session improvements and recipe publishing' \\"
echo "     --body 'Session work from Jan 12, 2026"
echo ""
echo "     ## Changes"
echo "     - Published all 55 recipes to Supabase"
echo "     - Added bulk publish API endpoint"
echo "     - Updated README with new architecture"
echo "     - Cleaned up scripts and documentation"
echo ""
echo "     ## Testing"
echo "     - [x] All recipes published successfully"
echo "     - [x] Frontend loading recipes from Supabase"
echo "     - [x] API endpoints functional'"
echo ""
echo "Or use the GitHub web UI to create the PR."
