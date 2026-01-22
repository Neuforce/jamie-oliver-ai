## Description

Fixes two critical issues affecting voice chat and recipe display functionality:

1. **Deepgram SDK ImportError in Production**: Voice chat was failing in Railway production with `ImportError: cannot import name 'DeepgramApiKeyError' from 'deepgram.errors'`. This was caused by version incompatibility between `deepgram-sdk` installed in `backend-search` and the version required by `ccai` package.

2. **Missing Recipe Details Display and Original Text Preservation**: When the agent called `get_recipe_details` tool, it would announce "Here are the details for that recipe" but the recipe details were not displayed in the chat interface. Additionally, the original streaming text response was being replaced by the tool-dominant copy (per AI-native design), making it impossible to see what the agent originally said. This fix adds inline recipe detail rendering and a collapsible view to access the original streaming text.

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

### 1. Fixed Deepgram SDK Version Compatibility

**Files:**
- `apps/backend-search/requirements.txt`
- `apps/backend-search/Dockerfile`
- `apps/backend-search/install.sh` (new)

**Changes:**
- Pinned `deepgram-sdk` version to `>=3.7.6,<4.0.0` to match `ccai` package requirements
- Added installation script for Railway deployment that ensures `deepgram-sdk` installs before `ccai`
- Updated Dockerfile comments to clarify dependency installation order

**Impact:**
- Resolves `ImportError` when initializing `DeepgramSTTService` in production
- Ensures consistent `deepgram-sdk` version across all environments

### 2. Added Recipe Details Display and Original Content Preservation

**Files:**
- `apps/frontend/src/components/ChatView.tsx`

**Changes:**
- **Recipe Details Display**: Added inline rendering of `recipeDetail` data when received from `get_recipe_details` tool call. Displays recipe title, meta info (time, servings, difficulty), description, ingredients preview, and "View Full Recipe" button. This ensures tool results are visible in the chat interface, aligning with the AI-native tool-first design principle.

- **Original Content Preservation (AI-Native Compliant)**: 
  - Added `originalContent` field to `Message` interface to preserve full streaming text before tool-dominant copy replacement
  - Modified `applyToolDominantCopy` usage to save original content when it gets replaced (only when content actually changes and message has tool payload)
  - Added collapsible "Show full response" component that displays original streaming text with markdown formatting
  - Component only appears when: `originalContent` exists, differs from displayed content, and message has tool payload
  - Styled similarly to thinking indicator (italic, muted color, discrete) to maintain visual consistency
  - **AI-Native Alignment**: The solution respects the tool-first principle by:
    - Keeping tool payloads (recipes, meal plans, etc.) as the primary, prominent content
    - Hiding original text by default (collapsed state)
    - Making original text optional and discoverable, not intrusive
    - Only showing when there's a tool payload (aligns with AI-native design where tools are primary)

**Impact:**
- Recipe details are now visible in chat when agent calls `get_recipe_details`
- Users can optionally access the original streaming text that was replaced by tool-dominant copy
- Better transparency while maintaining AI-native tool-first design principles
- Original text is preserved but doesn't interfere with tool payload prominence

## Testing

- [x] Unit tests pass locally
- [x] Manual testing completed
  - Verified `deepgram-sdk` installs correctly with pinned version in Railway
  - Verified voice chat WebSocket connects and processes audio without ImportError
  - Verified recipe details display correctly when `get_recipe_details` tool is called
  - Verified original content is preserved and can be expanded/collapsed
  - Verified markdown formatting works correctly in expanded original content
- [x] Tested with Docker (`docker-compose up`)
  - Verified `backend-search` builds and runs correctly with updated dependencies

## Screenshots (if UI changes)

N/A - Backend fixes and UI improvements, no major visual changes

## Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my code
- [x] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation (no documentation changes required)
- [x] My changes generate no new warnings
- [x] Any dependent changes have been merged and published

---

## Additional Context

### Problem 1: Deepgram SDK ImportError

**Error in production:**
```
ImportError: cannot import name 'DeepgramApiKeyError' from 'deepgram.errors'
```

**Root Cause:**
- `backend-search/requirements.txt` specified `deepgram-sdk>=3.0.0` (too broad)
- `ccai` package requires `deepgram-sdk ^3.7.6` (specific version range)
- When `ccai` installed after general dependencies, it could install a different version causing import conflicts

**Solution:**
- Pinned `deepgram-sdk` to `>=3.7.6,<4.0.0` in `backend-search/requirements.txt` to match `ccai` requirements
- Created `install.sh` script for Railway that installs dependencies in correct order
- Ensures `deepgram-sdk` is installed with compatible version before `ccai` tries to use it

**Impact:**
- Voice chat WebSocket now works correctly in Railway production
- No more ImportError when initializing Deepgram STT service

### Problem 2: Missing Recipe Details and Lost Original Text

**Error flow:**
1. Agent streams text response: "Beef Stir Fry is a fantastic choice! It's quick, just about 20 minutes..."
2. Agent calls `get_recipe_details` tool
3. Backend sends `recipe_detail` event with full recipe data
4. Frontend receives data but doesn't render it
5. `applyToolDominantCopy` replaces streaming text with "Here are the details for that recipe."
6. Original streaming text is lost forever

**Solution:**
- Added inline rendering of `recipeDetail` data in chat message
- Preserve original streaming content in `originalContent` field before applying tool-dominant copy
- Added collapsible component to show/hide original text with markdown formatting
- Component only appears when original content differs from displayed content and message has tool payload

**Impact:**
- Recipe details are now visible in chat interface
- Users can optionally access original agent responses that were replaced
- Better user experience with full transparency while maintaining AI-native design principles

**Design & Architecture Alignment:**
- ✅ **AI-Native Compliant**: The collapsible solution respects the tool-first design principle:
  - Tool payloads (recipes, meal plans, recipe details, shopping lists) remain the primary, prominent content
  - Original text is hidden by default (collapsed), maintaining tool-first hierarchy
  - Only appears when there's a tool payload, aligning with AI-native design where tools are primary
  - Text remains secondary - the "friendly intro" as per design principles (per `JAMIE_DISCOVERY_PROMPT`: "Your text is the friendly intro - the UI shows the details")
- ✅ **Design Guidelines**: Follows editorial + recipe experience principles:
  - Discrete, non-intrusive styling (italic, muted color) similar to thinking indicator
  - No visual clutter - component is subtle and optional
  - Maintains clear vertical flow - appears between message content and tool payloads
  - Buttons feel helpful, not aggressive (per Guidelines.md)
- ✅ **User Experience**: Provides transparency without compromising the AI-native experience:
  - Original text is discoverable but doesn't distract from tool results
  - Smooth animations for expand/collapse
  - Markdown formatting preserves readability when expanded
