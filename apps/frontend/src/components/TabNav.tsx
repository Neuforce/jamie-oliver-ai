import React from 'react';
import { motion } from 'motion/react';
import { MessageCircle, BookOpen } from 'lucide-react';
// @ts-expect-error - Vite resolves figma:asset imports
import logoImage from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';

export type TabView = 'chat' | 'recipes';

interface TabNavProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  onLogoClick?: () => void;
}

/**
 * TabNav - Compact header navigation with icon-only tabs
 * 
 * Layout: [Recipes Icon] - [Logo (Home)] - [Chat Icon]
 * Logo click = Return to home (Chat with fresh state)
 */
export function TabNav({ activeTab, onTabChange, onLogoClick }: TabNavProps) {
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
        {/* Recipes Icon Button - Left */}
        <IconTabButton
          isActive={activeTab === 'recipes'}
          onClick={() => onTabChange('recipes')}
          icon={<BookOpen className="w-5 h-5" />}
          label="Recipes"
        />

        {/* Logo - Center (Clickable = Home) */}
        <motion.button
          onClick={onLogoClick}
          className="flex-1 flex justify-center cursor-pointer"
          whileTap={{ scale: 0.97 }}
          whileHover={{ opacity: 0.8 }}
          aria-label="Return to home"
          title="Return to home"
        >
          <img
            src={logoImage}
            alt="Jamie Oliver - Home"
            className="h-6 w-auto object-contain pointer-events-none"
            style={{ maxWidth: '172px' }}
          />
        </motion.button>

        {/* Chat Icon Button - Right */}
        <IconTabButton
          isActive={activeTab === 'chat'}
          onClick={() => onTabChange('chat')}
          icon={<MessageCircle className="w-5 h-5" />}
          label="Chat"
        />
      </div>
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

export default TabNav;
