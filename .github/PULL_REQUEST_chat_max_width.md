## Description

Adds a max width (600px) to the chat view in web mode so the entire chat area is constrained and centered, matching the header (TabNav). Previously the chat container stretched with the viewport on wide screens while only the message column had `max-w-[380px]`.

## Linear Issue

[NEU-XXX – Chat view has no max width on web on large screens](https://linear.app/neuforce/issue/NEU-XXX)  
*(Replace NEU-XXX with the issue ID after you create it in Linear.)*

## Type of Change

- [x] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Chore (dependency updates, configs, etc.)

## Changes Made

- **ChatView**: Wrapped all content (empty state, messages, input, voice banners) in an inner container with `maxWidth: 600px` and `margin: 0 auto` so the chat is limited and centered on web.

## Testing

- [ ] Verified on wide viewport: chat column stays 600px and centered
- [ ] Chat, recipes tab, and header alignment look consistent
