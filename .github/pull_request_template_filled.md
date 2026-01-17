## Description

UI improvements and fixes for cooking mode, chat interface, main app layout, header navigation, and new landing page implementation. Focuses on layout refinements, mic control consolidation, visual consistency, header restructure with integrated chat button, new landing page with prompt suggestions, automatic message sending to chat, responsive design fixes for gradient positioning and recipe view toggles, and responsive image dimensions with proper centering across all recipe card variants.

## Linear Issue

<!-- Link to the Linear issue, e.g., NEU-XXX -->

## Type of Change

- [x] Bug fix (non-breaking change that fixes an issue)
- [x] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Chore (dependency updates, configs, etc.)

## Changes Made

### CookWithJamie Component (`apps/frontend/src/components/CookWithJamie.tsx`)

- **Mic Control Consolidation**:
  - Removed floating mic button at the bottom of cooking mode
  - Mic control now exclusively in the top header alongside back button and logo
  - Implemented dynamic mic icon switching: `/assets/tabler-icon-microphone-off.svg` (muted) and `/assets/tabler-icon-microphone.svg` (active)
  - Implemented dynamic avatar switching: `/assets/Ellipse-red.svg` (muted) and `/assets/Ellipse-green.svg` (active)
  - Mic control container styling: 93px width, 42px height, rounded pill, subtle shadow, background `#F9FAFB`
  - Avatar positioned at extreme right of container, perfectly aligned with rounded edge (42x42px, no forced dimensions)

- **Header Layout**:
  - Back button: 24x24px, 16px from top margin, no rounded container
  - Logo: centered, 17px from top margin
  - Mic control: 7px from top margin, positioned at right

- **Recipe Display**:
  - Replaced hero image with `RecipeCard` component in "feed" mode
  - Recipe title moved outside RecipeCard container, positioned 24px from bottom edge of image
  - Title styling: uppercase, 24px font size (maintained from RecipeCard cooking variant)
  - Step indicators positioned 24px from bottom edge of recipe card

- **Button Styling**:
  - "Mark complete" button:
    - Incomplete state: height 48px, padding 14px 26px, gap 9px, pill radius, 2px border `#3D6E6C`, centered
    - Completed state: height 48px, padding 14px 26px, gap 9px, pill radius, 2px border `#007AFF`, background `rgba(0,122,255,0.1)`
    - Text color matches border color ("COMPLETED" and "MARK COMPLETE")
  - "Previous" button: height 48px, padding 14px 24px, gap 9px, pill radius, opacity 0.5, text 14px
  - "Next Step" / "Finish Cooking" button: height 48px, padding 14px 25px 14px 24px, gap 8px, background `#3D6E6C` with darker hover, pill radius, shadow `0 1px 3px rgba(0,0,0,0.1)`, text 14px
  - Reduced gap between "Previous" and "Next Step" buttons

- **Step Layout**:
  - Step indicators: 24px from bottom edge of recipe card, 24px from left/right margins
  - Step indicators buttons: equal width, 8px gap between each
  - "Step X of Y" badge: 24px from step indicators, full width of container
  - Step description: 24px below badge, left-aligned text, `text-xl` font size
  - Reorganized layout: step indicators → badge → description (vertical flow with 24px gaps)
  - Container uses `max-w-[420px]` for consistent width across all step elements

- **Animation Improvements**:
  - Added `AnimatePresence` with `mode="wait"` for smooth step transitions
  - Step content fades in/out with vertical slide animation (opacity 0→1, y: 20→0)
  - Transition duration: 0.3s for smooth user experience

- **Timer Improvements**:
  - Added console logging for timer control debugging
  - Improved timer visibility logic: shows when timer is running OR when current step is a timer step
  - Removed redundant `speakText` call on timer finish (backend handles announcement)

- **Chat History Cleanup on Recipe Completion**:
  - Imported `clearChatHistory` function from `ChatWithJamie` component
  - Chat history is automatically cleared when a recipe is completed via `handleFinishCooking`
  - Ensures fresh chat experience for each new recipe session
  - Clears localStorage chat messages when recipe is finished

- **Header Container (600px Fixed Width)**:
  - Header (Back button, logo, mic control) now uses fixed 600px width container, centered
  - Uses CSS Grid (3 columns) for proper alignment: Back button left, logo centered, mic control right
  - Prevents elements from appearing at screen edges in web mode
  - Back button changed from `ArrowLeft` icon to `Back.svg` for consistency
  - **Responsive Logo**:
    - Logo height: `clamp(20px, calc(100vw * 24 / 390), 24px)` for responsive scaling
    - Logo maxWidth: `171.75px` to prevent distortion
    - Logo centered using flexbox within grid column

