import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export type SheetPlacement = 'left' | 'center';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  placement?: SheetPlacement;
  /** aria-labelledby target — optional title shown in the header. */
  title?: React.ReactNode;
  /** Hide the built-in header (titlebar + close button). */
  hideHeader?: boolean;
  /** aria-label for the panel when there is no visible title. */
  ariaLabel?: string;
  children: React.ReactNode;
  /** Optional footer region rendered below the scrollable body. */
  footer?: React.ReactNode;
  /** Allow callers to override the default max-width. */
  width?: number | string;
}

const DEFAULT_WIDTHS: Record<SheetPlacement, string> = {
  left: 'min(420px, calc(100vw - 48px))',
  center: 'min(520px, calc(100vw - 32px))',
};

/**
 * Accessible overlay sheet.
 *
 * - Portals into `document.body` so we never fight with parent stacking contexts.
 * - Dims the page with an opaque scrim; the panel itself is a solid white surface.
 * - Escape-to-close, scrim-to-close, focus restore.
 * - Locks body scroll while open.
 */
export function Sheet({
  open,
  onClose,
  placement = 'left',
  title,
  hideHeader = false,
  ariaLabel,
  children,
  footer,
  width,
}: SheetProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`jamie-sheet-title-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);

    const focusTarget = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusTarget?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
      previousFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;
  if (!open) return null;

  const panelStyle: React.CSSProperties = {};
  if (width !== undefined) {
    panelStyle.width = typeof width === 'number' ? `${width}px` : width;
  } else {
    panelStyle.width = DEFAULT_WIDTHS[placement];
  }

  return createPortal(
    <div className="jamie-sheet-root" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="jamie-sheet-scrim"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        style={{ appearance: 'none', border: 0, padding: 0, cursor: 'default' }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId.current : undefined}
        aria-label={title ? undefined : ariaLabel}
        className={`jamie-sheet-panel jamie-sheet-panel--${placement}`}
        style={panelStyle}
      >
        {!hideHeader && (
          <header className="jamie-sheet-header">
            {title ? (
              <h2 id={titleId.current} className="jamie-sheet-title">
                {title}
              </h2>
            ) : (
              <span />
            )}
            <IconButton
              label="Close"
              icon={<X className="w-5 h-5" />}
              size="md"
              variant="ghost"
              onClick={onClose}
            />
          </header>
        )}
        <div className="jamie-sheet-body">{children}</div>
        {footer}
      </div>
    </div>,
    document.body
  );
}
