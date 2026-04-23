import React, { useState } from 'react';
import { AppHeader } from './AppHeader';
import { AppMenu } from './AppMenu';

export type TabView = 'chat' | 'recipes' | 'my-recipes';
export type MyTabCardStatus = 'unavailable' | 'signed_out' | 'signed_in';

export interface MyTabCardData {
  status: MyTabCardStatus;
  title: string;
  siteName?: string;
  siteLogoUrl?: string;
  headline: string;
  description: string;
  userLabel?: string;
  totalLabel?: string;
  limitLabel?: string;
  purchaseCountLabel?: string;
  recentPurchaseLabel?: string;
  helperText?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  message?: string | null;
  messageTone?: 'neutral' | 'error';
  isTestMode?: boolean;
}

export interface TabNavProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  onCloseChat?: () => void;
  myTabCard?: MyTabCardData;
  onOpenMyTab?: () => void;
  onOpenMyRecipes?: () => void;
  isMyTabLoading?: boolean;
  myRecipesCount?: number;
}

/**
 * TabNav — top-level navigation surface.
 *
 * Thin orchestrator that owns the menu-open state and composes:
 *   • AppHeader — floating header row (logo + icon buttons)
 *   • AppMenu   — left-anchored navigation sheet (My Tab + menu list)
 *
 * All visual decisions live in the design tokens and primitives.
 */
export function TabNav({
  activeTab,
  onTabChange,
  onCloseChat,
  myTabCard,
  onOpenMyTab,
  onOpenMyRecipes,
  isMyTabLoading = false,
  myRecipesCount = 0,
}: TabNavProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <AppHeader
        activeTab={activeTab}
        onOpenMenu={() => setIsMenuOpen(true)}
        onTabChange={onTabChange}
      />
      <AppMenu
        open={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onCloseChat={onCloseChat}
        onOpenMyTab={onOpenMyTab}
        onOpenMyRecipes={onOpenMyRecipes}
        myTabCard={myTabCard}
        isMyTabLoading={isMyTabLoading}
        myRecipesCount={myRecipesCount}
      />
    </>
  );
}

export default TabNav;
