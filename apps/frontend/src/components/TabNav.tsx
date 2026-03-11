import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, BookOpen, X, Menu, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
// @ts-expect-error - Vite resolves figma:asset imports
import logoImage from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';

export type TabView = 'chat' | 'recipes';
export type MyTabCardStatus = 'unavailable' | 'signed_out' | 'signed_in';

export interface MyTabCardData {
  status: MyTabCardStatus;
  title: string;
  headline: string;
  description: string;
  userLabel?: string;
  totalLabel?: string;
  limitLabel?: string;
  purchaseCountLabel?: string;
  recentPurchaseLabel?: string;
  helperText?: string;
  actionLabel?: string;
  message?: string | null;
  messageTone?: 'neutral' | 'error';
  isTestMode?: boolean;
}

interface TabNavProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  onCloseChat?: () => void; // Function for closing chat/clearing storage
  myTabCard?: MyTabCardData;
  onOpenMyTab?: () => void;
  isMyTabLoading?: boolean;
}

/**
 * TabNav - Compact header navigation with icon-only tabs
 *
 * Layout when in recipes: [X (Close)] - [Logo (Non-clickable)] - [Chat Icon]
 * Layout when in chat: [X (Close)] - [Logo (Non-clickable)] - [Recipes Icon]
 * Logo is always non-clickable (decorative only)
 */
export function TabNav({
  activeTab,
  onTabChange,
  onCloseChat,
  myTabCard,
  onOpenMyTab,
  isMyTabLoading = false,
}: TabNavProps) {
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
              {myTabCard && onOpenMyTab && (
                <MyTabCard
                  card={myTabCard}
                  isLoading={isMyTabLoading}
                  onAction={() => {
                    onOpenMyTab();
                  }}
                />
              )}
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

interface MyTabCardProps {
  card: MyTabCardData;
  isLoading: boolean;
  onAction: () => void;
}

function MyTabCard({ card, isLoading, onAction }: MyTabCardProps) {
  const badgeLabel = isLoading
    ? 'Syncing'
    : card.status === 'signed_in'
      ? 'Connected'
      : card.status === 'unavailable'
        ? 'Unavailable'
        : 'My Tab';
  const CircleIcon = card.messageTone === 'error'
    ? AlertCircle
    : card.status === 'signed_in'
      ? CheckCircle2
      : CreditCard;
  const circleValue = card.status === 'signed_in' ? (card.totalLabel ?? 'My Tab') : badgeLabel;

  return (
    <div
      className="rounded-[28px] border border-[#E7DDF8] bg-[linear-gradient(180deg,#F7F2FF_0%,#FBF9FF_100%)] px-4 py-4 shadow-[0_16px_40px_rgba(112,76,188,0.10)]"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7C5AC3]">
              {card.title}
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7C5AC3]">
              Powered by Supertab
            </span>
            {card.isTestMode && (
              <span className="rounded-full bg-[#EEE7FF] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6E48BC]">
                Test
              </span>
            )}
          </div>
          <div className="mt-2 text-base font-semibold text-[#2E2147]">
            {isLoading ? 'Loading My Tab...' : card.headline}
          </div>
          <div className="mt-1 text-sm leading-5 text-[#5B4D75]">
            {card.description}
          </div>
        </div>
        <div className="shrink-0">
          <div className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full border border-[#DCCEFF] bg-white text-center shadow-[0_8px_24px_rgba(124,90,195,0.12)]">
            <CircleIcon className="mb-1 h-4 w-4 text-[#7C5AC3]" />
            <div className="px-2 text-[11px] font-semibold leading-4 text-[#2E2147]">
              {circleValue}
            </div>
          </div>
        </div>
      </div>

      {(card.userLabel || card.purchaseCountLabel || card.limitLabel) && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {card.userLabel && (
            <StatTile label="Account" value={card.userLabel} />
          )}
          {card.purchaseCountLabel && (
            <StatTile label="Recipes" value={card.purchaseCountLabel} />
          )}
          {card.limitLabel && (
            <StatTile label="Limit" value={card.limitLabel} />
          )}
          {card.recentPurchaseLabel && (
            <StatTile label="Latest" value={card.recentPurchaseLabel} />
          )}
        </div>
      )}

      {card.helperText && (
        <div className="mt-3 text-xs leading-5 text-[#6B5F81]">
          {card.helperText}
        </div>
      )}

      {card.message && (
        <div
          className={`mt-3 rounded-2xl px-3 py-2 text-xs leading-5 ${
            card.messageTone === 'error'
              ? 'bg-[#FDECEC] text-[#9F3A38]'
              : 'bg-white text-[#6B5F81]'
          }`}
        >
          {card.message}
        </div>
      )}

      {card.actionLabel && (
        <button
          type="button"
          onClick={onAction}
          disabled={isLoading}
          className="mt-4 w-full rounded-full px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70"
          style={{
            backgroundColor: '#7C5AC3',
          }}
        >
          {isLoading ? 'Refreshing My Tab...' : card.actionLabel}
        </button>
      )}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2 shadow-[0_6px_18px_rgba(124,90,195,0.05)]">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#A18BCF]">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-[#2E2147]">
        {value}
      </div>
    </div>
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
  meta?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

function MenuItem({ label, meta, icon, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between text-left rounded-lg px-3 py-2 text-sm text-[var(--jamie-text-primary)] hover:bg-black/5 transition-colors"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span>{label}</span>
      </span>
      {meta && (
        <span className="ml-3 shrink-0 text-xs text-[#9CA3AF]">
          {meta}
        </span>
      )}
    </button>
  );
}

export default TabNav;
