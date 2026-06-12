import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { RecipeAccessResponse } from '../lib/api';
import {
  canEmbedRecipePurchaseButton,
  hasSupertabConfig,
  mountRecipePurchaseButton,
  purchaseRecipe,
  type MountedRecipePurchaseButton,
  type RecipePurchaseResolution,
} from '../lib/supertab';

export type SupertabPurchaseButtonHandle = {
  /** Same as tapping the in-panel widget: opens Supertab checkout without a second mount. */
  openPurchaseExperience: () => Promise<void>;
};

interface SupertabPurchaseButtonProps {
  access: RecipeAccessResponse;
  onResolved?: (resolution: RecipePurchaseResolution) => void;
}

export const SupertabPurchaseButton = forwardRef<
  SupertabPurchaseButtonHandle,
  SupertabPurchaseButtonProps
>(function SupertabPurchaseButton({ access, onResolved }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef<MountedRecipePurchaseButton | null>(null);
  const onResolvedRef = useRef<typeof onResolved>(onResolved);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isMounting, setIsMounting] = useState(true);
  const [embedUnavailable, setEmbedUnavailable] = useState(false);
  const [isLaunchingPaywall, setIsLaunchingPaywall] = useState(false);

  const handlePaywallFallback = async () => {
    setIsLaunchingPaywall(true);
    setStatusMessage(null);
    try {
      const outcome = await purchaseRecipe(access);
      if (outcome.resolution) {
        onResolvedRef.current?.(outcome.resolution);
        return;
      }
      if (outcome.via === 'unavailable') {
        setStatusMessage('Supertab checkout is not configured for this recipe.');
      } else if (outcome.via === 'abandoned') {
        setStatusMessage('Checkout closed before the recipe was unlocked.');
      }
    } catch (error) {
      console.error('Supertab paywall fallback failed:', error);
      setStatusMessage('We could not open My Tab checkout right now.');
    } finally {
      setIsLaunchingPaywall(false);
    }
  };

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useImperativeHandle(ref, () => ({
    openPurchaseExperience: async () => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const mounted = mountedRef.current;
        if (mounted) {
          await mounted.openPurchaseExperience();
          return;
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      console.warn('[SupertabPurchaseButton] SDK not ready for programmatic open');
    },
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let isCancelled = false;
    let destroy = () => undefined;

    if (!hasSupertabConfig()) {
      setStatusMessage('Add your Supertab client ID to load the official purchase button.');
      setEmbedUnavailable(true);
      setIsMounting(false);
      mountedRef.current = null;
      return;
    }

    if (!canEmbedRecipePurchaseButton(access)) {
      setStatusMessage('Use My Tab checkout below to unlock this recipe.');
      setEmbedUnavailable(true);
      setIsMounting(false);
      mountedRef.current = null;
      return;
    }

    setEmbedUnavailable(false);

    setStatusMessage(null);
    setIsMounting(true);
    container.replaceChildren();
    mountedRef.current = null;

    void mountRecipePurchaseButton({
      containerElement: container,
      access,
      onResolved: (resolution) => {
        if (isCancelled) {
          return;
        }

        const hasPurchase = resolution.state.purchase?.status === 'completed';
        const hasPriorEntitlement = resolution.priorEntitlements.length > 0;

        if (hasPurchase) {
          setStatusMessage('Purchase completed. Jamie is refreshing your access now.');
        } else if (hasPriorEntitlement) {
          setStatusMessage('This recipe is already available in your My Tab account.');
        } else if (resolution.snapshot.status === 'signed_in') {
          setStatusMessage('My Tab is connected. Complete the Supertab flow above to unlock this recipe.');
        } else {
          setStatusMessage(null);
        }

        onResolvedRef.current?.(resolution);
      },
      onError: (message) => {
        if (!isCancelled) {
          setStatusMessage(message);
          setEmbedUnavailable(true);
        }
      },
    }).then((result) => {
      if (isCancelled) {
        result.destroy();
        container.replaceChildren();
        mountedRef.current = null;
        return;
      }

      mountedRef.current = result;
      destroy = () => {
        mountedRef.current = null;
        result.destroy();
      };
      setIsMounting(false);
    }).catch((error) => {
      console.error('Failed to mount Supertab purchase button:', error);
      if (!isCancelled) {
        setStatusMessage('We could not load the Supertab purchase button right now.');
        setEmbedUnavailable(true);
        setIsMounting(false);
        mountedRef.current = null;
      }
    });

    return () => {
      isCancelled = true;
      mountedRef.current = null;
      destroy();
      container.replaceChildren();
    };
  }, [access.recipeId, access.offering?.contentKey, access.offering?.supertabExperienceId]);

  return (
    <div className="jamie-recipe-modal__unlock-pane space-y-3">
      <p className="text-sm text-[#5C5C5C] leading-relaxed">
        Unlock this recipe to cook with Jamie step by step.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {!embedUnavailable && (
          <div
            ref={containerRef}
            className="min-h-[44px] flex-1"
            data-jamie-supertab-purchase-host=""
          />
        )}
        {isMounting && !embedUnavailable && (
          <p className="text-sm text-[#6B5F81]">Loading checkout…</p>
        )}
        {embedUnavailable && (
          <button
            type="button"
            className="jamie-recipe-modal__header-pill"
            disabled={isLaunchingPaywall}
            onClick={() => void handlePaywallFallback()}
          >
            {isLaunchingPaywall ? 'Opening…' : 'Unlock this recipe'}
          </button>
        )}
      </div>

      {statusMessage && (
        <p className="text-sm text-[#6B5F81]">{statusMessage}</p>
      )}

      <p className="text-xs text-[#9A9A9A]">Secured by Supertab</p>
    </div>
  );
});
SupertabPurchaseButton.displayName = 'SupertabPurchaseButton';
