# PR: fix(frontend): release mic when user leaves experience (NEU-467)

**Abrir el PR aquí:** https://github.com/Neuforce/jamie-oliver-ai/pull/new/fix/neu-467-mic-release-on-visibility-hidden

Copia el contenido de abajo en la descripción del PR.

---

## Description

Releases the microphone and disconnects voice when the user leaves the experience (e.g. tab switch, app background, or lock screen on iPhone). When the user returns, we do not auto-resume; we show a clear banner and require them to tap "Continue" or the mic to resume. This addresses the case where the mic stayed active after leaving the app, which was confusing and looked odd when the user had forgotten they were still "talking to Jamie."

## Linear Issue

NEU-467

## Type of Change

- [x] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Chore (dependency updates, configs, etc.)

## Changes Made

- **CookWithJamie**: Page Visibility listener; when `document.visibilityState === 'hidden'`, call `stopCapture()`, disconnect WebSocket, set `voicePausedByVisibility`. Banner and "Continue" button when paused; `resumeVoiceAfterVisibility()` to re-init mic and WS on tap.
- **useVoiceChat**: Same visibility logic; expose `isPausedByVisibility` and `resumeFromVisibility()` so ChatView can show resume UI.
- **ChatView**: Banner when voice paused by visibility; mic button triggers `resumeFromVisibility` when paused; hint text for "tap mic to resume".

## Testing

- [ ] Unit tests pass locally
- [x] Manual testing completed (recommended: test on iPhone – switch app, lock screen, then return and tap Continue/mic)
- [ ] Tested with Docker (`docker-compose up`)

## Screenshots (if UI changes)

Banner appears below header (CookWithJamie) or above input (ChatView): "Voice paused because you left the app. Tap the mic to continue with Jamie." with a "Continue" button.

## Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my code
- [x] I have commented my code, particularly in hard-to-understand areas (NEU-467 comments in code)
- [ ] I have made corresponding changes to the documentation
- [x] My changes generate no new warnings
- [x] Any dependent changes have been merged and published
