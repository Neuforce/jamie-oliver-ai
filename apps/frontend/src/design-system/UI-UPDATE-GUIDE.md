# UI Update Guide - Jamie Oliver Recipe App

## ✅ What We've Done

Successfully adapted the existing functional app to use the Figma mock design system:

### 1. **Design Tokens Updated** (`/styles/globals.css`)
- Primary color changed from orange (#F97316) to teal (#46BEA8)
- Accent color set to light green (#81EB67)
- Added Jamie Oliver brand colors
- Updated all CSS variables to match new design system

### 2. **Hero Section Redesigned**
- **Before**: Orange gradient background with grid pattern
- **After**: Clean white background with subtle glow effect
- **Components Used**:
  - `<GlowEffect />` - Multi-color radial gradient background
  - `<AvatarWithGlow />` - Jamie's avatar with colorful ring
  - `<SearchInput />` - Clean search bar with integrated icon
- **Colors**: White background, teal accents, minimal chrome

### 3. **Recipe Cards Updated** (`/components/RecipeCard.tsx`)
- **Edge-to-edge design**: Images fill entire card with gradient overlay
- **Badge colors**: 
  - Category: `bg-[rgba(3,2,19,0.9)]` (dark)
  - Easy: `#81EB67` (green)
  - Medium: `#F0B100` (orange)
  - Hard: `#EF4444` (red)
  - In Progress: `#81EB67` (green)
- **Aspect ratio**: `196/245` matching Figma mock
- **Typography**: Precise matching with `text-sm leading-5` and `tracking-[-0.15px]`

### 4. **UI Accents Updated**
- Floating chat button: Teal (#46BEA8) instead of orange
- Footer chef hat icon: Teal instead of orange
- All interactive elements use new brand colors

---

## 📋 Template for Future UI Updates

When you need to update UI elements, use this format:

### QUICK UPDATE FORMAT

```markdown
**Component**: [Component name/path]
**Change**: [What needs to change]
**Colors to use**:
- Primary: #46BEA8 (teal)
- Primary Dark: #327179 (dark teal)
- Accent Green: #81EB67
- Accent Yellow: #F0FF17
- Accent Orange: #F0B100

**Example**:
Replace: bg-orange-500
With: bg-[#46BEA8]
```

### DETAILED UPDATE FORMAT

```markdown
### CONTEXT
- Component: /components/ComponentName.tsx
- Current state: [Brief description]
- Desired state: [What it should look like]

### CHANGES REQUIRED

#### Colors
| Element | Current | New |
|---------|---------|-----|
| Button background | orange-500 | #46BEA8 |
| Hover state | orange-600 | #327179 |

#### Typography
| Element | Font Size | Weight | Color |
|---------|-----------|--------|-------|
| Title | text-lg | medium | #0A0A0A |
| Body | text-sm | normal | #5d5d5d |

#### Spacing/Layout
- Padding: px-4 py-2
- Gap: gap-2
- Rounded: rounded-full

### REFERENCE
- See: /design-system/components/[similar-component]
- Figma: [link or description]
```

---

## 🎨 Color Reference Quick Guide

```css
/* Primary Brand Colors */
--jamie-primary: #46BEA8;           /* Main teal - buttons, accents */
--jamie-primary-dark: #327179;      /* Dark teal - hover states */
--jamie-accent-green: #81EB67;      /* Light green - success, easy */
--jamie-accent-yellow: #F0FF17;     /* Yellow - highlights */
--jamie-accent-orange: #F0B100;     /* Orange - medium difficulty */

/* Difficulty Badges */
Easy: bg-[#81EB67] text-white
Medium: bg-[#F0B100] text-white
Hard: bg-[#EF4444] text-white

/* Category/Cuisine Badge */
bg-[rgba(3,2,19,0.9)] text-white

/* Text Colors */
Primary text: #0A0A0A
Secondary text: #5d5d5d
Muted text: #717182
```

---

## 🧩 Design System Components

All components are in `/design-system/components/`:

1. **AvatarWithGlow** - Avatar with gradient ring
2. **Badge** - Category and difficulty labels
3. **SearchInput** - Search bar with icon
4. **RecipeCard** - Recipe display card
5. **RecipeGrid** - Grid layout for cards
6. **ViewToggle** - Grid/List/Filter tabs
7. **TabButton** - Rounded tab buttons
8. **GlowEffect** - Background glow effect
9. **Navigation** - Top nav bar

### Usage Example:
```tsx
import { AvatarWithGlow } from '@/design-system/components';

<AvatarWithGlow
  src="/image.jpg"
  alt="Jamie Oliver"
  size={170}
/>
```

---

## 🚫 What NOT to Change

**Keep these as-is (functional requirements)**:
- Session management logic
- LocalStorage interactions
- Timer functionality
- Voice control
- Chat system
- Modal system
- Recipe data structure

**Only update**: Visual styling, colors, spacing, typography

---

## 📱 Responsive Guidelines

- **Mobile-first**: Designed for 390px width
- **Breakpoints**: sm:640px, md:768px, lg:1024px, xl:1280px
- **Touch targets**: Minimum 44x44px
- **Grid**: 2 cols mobile, 3+ cols desktop

---

## ✍️ Typography Rules

**Do NOT use Tailwind font size/weight classes unless explicitly changing design**

Default typography is set in `/styles/globals.css`:
- h1: 24px (--text-2xl) - medium
- h2: 20px (--text-xl) - medium  
- h3: 18px (--text-lg) - medium
- body: 16px (--text-base) - normal
- small: 14px (--text-sm) - normal

Only override when specifically requested.

---

## 🔄 Standard Update Workflow

1. **Identify** the component or section to update
2. **Check** if a design-system component exists
3. **Apply** brand colors from the reference guide
4. **Test** that functionality remains intact
5. **Verify** responsive behavior
6. **Document** what changed

---

## 📝 Example: Updating a Button

### Before:
```tsx
<Button className="bg-orange-500 hover:bg-orange-600">
  Click me
</Button>
```

### After:
```tsx
<Button className="bg-[#46BEA8] hover:bg-[#327179]">
  Click me
</Button>
```

---

## 🎯 Checklist for UI Updates

- [ ] Colors match design system (#46BEA8, #81EB67, etc.)
- [ ] Typography follows guidelines (14px base)
- [ ] Spacing uses 4px grid (gap-2, px-4, etc.)
- [ ] Rounded corners appropriate (rounded-full for pills)
- [ ] Touch targets minimum 44x44px
- [ ] Hover states defined
- [ ] Responsive at all breakpoints
- [ ] No functionality broken
- [ ] Badges use correct colors
- [ ] Icons are lucide-react with strokeWidth={1.5}

---

## 💡 Pro Tips

1. **Use exact hex values** for brand colors: `bg-[#46BEA8]` instead of custom Tailwind
2. **Check the Figma mock** for precise spacing and sizing
3. **Maintain 1px gaps** between grid items: `gap-[1px]`
4. **Use backdrop-blur** for glassmorphism effects
5. **Keep gradient overlays** on images for text readability
6. **Preserve all `onClick`, `onChange`, etc.** handlers

---

## 🎨 Design Principles (from Guidelines.md)

- **Editorial, not SaaS**: Content first, minimal UI chrome
- **Warm & approachable**: Not technical or cold
- **One primary action**: Per screen/section
- **Touch-friendly**: 44x44px minimum
- **Edge-to-edge images**: No side margins on cards
- **Clickable cards**: Entire card is interactive

---

This guide ensures UI updates are consistent, efficient, and maintain the established design system! 🚀
