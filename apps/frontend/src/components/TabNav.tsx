import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, BookOpen, X, Menu, CreditCard, CheckCircle2, AlertCircle, Library } from 'lucide-react';
// @ts-expect-error - Vite resolves figma:asset imports
import logoImage from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';

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

interface TabNavProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  onCloseChat?: () => void; // Function for closing chat/clearing storage
  myTabCard?: MyTabCardData;
  onOpenMyTab?: () => void;
  onOpenMyRecipes?: () => void;
  isMyTabLoading?: boolean;
  myRecipesCount?: number;
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
  onOpenMyRecipes,
  isMyTabLoading = false,
  myRecipesCount = 0,
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
                  onPrimaryAction={() => {
                    if (!onOpenMyRecipes) {
                      return;
                    }
                    onOpenMyRecipes();
                    setIsMenuOpen(false);
                  }}
                  onSecondaryAction={() => {
                    onOpenMyTab();
                    setIsMenuOpen(false);
                  }}
                />
              )}
              <MenuItem
                label="My Recipes"
                meta={myRecipesCount > 0 ? `${myRecipesCount}` : undefined}
                icon={<Library className="size-4" />}
                onClick={() => {
                  onOpenMyRecipes?.();
                  setIsMenuOpen(false);
                }}
              />
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
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
}

function MyTabCard({ card, isLoading, onPrimaryAction, onSecondaryAction }: MyTabCardProps) {
  const CircleIcon = card.messageTone === 'error'
    ? AlertCircle
    : card.status === 'signed_in'
      ? CheckCircle2
      : CreditCard;
  const statusLabel = isLoading
    ? 'Syncing'
    : card.status === 'signed_in'
      ? 'Connected'
      : card.status === 'unavailable'
        ? 'Unavailable'
        : 'Not active';
  const circleValue = card.status === 'signed_in'
    ? (card.totalLabel ?? 'My Tab')
    : card.status === 'signed_out'
      ? 'Start'
      : 'My Tab';
  const compactDescription = card.status === 'signed_in'
    ? card.description
    : 'Unlock your first recipe with Supertab and your My Tab account will appear here.';

  return (
    <div
      className="overflow-hidden rounded-[24px] border border-[#EDE7DE] bg-[#FFFDF9] shadow-[0_14px_30px_rgba(17,24,39,0.06)]"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      <div className="h-1.5 bg-[linear-gradient(90deg,#F6A37F_0%,#D77A5F_55%,#C96A50_100%)]" />

      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#D77A5F] text-white shadow-[0_10px_20px_rgba(215,122,95,0.28)]">
                <TabGlyph />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-[#111827]">
                    {card.title}
                  </span>
                  <span className="rounded-full bg-[#F6F2EA] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#111827]">
                    Powered by Supertab
                  </span>
                  {card.isTestMode && (
                    <span className="rounded-full bg-[#FFF1E6] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C2410C]">
                      Test
                    </span>
                  )}
                </div>
                {card.siteName && (
                  <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#8C7E69]">
                    {card.siteLogoUrl ? (
                      <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[#EEE4D8] bg-white">
                        <img
                          src={card.siteLogoUrl}
                          alt={card.siteName || 'Supertab site'}
                          className="h-3.5 w-3.5 object-contain"
                        />
                      </div>
                    ) : null}
                    <span className="truncate">{card.siteName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-[#EEE4D8] bg-white px-3 py-2 shadow-[0_6px_14px_rgba(17,24,39,0.05)]">
            <div className="flex items-center gap-2">
              <CircleIcon className="h-3.5 w-3.5 text-[#111827]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8C7E69]">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-semibold leading-none text-[#111827]">
              {isLoading ? 'Loading My Tab...' : card.headline}
            </div>
            <div className="mt-2 max-w-[190px] text-[13px] leading-5 text-[#4B5563]">
              {compactDescription}
            </div>
          </div>
          <div className="shrink-0">
            <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-[22px] border border-[#E6DDD0] bg-white text-center shadow-[0_8px_18px_rgba(17,24,39,0.06)]">
              <div className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#F9E7E1] text-[#C96A50]">
                <TabGlyph compact />
              </div>
              <div className="px-2 text-[12px] font-semibold leading-4 text-[#111827]">
                {circleValue}
              </div>
            </div>
          </div>
        </div>

        {(card.userLabel || card.purchaseCountLabel || card.limitLabel) && (
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 rounded-[20px] border border-[#EFE7DB] bg-[#FFFFFF] px-3 py-3">
            {card.userLabel && (
              <StatLine label="Account" value={card.userLabel} />
            )}
            {card.purchaseCountLabel && (
              <StatLine label="Recipes" value={card.purchaseCountLabel} />
            )}
            {card.limitLabel && (
              <StatLine label="Limit" value={card.limitLabel} />
            )}
            {card.recentPurchaseLabel && (
              <StatLine label="Latest" value={card.recentPurchaseLabel} />
            )}
          </div>
        )}

        {card.helperText && (
          <div className="mt-3 text-[11px] leading-5 text-[#7A746A]">
            {card.helperText}
          </div>
        )}

        {card.message && (
          <div
            className={`mt-3 rounded-2xl px-3 py-2 text-xs leading-5 ${
              card.messageTone === 'error'
                ? 'bg-[#FDECEC] text-[#9F3A38]'
                : 'bg-[#F7F3EC] text-[#6B7280]'
            }`}
          >
            {card.message}
          </div>
        )}

        {(card.primaryActionLabel || card.secondaryActionLabel) && (
          <div className="mt-4 space-y-2">
            {card.primaryActionLabel && (
              <button
                type="button"
                onClick={onPrimaryAction}
                disabled={isLoading}
                className="w-full rounded-full px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                style={{
                  backgroundColor: '#D77A5F',
                }}
              >
                {card.primaryActionLabel}
              </button>
            )}
            {card.secondaryActionLabel && (
              <button
                type="button"
                onClick={onSecondaryAction}
                disabled={isLoading}
                className="w-full rounded-full border border-[#E6DDD0] bg-white px-4 py-3 text-sm font-semibold text-[#111827] transition-colors disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? 'Refreshing My Tab...' : card.secondaryActionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabGlyph({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative ${compact ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'}`}>
      <div className="absolute inset-0 rounded-[4px] border-2 border-current opacity-90" />
      <div className="absolute left-[18%] right-[18%] top-[18%] h-[24%] rounded-[3px] bg-current" />
      <div className="absolute bottom-[18%] left-[18%] right-[18%] top-[48%] rounded-[3px] border border-current opacity-80" />
    </div>
  );
}

interface StatLineProps {
  label: string;
  value: string;
}

function StatLine({ label, value }: StatLineProps) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#A08D72]">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-[#111827]">
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
