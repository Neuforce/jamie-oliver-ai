## Cooking Mode Layout Notes

### Tokens we now expose
- **Typography**: `Poppins` for hero/body (32 px extra-bold, 16 px regular), `Inter` for UI chrome (12–14 px uppercase labels). Added timer display size (72 px) and weight constants in `design-system/tokens.ts`.
- **Palette**: Teal stack (`#327179`, `#3D6E6C`, `#2C5F5D`), supportive neutrals (`#234252`, `#717182`, `#E4E7EC`, `#F2F5F6`), accents (`#48C6B1`, `#81EB67`, `#F0FF17`). CSS variables defined in `src/index.css`.
- **Shapes & Shadows**: Pills (`--jo-radius-pill`), chips (`--jo-radius-chip`), card radius (24 px), shadows matching it7 timer/card spec.

### Widget Breakdown → Component Mapping
| it7 Widget | jamie-oliver-ai Component |
| --- | --- |
| Status bar + hero gradient | `src/App.tsx` hero section (gradient background, prompt chips, avatar) |
| Prompt chips | `SearchInput` helper buttons (feed search query) |
| Timer card + controls | `components/CookWithJamie.tsx` timer section (rounded card, +/- buttons, pill CTA) |
| Chat banner | Inline banner below timer (shows recipe + countdown) |
| Progress dots / step chip | Existing progress bar + pill (styled to match palette) |
| Exit/completion dialogs | Already mapped to `RecipeModal` / `ExitCookingDialog` for future styling |

### Implementation Order / Testing
1. **Tokens** → update `design-system/tokens.ts` + CSS variables.
2. **Hero shell** → restructure `App.tsx` hero with gradient, status pill, prompt chips.
3. **Functional widgets** → restyle timer & chat banner inside `CookWithJamie.tsx`, keeping WebSocket states intact.
4. **Auxiliary dialogs** (next step) → reuse palette and radius tokens.

**Testing checklist**
- Hero renders gradient, status pill, prompt chips on desktop/mobile. Prompts update search query.
- Timer reacts to WebSocket events (start/pause/reset) and manual buttons; Start/Resume button states match agent commands.
- Chat banner shows current recipe + countdown whenever timer is visible.
- Existing filters/grid/feed logic unaffected (smoke test grid + feed toggles).
