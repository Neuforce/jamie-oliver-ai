## Description

Releases the microphone and disconnects voice when the user leaves the experience (e.g. tab switch, app background, or lock screen on iPhone). When the user returns, we do not auto-resume; we show a clear banner and require them to tap "Continue" or the mic to resume. This addresses the case where the mic stayed active after leaving the app, which was confusing and looked odd when the user had forgotten they were still "talking to Jamie."

Additional follow-ups in this PR: the "Voice paused" banner is standardized with the rest of the voice UI (same strip style as VoiceModeIndicator, jamie-primary palette), and verbose voice/WebSocket debug logging has been commented out (with `// DEBUG voice:` markers) to avoid costly console output in production while keeping it easy to re-enable for debugging.

## Linear Issue

[NEU-467 – Voice Mode: Mic stays active after leaving experience (iOS)](https://linear.app/neuforce/issue/NEU-467/voice-mode-mic-stays-active-after-leaving-experience-ios)

## Type of Change

- [x] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Chore (dependency updates, configs, etc.)

## Changes Made

- **CookWithJamie**: Page Visibility listener; when `document.visibilityState === 'hidden'`, call `stopCapture()`, disconnect WebSocket, set `voicePausedByVisibility`. Banner and "Continue" when paused; `resumeVoiceAfterVisibility()` to re-init mic and WS on tap.
- **useVoiceChat**: Same visibility logic; expose `isPausedByVisibility` and `resumeFromVisibility()` so ChatView can show resume UI.
- **ChatView**: Banner when voice paused by visibility; mic button triggers `resumeFromVisibility` when paused; hint text for "tap mic to resume".
- **VoiceModeIndicator**: New `VoicePausedBanner` component — same strip layout as Listening/Thinking/Jamie is speaking (icon + label + pill action), uses `--jamie-primary` / `--jamie-primary-dark` and `--font-display` so the "Voice paused" state looks consistent and AI-native. Used in both CookWithJamie and ChatView.
- **Logging**: Commented out verbose voice/WebSocket debug logs in ChatView and useVoiceChat (e.g. "Text chunk received" per chunk, session started, recipes/meal_plan received, etc.). Left `// DEBUG voice: uncomment to trace ...` so they can be re-enabled for debugging. `console.error` for real errors (mic permission, WebSocket errors) is unchanged.

## Testing

- [ ] Unit tests pass locally
- [x] Manual testing completed (recommended: test on iPhone – switch app, lock screen, then return and tap Continue/mic)
- [ ] Tested with Docker (`docker-compose up`)

## Screenshots (if UI changes)

The "Voice paused" banner uses the same strip as the voice mode indicator: white background, subtle border, icon (MicOff) + "VOICE PAUSED" label in jamie-primary-dark, subtext "Tap the mic or Continue to talk to Jamie again.", and a pill "Continue" button (same style as the Stop button in voice mode). Appears below the header in CookWithJamie and above the input in ChatView.

## Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my code
- [x] I have commented my code, particularly in hard-to-understand areas (NEU-467 and DEBUG voice comments)
- [ ] I have made corresponding changes to the documentation
- [x] My changes generate no new warnings
- [x] Any dependent changes have been merged and published