- **Recipe Image Container (600px Fixed Width)**:
  - Recipe image in cooking mode wrapped in 600px fixed width container, centered
  - Maintains consistent layout with other interface elements
  - **Responsive Image Centering**:
    - Image container uses flexbox (`flex items-center justify-center`) for proper centering
    - Image dimensions scale proportionally from mobile (390px) to web (max 598x567px)
    - Image always centered horizontally regardless of screen width

- **Back Button Navigation**:
  - Added `onBackToChat` prop to navigate back to chat modal when clicking Back button
  - Back button in cooking mode now closes cooking and opens chat modal
  - Provides seamless navigation flow between cooking and chat

- **Recipe Completion Modal**:
  - Replaced toast notification with full-screen completion modal
  - Modal includes:
    - Header with X button, logo, and mic control in 600px fixed width container
    - Content centered vertically on screen using flexbox
    - Title "WELL DONE!" in color #2C5F5D (Poppins, 32px, bold)
    - Descriptive text in #2C5F5D (Poppins, 16px, left-aligned)
    - "EXPLORE MORE RECIPES" button with background #3D6A6C and icon circle #29514F
    - Content container fixed at 300px width, centered
  - Added `onExploreRecipes` prop to navigate to recipes view
  - Modal uses `AnimatePresence` for smooth fade in/out animations

### ChatWithJamie Component (`apps/frontend/src/components/ChatWithJamie.tsx`)

- **Header Layout Fix**:
  - Fixed logo centering issue by switching from flexbox with absolute positioning to CSS Grid (3 columns)
  - Logo now properly centered regardless of side button sizes
  - Grid layout: left column (close button), center column (logo with `justify-center`), right column (recipes button with `justify-end`)
  - **Responsive Container**: Header now uses inner container of 600px width, centered with `mx-auto`
  - Container uses `box-sizing: border-box` to ensure total width is 600px including padding
  - Prevents buttons from appearing at screen edges in web mode
  - **Responsive Logo**:
    - Logo height: `clamp(20px, calc(100vw * 24 / 390), 24px)` for responsive scaling
    - Logo maxWidth: `171.75px` to prevent distortion
    - Logo centered using flexbox and CSS Grid

- **Send Button Styling**:
  - Changed inactive state background color from `#b4b4b4` to `#F2F5F6` for better visual consistency

- **Auto-Send Initial Message**:
  - Added `initialMessage` prop to accept messages from landing page
  - Automatically sends message to backend when provided
  - Displays user message in chat history immediately
  - Waits for backend semantic search response and displays results
  - Handles recipe transformation and loading from local files if needed

- **Chat History Persistence**:
  - Implemented localStorage persistence for chat messages
  - Messages are saved automatically whenever they change
  - Chat history is restored when reopening the chat modal
  - Messages persist across page reloads
  - Exported `clearChatHistory()` function for clearing chat history when recipe is completed

- **Recipes Button Navigation**:
  - Added `onRecipesClick` prop to navigate to recipes view
  - Recipes button in chat header now closes chat and navigates to recipes view
  - Provides seamless navigation between chat and recipes

### RecipeModal Component (`apps/frontend/src/components/RecipeModal.tsx`)

- **Header Container (600px Fixed Width)**:
  - Header (Back button, logo, Recipes button) now uses fixed 600px width container, centered
  - Uses CSS Grid (3 columns) for proper alignment: Back button left, logo centered, Recipes button right
  - Prevents buttons from appearing at screen edges in web mode
  - **Responsive Logo**:
    - Logo height: `clamp(24px, calc(100vw * 32 / 390), 32px)` for responsive scaling
    - Logo maxWidth: `171.75px` to prevent distortion
    - Logo centered using flexbox within grid column

- **Cook with Jamie Button Container (600px Fixed Width)**:
  - Button container wrapped in 600px fixed width container, centered
  - Maintains consistent layout with header

- **Tabs Container (600px Fixed Width)**:
  - Tabs toggle (Ingredients/Utensils/Instructions/Tips) wrapped in 600px fixed width container, centered
  - TabsContent also wrapped in 600px container for consistent alignment
  - Prevents tabs from appearing at screen edges in web mode

### RecipeCard Component (`apps/frontend/src/components/RecipeCard.tsx`)

- **Cooking Variant**:
  - Added new `cooking` variant for cooking mode display
  - Image: rounded corners on all 4 sides, responsive dimensions
  - Title: uppercase, 24px font size, positioned outside image container, 24px from bottom edge of image
  - Metadata row with cooking time and servings
  - Back button: 24x24px, positioned 24px above card, with Jamie Oliver logo centered
  - **Responsive Image Dimensions**: 
    - Width: `calc(100vw * 369 / 390)` with `maxWidth: '598px'`
    - Height: `calc(100vw * 350 / 390)` with `maxHeight: '567px'`
    - Image centered horizontally using flexbox container

