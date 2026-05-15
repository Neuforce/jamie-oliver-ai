import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { RecipeAccessResponse } from '../lib/api';
import {
  hasSupertabConfig,
  mountRecipePurchaseButton,
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
      setIsMounting(false);
      mountedRef.current = null;
      return;
    }

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
    <div className="space-y-3">
      <div className="rounded-[28px] border border-[#E8DDF8] bg-[#FAF7FF] p-4 shadow-[0_12px_30px_rgba(120,84,196,0.10)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7C5AC3]">
              My Tab
            </p>
            <p className="mt-1 text-sm font-medium text-[#3A2A58]">
              Unlock this recipe with Supertab
            </p>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7C5AC3]">
            Powered by Supertab
          </div>
        </div>

        <div className="mt-4 rounded-[22px] bg-white p-3">
          <div ref={containerRef} />
          {isMounting && (
            <p className="text-sm text-[#6B5F81]">
              Loading Supertab purchase options...
            </p>
          )}
        </div>
      </div>

      {statusMessage && (
        <p className="text-center text-sm text-[#6B5F81]">
          {statusMessage}
        </p>
      )}
    </div>
  );
});
SupertabPurchaseButton.displayName = 'SupertabPurchaseButton';
