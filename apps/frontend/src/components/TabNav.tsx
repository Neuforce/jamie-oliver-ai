import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, BookOpen, X, Menu } from 'lucide-react';
// @ts-expect-error - Vite resolves figma:asset imports
import logoImage from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';

export type TabView = 'chat' | 'recipes';

interface TabNavProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  onCloseChat?: () => void; // Function for closing chat/clearing storage
}

/**
 * TabNav - Compact header navigation with icon-only tabs
 *
 * Layout when in recipes: [X (Close)] - [Logo (Non-clickable)] - [Chat Icon]
 * Layout when in chat: [X (Close)] - [Logo (Non-clickable)] - [Recipes Icon]
 * Logo is always non-clickable (decorative only)
 */
export function TabNav({ activeTab, onTabChange, onCloseChat }: TabNavProps) {
  const isChatView = activeTab === 'chat';
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header
      className="bg-white w-full"
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '12px 16px',
      }}
    >
      <div className="flex items-center justify-between">
        {/* Left Button - Menu (Hamburger) */}
        <IconTabButton
          isActive={false}
          onClick={() => setIsMenuOpen(true)}
          icon={<Menu className="w-5 h-5" />}
          label="Open menu"
        />

        {/* Logo - Center (Always non-clickable, decorative only) */}
        <div className="flex-1 flex justify-center">
          <img
            src={logoImage}
            alt="Jamie Oliver"
            className="h-6 w-auto object-contain pointer-events-none"
            style={{ maxWidth: '165px' }}
          />
        </div>

        {/* Right Button - Recipes when in chat, Chat when in recipes */}
        {isChatView ? (
          <IconTabButton
            isActive={false}
            onClick={() => onTabChange('recipes')}
            icon={<BookOpen className="w-5 h-5" />}
            label="Recipes"
          />
        ) : (
          <IconTabButton
            isActive={false}
            onClick={() => onTabChange('chat')}
            icon={<MessageCircle className="w-5 h-5" />}
            label="Chat"
          />
        )}
      </div>

      {isMenuOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label="Close menu"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[280px] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <span
                className="text-base font-semibold text-[var(--jamie-text-heading)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Menu
              </span>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-full p-2 hover:bg-black/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 flex flex-col items-stretch gap-2 text-left">
              {isChatView ? (
                <MenuItem
                  label="Recipes"
                  onClick={() => {
                    onTabChange('recipes');
                    setIsMenuOpen(false);
                  }}
                />
              ) : (
                <MenuItem
                  label="Chat"
                  onClick={() => {
                    onTabChange('chat');
                    setIsMenuOpen(false);
                  }}
                />
              )}
              {onCloseChat && isChatView && (
                <MenuItem
                  label="Reset chat"
                  onClick={() => {
                    onCloseChat();
                    setIsMenuOpen(false);
                  }}
                />
              )}
            </div>
            <div
              className="mt-auto px-4 py-4 text-sm text-[#9CA3AF]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              More options coming soon.
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

interface IconTabButtonProps {
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function IconTabButton({ isActive, onClick, icon, label }: IconTabButtonProps) {
  return (
    <motion.button
      role="tab"
      aria-selected={isActive}
      aria-label={label}
      onClick={onClick}
      className="flex items-center justify-center rounded-full transition-all"
      style={{
        width: '44px',
        height: '44px',
        backgroundColor: isActive ? '#29514F' : '#FFFFFF',
        border: isActive ? 'none' : '1px solid rgba(0, 0, 0, 0.1)',
        boxShadow: isActive
          ? '0 2px 8px rgba(41, 81, 79, 0.3)'
          : '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}
      whileTap={{ scale: 0.95 }}
      whileHover={{
        backgroundColor: isActive ? '#1f423f' : 'rgba(0, 0, 0, 0.04)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
      }}
    >
      <span style={{ color: isActive ? '#FFFFFF' : 'var(--jamie-text-heading)' }}>
        {icon}
      </span>
    </motion.button>
  );
}

interface MenuItemProps {
  label: string;
  onClick: () => void;
}

function MenuItem({ label, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-start text-left rounded-lg px-3 py-2 text-sm text-[var(--jamie-text-primary)] hover:bg-black/5 transition-colors"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {label}
    </button>
  );
}

export default TabNav;