- **Modal Variant**:
  - **Responsive Image Dimensions**:
    - Width: `calc(100vw * 369 / 390)` with `maxWidth: '598px'`
    - Height: `calc(100vw * 350 / 390)` with `maxHeight: '567px'`
    - Image centered horizontally using flexbox container

- **Feed Variant**:
  - **Responsive Image Dimensions**:
    - Width: `calc(100vw * 350 / 390)` with `maxWidth: '350px'`
    - Height: `calc(100vw * 264.75 / 390)` with `maxHeight: '264.75px'`
    - Image centered horizontally using flexbox container
    - Border radius: `24px 24px 0 0` for top corners

- **Chat Variant** (New):
  - Added new `chat` variant for recipe carousel in chat interface
  - **Responsive Image Dimensions**:
    - Width: `calc(100vw * 350 / 390)` with `maxWidth: '350px'`
    - Height: `calc(100vw * 437.5 / 390)` with `maxHeight: '437.5px'`
    - Image centered horizontally using flexbox container
  - Styling similar to grid variant: gradient overlay, badges, title at bottom
  - Border radius: `24px` on all corners

- **Grid Variant**:
  - Fixed dimensions: `164.5px` width, `205.625px` height
  - Border radius: `24px`

### RecipeCarousel Component (`apps/frontend/src/components/RecipeCarousel.tsx`)

- **Chat Variant Integration**:
  - Updated to use `variant="chat"` for RecipeCard components
  - Recipe cards in chat now use responsive dimensions (350x437.5px base)
  - Fixed React import error by adding `import React` to resolve JSX linter errors

### Nav Component (`apps/frontend/src/imports/Nav.tsx`)

- **Dual Layout System**:
  - **Landing Page Layout** (`showRecipesButton = true`):
    - Logo centered at top
    - Buttons "Recipes" and "Chat" positioned below logo, centered horizontally
    - Both buttons display icon (24x24px) and text label
    - Recipes button uses `/assets/Recipes.svg` icon
    - Chat button uses `MessageCircle` icon
    - Buttons styled with white background, border, and teal text
  - **Recipes View Layout** (`showRecipesButton = false`):
    - Logo centered horizontally
    - Chat button positioned at top right corner (absolute positioning)
    - Chat button icon-only (18x18px), no text label
    - Same styling as landing buttons but icon-only variant

- **Container Properties**:
  - Nav container: width 100%, maxWidth 600px, padding 17px top/bottom, 16px left/right
  - Uses `box-sizing: border-box` to ensure total width is 600px including padding
  - Border radius: 16px bottom-left and bottom-right
  - Accepts `onChatClick`, `onRecipesClick`, `onCloseClick`, and `showRecipesButton` props
  - **Recipes View**: Close button (X) integrated into Nav layout, positioned at left side of container
  - **Responsive Logo**:
    - Logo height: `clamp(20px, calc(100vw * 24 / 390), 24px)` for responsive scaling
    - Logo maxWidth: `171.75px` to prevent distortion
    - Logo centered in all layouts using flexbox
  - **Centered Elements**:
    - All elements (logo, buttons) properly centered regardless of screen width
    - Landing page layout: logo and buttons centered horizontally
    - Recipes view layout: logo centered, buttons positioned with fixed widths for proper alignment

### App Component (`apps/frontend/src/App.tsx`)

