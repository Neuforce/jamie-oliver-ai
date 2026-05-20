import React from 'react';
import { BookOpen, Menu, MessageCircle } from 'lucide-react';
// @ts-expect-error - Vite resolves figma:asset imports
import logoImage from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';
import { IconButton } from '../design-system/primitives';
import type { TabView } from './TabNav';

export interface AppHeaderProps {
  activeTab: TabView;
  onOpenMenu: () => void;
  onTabChange: (tab: TabView) => void;
  /** E.g. reset chat / home — client ask (NEU-621). */
  onLogoClick?: () => void;
}

/**
 * AppHeader — minimal floating navigation.
 *
 * Renders a row of floating IconButtons and the Jamie wordmark, with no
 * container surface. Background is fully transparent so the page surface
 * reads through. Matches the `ui-1` spec and honours the shell width tokens.
 */
export function AppHeader({ activeTab, onOpenMenu, onTabChange, onLogoClick }: AppHeaderProps) {
  const isChatView = activeTab === 'chat';

  return (
    <div className="jamie-app-header">
      <div className="jamie-shell-width jamie-app-header__row">
        <IconButton
          label="Open menu"
          icon={<Menu className="w-5 h-5" />}
          onClick={onOpenMenu}
          size="md"
        />

        {onLogoClick ? (
          <button type="button" className="jamie-app-header__logo-hit" onClick={onLogoClick} aria-label="Back to start">
            <img
              src={logoImage}
              alt="Jamie Oliver"
              className="jamie-app-header__logo"
              draggable={false}
            />
          </button>
        ) : (
          <img
            src={logoImage}
            alt="Jamie Oliver"
            className="jamie-app-header__logo"
            draggable={false}
          />
        )}

        {isChatView ? (
          <IconButton
            label="Recipes"
            icon={<BookOpen className="w-5 h-5" />}
            onClick={() => onTabChange('recipes')}
            size="md"
          />
        ) : (
          <IconButton
            label="Chat"
            icon={<MessageCircle className="w-5 h-5" />}
            onClick={() => onTabChange('chat')}
            size="md"
          />
        )}
      </div>
    </div>
  );
}

export default AppHeader;
