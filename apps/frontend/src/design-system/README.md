# Jamie Oliver Recipe App - Design System

A comprehensive design system for the Jamie Oliver Recipe Discovery application.

## 🎨 Design Tokens

### Colors

```typescript
import { colors } from './tokens';

// Primary Brand Colors
colors.primary.DEFAULT    // #46BEA8 - Main teal
colors.primary.dark       // #327179 - Dark teal
colors.primary.light      // #81EB67 - Light green
colors.primary.glow       // #48C6B1 - Glow effect

// Difficulty Levels
colors.difficulty.easy    // #81EB67 - Green
colors.difficulty.medium  // #F0B100 - Orange
colors.difficulty.hard    // #EF4444 - Red
```

### Typography

```typescript
import { typography } from './tokens';

// Font Families
typography.fonts.display  // 'Work Sans' - For headings
typography.fonts.body     // 'Inter' - For body text
typography.fonts.system   // 'SF Pro Text' - For system UI

// Font Sizes
typography.sizes.xs       // 12px
typography.sizes.sm       // 14px
typography.sizes.base     // 16px
```

### Spacing

Uses a consistent 4px grid system:
- `spacing[1]` = 4px
- `spacing[2]` = 8px
- `spacing[3]` = 12px
- `spacing[4]` = 16px
- etc.

## 🧩 Components

### Badge

Displays categorization labels with predefined styles.

```tsx
import { Badge } from '@/design-system/components';

<Badge variant="cuisine">Italian</Badge>
<Badge variant="medium">Medium</Badge>
<Badge variant="easy">Easy</Badge>
```

**Variants:**
- `cuisine` - Dark background for cuisine type
- `easy` - Green for easy difficulty
- `medium` - Orange for medium difficulty
- `hard` - Red for hard difficulty

---

### SearchInput

Search bar with integrated icon.

```tsx
import { SearchInput } from '@/design-system/components';

<SearchInput 
  placeholder="Search recipes by name, ingredie..."
  onSearch={(value) => console.log(value)}
/>
```

**Props:**
- `placeholder` - Placeholder text
- `onSearch` - Callback when search value changes
- All standard input props

---

### RecipeCard

Card component for displaying recipe information.

```tsx
import { RecipeCard } from '@/design-system/components';

<RecipeCard
  image="/path/to/image.jpg"
  title="Classic Spaghetti Carbonara"
  cuisine="Italian"
  difficulty="Medium"
  time="25 mins"
  servings={4}
  onClick={() => handleRecipeClick()}
/>
```

**Props:**
- `image` - Recipe image URL
- `title` - Recipe name
- `cuisine` - Cuisine type (e.g., "Italian")
- `difficulty` - "Easy" | "Medium" | "Hard"
- `time` - Cooking time (e.g., "25 mins")
- `servings` - Number of servings
- `onClick` - Click handler

---

### RecipeGrid

Grid layout for displaying multiple recipe cards.

```tsx
import { RecipeGrid } from '@/design-system/components';

<RecipeGrid 
  recipes={[
    {
      image: "/image1.jpg",
      title: "Recipe 1",
      cuisine: "Italian",
      difficulty: "Medium",
      time: "25 mins",
      servings: 4
    },
    // ... more recipes
  ]}
/>
```

---

### ViewToggle

Toggle between different view modes (grid, list, filter).

```tsx
import { ViewToggle } from '@/design-system/components';

const [view, setView] = useState<ViewMode>('grid');

<ViewToggle 
  activeView={view}
  onViewChange={setView}
/>
```

**ViewMode types:**
- `'grid'` - Grid view
- `'list'` - List view
- `'filter'` - Filter view

---

### AvatarWithGlow

Avatar component with colorful glow effect.

```tsx
import { AvatarWithGlow } from '@/design-system/components';

<AvatarWithGlow
  src="/avatar.jpg"
  alt="Jamie Oliver"
  size={170}
/>
```

**Props:**
- `src` - Avatar image URL
- `alt` - Alt text
- `size` - Size in pixels (default: 170)

---

### Navigation

Top navigation bar with menu button and logo.

```tsx
import { Navigation } from '@/design-system/components';

<Navigation
  logoSrc="/logo.png"
  onMenuClick={() => console.log('Menu clicked')}
/>
```

---

### GlowEffect

Background glow effect with radial gradients.

```tsx
import { GlowEffect } from '@/design-system/components';

<GlowEffect />
```

Use this component as a background element to create the signature Jamie Oliver app aesthetic.

---

## 📱 Responsive Design

All components are designed mobile-first for 390px width (iPhone 12/13/14 standard).

## 🎯 Design Principles

1. **Touch-friendly** - All interactive elements are at least 44x44px
2. **Edge-to-edge images** - Recipe cards use full-width images with no margins
3. **Subtle overlays** - Gradient overlays ensure text readability on images
4. **Consistent spacing** - 4px grid system throughout
5. **Accessible** - Proper contrast ratios and semantic HTML

## 🚀 Usage

```tsx
import { 
  Badge, 
  RecipeCard, 
  SearchInput,
  ViewToggle 
} from '@/design-system/components';
import { colors, typography } from '@/design-system/tokens';

function MyComponent() {
  return (
    <div>
      <SearchInput onSearch={(val) => console.log(val)} />
      <RecipeCard {...recipeProps} />
    </div>
  );
}
```

## 🔧 Customization

You can extend components using Tailwind classes:

```tsx
<Badge variant="medium" className="shadow-lg">
  Custom Badge
</Badge>
```

All components accept a `className` prop for additional styling.
