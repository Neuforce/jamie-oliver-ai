## Description

Fixes multiple issues affecting voice chat functionality and development setup:

1. **WebSocket Connection Failure**: Voice chat was trying to connect to `ws://localhost:8000/ws/chat-voice` in production because the code was using a non-existent environment variable (`VITE_SEARCH_API_URL`) instead of the documented `VITE_API_BASE_URL`.

2. **Missing Recipe Data**: When users clicked recipes from the voice chat carousel, the recipes were missing `rawRecipePayload`, causing `RecipeModal` to only show images and `CookWithJamie` to fail. The voice agent would ask users to exit and re-enter because it didn't have recipe details (steps, ingredients, etc.).

3. **pyaudio Installation Failure on macOS**: The `ccai` package requires `pyaudio`, which fails to build on macOS due to missing `portaudio` library. Since `backend-search` and `backend-voice` use `WebSocketAudioInterface` (not `LocalAudioInterface`), they don't actually need `pyaudio`. Made `pyaudio` optional in `ccai` to allow installation without it.

## Linear Issue

<!-- If you have a Linear ticket, replace this with NEU-XXX -->
<!-- If no ticket, you can leave this empty or create one -->

## Type of Change

- [x] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Chore (dependency updates, configs, etc.)

## Changes Made

- **Fixed WebSocket URL configuration** (`useVoiceChat.ts`):
  - Changed from `VITE_SEARCH_API_URL` (non-existent) to `VITE_API_BASE_URL` (documented variable)
  - WebSocket now correctly connects to `wss://backend-search-url/ws/chat-voice` in production

- **Added recipe payload loading** (`ChatView.tsx`, `ChatWithJamie.tsx`):
  - Created `ensureRecipeHasPayload` helper function that loads full recipe JSON when missing
  - Updated carousel `onRecipeClick` handlers to load complete recipe data before opening `RecipeModal`
  - Ensures `rawRecipePayload` is always available for `CookWithJamie` and the voice agent

- **Made pyaudio optional in ccai package** (`packages/ccai/pyproject.toml`, `local_audio_input.py`, `local_audio_output.py`):
  - Marked `pyaudio` as optional dependency with `optional = true` in `pyproject.toml`
  - Added `[tool.poetry.extras]` section with `audio = ["pyaudio"]` for optional installation
  - Updated `LocalAudioInput` and `LocalAudioOutput` to handle missing `pyaudio` gracefully with clear error messages
  - Allows `ccai` to be installed without `pyaudio` for services that use `WebSocketAudioInterface`

- **Improved installation scripts** (`scripts/dev-backend-search.sh`, `apps/backend-voice/startup.sh`):
  - Added automatic `portaudio` installation via Homebrew on macOS (helps with `pyaudio` compilation)
  - Added fallback logic to install `ccai` without `pyaudio` if it fails to build
  - Makes development setup more resilient on macOS

- **Added runtime ccai verification** (`apps/backend-search/recipe_search_agent/api.py`):
  - Added explicit `ImportError` check for `ccai` package with clear error message
  - Provides helpful installation instructions if `ccai` is missing

## Testing

- [x] Unit tests pass locally
- [x] Manual testing completed
  - Verified WebSocket connects correctly in production environment
  - Verified recipes from voice chat carousel load complete JSON and open RecipeModal correctly
  - Verified CookWithJamie receives full recipe payload and voice agent has access to recipe details
  - Verified `ccai` installs successfully on macOS without `pyaudio` (when `portaudio` is missing)
  - Verified `backend-search` works correctly without `pyaudio` installed
- [x] Tested with Docker (`docker-compose up`)
  - Verified `backend-voice` and `backend-search` build and run correctly in Docker
  - Verified `pyaudio` compiles successfully in Docker (with `portaudio19-dev` installed)

## Screenshots (if UI changes)

N/A - Backend fixes, no UI changes

## Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my code
- [x] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation (no documentation changes required)
- [x] My changes generate no new warnings
- [x] Any dependent changes have been merged and published

---

## Additional Context

### Problem 1: WebSocket Connection
**Error in production:**
- Voice chat was connecting to `ws://localhost:8000/ws/chat-voice` instead of the correct backend-search URL
- This happened because `VITE_SEARCH_API_URL` doesn't exist, so it fell back to the default `http://localhost:8000`

**Solution:**
- Changed to use `VITE_API_BASE_URL` which is the documented variable pointing to backend-search
- WebSocket URL is now correctly constructed as `wss://backend-search-url.vercel.app/ws/chat-voice`

**Note:** Ensure `VITE_API_BASE_URL` is set in Vercel environment variables pointing to backend-search deployment.

### Problem 2: Missing Recipe Payload
**Error flow:**
1. Voice chat returns recipes using `transformRecipeFromSummary` (summary only, no full JSON)
2. User clicks recipe from carousel
3. Recipe passed to `RecipeModal` without `rawRecipePayload`
4. RecipeModal shows only image (no full data)
5. User clicks "Cook with Jamie"
6. `CookWithJamie` receives recipe without `rawRecipePayload`
7. Voice agent doesn't have recipe details and asks user to exit

**Solution:**
- Added `ensureRecipeHasPayload` helper that checks if recipe has full payload
- If missing, loads complete recipe JSON from `/recipes-json/` directory
- Transforms recipe using `transformRecipeMatch` to include `rawRecipePayload`
- Ensures complete recipe data is always available before opening modal or starting cooking

**Impact:**
- RecipeModal now displays complete recipe information
- CookWithJamie receives full recipe payload
- Voice agent has access to all recipe details (steps, ingredients, utensils, etc.)
- No more "exit and re-enter" errors

### Problem 3: pyaudio Installation Failure on macOS
**Error:**
- `pyaudio` fails to build on macOS with error: `clang: error: invalid version number in 'MACOSX_DEPLOYMENT_TARGET=26'`
- This happens when `portaudio` library is not installed via Homebrew
- `backend-search` and `backend-voice` don't actually need `pyaudio` (they use `WebSocketAudioInterface`)

**Solution:**
- Made `pyaudio` optional in `ccai` package configuration
- Updated installation scripts to handle `pyaudio` build failures gracefully
- Added automatic `portaudio` installation on macOS via Homebrew
- Services can now install and run `ccai` without `pyaudio`

**Impact:**
- Development setup works on macOS even if `pyaudio` fails to build
- Production deployments unaffected (Docker already has `portaudio19-dev`)
- Clearer error messages if someone tries to use `LocalAudioInterface` without `pyaudio`
