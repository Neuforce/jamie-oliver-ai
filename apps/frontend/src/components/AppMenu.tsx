import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Library,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
import { MenuList, type MenuListItem, Sheet } from '../design-system/primitives';
import type { MyTabCardData, TabView } from './TabNav';

export interface AppMenuProps {
  open: boolean;
  onClose: () => void;
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  onCloseChat?: () => void;
  onOpenMyTab?: () => void;
  onOpenMyRecipes?: () => void;
  myTabCard?: MyTabCardData;
  isMyTabLoading?: boolean;
  myRecipesCount?: number;
}

/**
 * AppMenu — canonical navigation sheet.
 *
 * Composes primitives (`Sheet`, `MenuList`) and one domain card (`MyTabCard`).
 * Visual spec driven by `jamie-ui-components/ui-1` and the `--jamie-*` tokens.
 */
export function AppMenu({
  open,
  onClose,
  activeTab,
  onTabChange,
  onCloseChat,
  onOpenMyTab,
  onOpenMyRecipes,
  myTabCard,
  isMyTabLoading = false,
  myRecipesCount = 0,
}: AppMenuProps) {
  const isChatView = activeTab === 'chat';

  const close = () => onClose();

  const items: MenuListItem[] = [
    {
      id: 'my-recipes',
      label: 'My Recipes',
      icon: <Library className="w-4 h-4" />,
      meta: myRecipesCount > 0 ? myRecipesCount : undefined,
      onSelect: () => {
        onOpenMyRecipes?.();
        close();
      },
    },
    isChatView
      ? {
          id: 'recipes',
          label: 'Recipes',
          icon: <BookOpen className="w-4 h-4" />,
          onSelect: () => {
            onTabChange('recipes');
            close();
          },
        }
      : {
          id: 'chat',
          label: 'Chat',
          icon: <MessageCircle className="w-4 h-4" />,
          onSelect: () => {
            onTabChange('chat');
            close();
          },
        },
  ];

  if (onCloseChat && isChatView) {
    items.push({
      id: 'reset-chat',
      label: 'Reset chat',
      icon: <RotateCcw className="w-4 h-4" />,
      onSelect: () => {
        onCloseChat();
        close();
      },
    });
  }

  return (
    <Sheet open={open} onClose={onClose} placement="left" title="Menu">
      {myTabCard && onOpenMyTab && (
        <MyTabCard
          card={myTabCard}
          isLoading={isMyTabLoading}
          onPrimaryAction={() => {
            if (myTabCard.status === 'signed_in') {
              if (!onOpenMyRecipes) return;
              onOpenMyRecipes();
            } else {
              onTabChange('recipes');
            }
            close();
          }}
          onSecondaryAction={() => {
            onOpenMyTab();
            close();
          }}
        />
      )}

      <MenuList items={items} />
    </Sheet>
  );
}

interface MyTabCardProps {
  card: MyTabCardData;
  isLoading: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
}

function MyTabCard({ card, isLoading, onPrimaryAction, onSecondaryAction }: MyTabCardProps) {
  const CircleIcon =
    card.messageTone === 'error'
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

  const hasSiteLogo = typeof card.siteLogoUrl === 'string' && card.siteLogoUrl.length > 0;
  const balanceSummary =
    card.totalLabel && card.limitLabel
      ? `${card.totalLabel} of ${card.limitLabel}`
      : card.totalLabel || card.limitLabel || undefined;

  return (
    <section className="jamie-mytab-card" aria-label={card.title}>
      <header className="jamie-mytab-card__header">
        <div className="jamie-mytab-card__identity">
          <span className="jamie-mytab-card__badge">
            <CreditCard className="w-5 h-5" />
          </span>
          <div className="jamie-mytab-card__title-wrap">
            <h3 className="jamie-mytab-card__title">{card.title}</h3>
            {card.isTestMode && <span className="jamie-mytab-card__test-chip">Test</span>}
          </div>
        </div>
        <div className="jamie-mytab-card__status">
          <CircleIcon className="w-3.5 h-3.5" />
          <span>{statusLabel}</span>
        </div>
      </header>

      <div className="jamie-mytab-card__body">
        <p className="jamie-mytab-card__headline">
          {isLoading ? 'Loading My Tab…' : card.headline}
        </p>

        {(card.siteName || card.userLabel) && (
          <div className="jamie-mytab-card__meta">
            {hasSiteLogo && (
              <span className="jamie-mytab-card__site-logo">
                <img src={card.siteLogoUrl} alt={card.siteName || 'Supertab'} />
              </span>
            )}
            {card.siteName && <span className="jamie-mytab-card__meta-item">{card.siteName}</span>}
            {card.siteName && card.userLabel && (
              <span className="jamie-mytab-card__meta-dot">•</span>
            )}
            {card.userLabel && (
              <span className="jamie-mytab-card__meta-item">{card.userLabel}</span>
            )}
          </div>
        )}

        <p className="jamie-mytab-card__description">{card.description}</p>
      </div>

      {card.status === 'signed_in' && (card.purchaseCountLabel || balanceSummary) && (
        <dl className="jamie-mytab-card__metrics">
          {card.purchaseCountLabel && (
            <MetricTile label="Recipes owned" value={card.purchaseCountLabel} />
          )}
          {balanceSummary && <MetricTile label="Tab balance" value={balanceSummary} />}
        </dl>
      )}

      {card.message && (
        <p
          className={`jamie-mytab-card__message ${
            card.messageTone === 'error' ? 'is-error' : ''
          }`}
        >
          {card.message}
        </p>
      )}

      {(card.primaryActionLabel || card.secondaryActionLabel) && (
        <div className="jamie-mytab-card__actions">
          {card.primaryActionLabel && (
            <button
              type="button"
              className="jamie-pill-button jamie-pill-button--primary"
              style={{ width: '100%' }}
              onClick={onPrimaryAction}
              disabled={isLoading}
            >
              {card.primaryActionLabel}
            </button>
          )}
          {card.secondaryActionLabel && (
            <button
              type="button"
              className="jamie-mytab-card__secondary"
              onClick={onSecondaryAction}
              disabled={isLoading}
            >
              {isLoading ? 'Refreshing…' : card.secondaryActionLabel}
            </button>
          )}
        </div>
      )}

      {card.helperText && <p className="jamie-mytab-card__helper">{card.helperText}</p>}
    </section>
  );
}

interface MetricTileProps {
  label: string;
  value: string;
}

function MetricTile({ label, value }: MetricTileProps) {
  return (
    <div className="jamie-mytab-card__metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default AppMenu;
