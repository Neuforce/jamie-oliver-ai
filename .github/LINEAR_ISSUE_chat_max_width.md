# Linear issue – copy into Linear (or use with Linear MCP when available)

## Title
[Frontend] Chat view has no max width on web on large screens

## Description

**Problem**
In web mode, the chat view had no max width. On wide screens the chat container (messages, input, voice banners) stretched with the viewport (e.g. ~1055px or more), while only the message column used `max-w-[380px]`. The header (TabNav) was already capped at 600px, so the layout looked inconsistent and the chat area was too wide.

**Solution**
All content inside `ChatView` (empty state, message list, input, and voice banners) is now wrapped in a container with `maxWidth: 600px` and `margin: 0 auto`, so the chat is constrained and centered on web, aligned with the header width.

**File changed:** `apps/frontend/src/components/ChatView.tsx`

**Notes**
- Recipe grid already had `maxWidth: 800px`; the chat had no limit before this change.
- Expected behaviour: on viewports > 600px, the chat block stays at 600px wide and centered.

---
Label: Frontend (or your team’s equivalent)