- **New Landing Page**:
  - Added `showLanding` state to control landing vs recipes view
  - Landing page includes:
    - Header with logo and Recipes/Chat buttons (via Nav component)
    - Jamie's avatar with glow effect
    - Title "COOK WITH JAMIE" (32px, uppercase, teal)
    - Welcome message: "Hello there! I'm Jamie Oliver, and I'm here to help you discover amazing recipes." (307px width, 72px height, Poppins 16px, line-height 150%, color #234252, centered)
    - 4 prompt suggestion buttons: "I've had a long day", "I just need something easy", "Cook something you love", "My energy is at 2%"
    - Text input with arrow button (36x36px, rounded pill, border, shadow)
    - Arrow button: active state (#46BEA8 background, white icon), disabled state (#F2F5F6 background, #8E8E93 icon)
  - Navigation: Recipes button navigates to recipes view, Chat button opens chat modal

- **Recipes View Updates**:
  - Replaced Back button with Close button (X icon, same as chat modal)
  - Close button moved inside Nav component, within 600px container
  - Close button positioned at left side of Nav container (24x24px)
  - Close button uses SVG X icon with stroke #327179
  - Clicking close button returns to landing page
  - Close button no longer uses `fixed` positioning, now relative to Nav container

- **Auto-Send Message to Chat**:
  - Added `initialChatMessage` state to pass messages from landing to chat
  - `handleLandingInputSubmit`: sends input value to chat and opens modal
  - `handlePromptClick`: sends selected prompt to chat and opens modal
  - Messages automatically appear in chat history and trigger backend search
  - Clears `initialChatMessage` when chat closes

- **Header Integration**:
  - Removed standalone Chat button with fixed positioning
  - Chat button now integrated into Nav component
  - Passes `onChatClick` and `onRecipesClick` handlers to Nav component
  - Nav component handles different layouts for landing vs recipes view

- **Recipe View Toggle**:
  - Changed active button color to `#3D6E6C` (replaced Button component with native button elements for better control)
  - Active button: background `#3D6E6C`, white text, hover opacity 0.9
  - Inactive button: transparent background
  - Toggle container and filter button container: fixed width 600px, centered with `mx-auto`

- **Category Filter Buttons**:
  - Changed active category button color from `#46BEA8` to `#3D6E6C` for consistency with design system
  - **Hidden by Default**: Category buttons are now hidden by default and only shown when filter button is clicked
  - Category filters use `AnimatePresence` with smooth expand/collapse animation
  - Buttons displayed in flex-wrap layout within fixed-width container
  - **Responsive Container**: Category filters wrapped in 600px width container, centered with `mx-auto`
  - Prevents categories from appearing at left edge in web mode
  - Filter toggle button now always remains in "ghost" state (gray), regardless of category selection
  - White indicator dot still appears when a category is selected, but button background stays gray

### GlowEffect Component (`apps/frontend/src/design-system/components/GlowEffect.tsx`)

- **Gradient Positioning Fix**:
  - Fixed gradient position to remain consistent between mobile and web views
  - Changed container structure to match main content container (`container mx-auto px-5`)
  - Inner container uses `max-w-md mx-auto` to align with search input
  - SVG positioned at `left: -30px` to align with top-left of search input
  - Gradient now properly positioned above search input, touching avatar, matching mobile layout

### CSS Variables (`apps/frontend/src/styles/globals.css` and `apps/frontend/src/index.css`)

- **Primary Color Update**:
  - Updated `--primary` CSS variable from `#46BEA8` to `#3D6E6C` in both `globals.css` and `index.css`
  - Ensures consistent primary color (`#3D6E6C`) across all components using `bg-primary`
  - Affects category filter buttons, default button variant, and other primary-colored elements

## Testing

- [x] Unit tests pass locally
- [x] Manual testing completed
- [ ] Tested with Docker (`docker-compose up`)

## Screenshots (if UI changes)

<!-- Add screenshots or GIFs showing the changes -->
- Cooking mode header with consolidated mic control
- Chat interface with properly centered logo
- Recipe card in cooking variant with correct layout
- Recipe view toggle with active state color `#3D6E6C`
- Gradient effect properly positioned in both mobile and web views
- Header navigation with integrated chat button (600px container, logo centered, chat button on right)
- New landing page with welcome message, prompt suggestions, and input field
- Landing page navigation: Recipes and Chat buttons below logo
- Recipes view with close button (X) instead of back arrow
- Category filters hidden by default, shown when filter button is clicked
- Auto-send message functionality from landing to chat
- Responsive containers (600px) for headers and category filters, preventing edge alignment in web mode
- Chat history persistence across modal opens and page reloads
- Chat history automatically cleared when recipe is completed
- Recipes button in chat header navigates to recipes view
- Cooking mode header with 600px fixed width container (Back, logo, mic)
- Recipe image in cooking mode with 600px fixed width container
- Back button in cooking mode navigates to chat modal
- Recipe completion modal with centered content and 300px width container
- RecipeModal header, buttons, and tabs with 600px fixed width containers
- Responsive recipe images in all variants (cooking, modal, feed, chat, grid) with proper centering
- Responsive logo scaling in all headers (Nav, ChatWithJamie, CookWithJamie, RecipeModal)
- Recipe images centered horizontally regardless of screen width
- Chat variant recipe cards with responsive dimensions (350x437.5px base)

## Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my code
- [x] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [x] My changes generate no new warnings
- [x] Any dependent changes have been merged and published

---

## Recipe Data Platform (RDP) PRs

<!-- Only fill this section if this PR is part of the Recipe Data Platform epic -->

If this PR is part of the Recipe Data Platform epic (RDP-XX issues):

- [ ] Branch created from `feature/recipe-data-platform` (not `main`)
- [ ] PR targets `feature/recipe-data-platform` branch
- [ ] New behavior is behind a feature flag
- [ ] Backward compatibility is maintained (app works with flag OFF)
- [ ] Tests added for both flag ON and OFF states
- [ ] No deletion of existing code (cleanup comes later)
