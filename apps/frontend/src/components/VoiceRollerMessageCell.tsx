import React, { memo, type ReactNode } from 'react';
import type { RollerRenderContext } from './VoiceModeRoller';

export type VoiceRollerMessageSnapshot = Readonly<{
  id: string;
  type: 'user' | 'jamie';
  content: string;
  isStreaming?: boolean;
  recipes?: unknown;
  mealPlan?: unknown;
  shoppingList?: unknown;
  recipeDetail?: unknown;
  process?: unknown;
}>;

interface VoiceRollerMessageCellProps {
  message: VoiceRollerMessageSnapshot;
  voiceContext: RollerRenderContext;
  renderContent: (
    message: VoiceRollerMessageSnapshot,
    voiceContext: RollerRenderContext,
  ) => ReactNode;
}

function messageSnapshotEqual(
  a: VoiceRollerMessageSnapshot,
  b: VoiceRollerMessageSnapshot,
): boolean {
  return (
    a.id === b.id
    && a.type === b.type
    && a.content === b.content
    && a.isStreaming === b.isStreaming
    && a.recipes === b.recipes
    && a.mealPlan === b.mealPlan
    && a.shoppingList === b.shoppingList
    && a.recipeDetail === b.recipeDetail
    && a.process === b.process
  );
}

function contextEqual(a: RollerRenderContext, b: RollerRenderContext): boolean {
  return a.role === b.role && a.expended === b.expanded;
}

export const VoiceRollerMessageCell = memo(function VoiceRollerMessageCell({
  message,
  voiceContext,
  renderContent,
}: VoiceRollerMessageCellProps) {
  return renderContent(message, voiceContext);
}, (prev, next) => {
  return (
    messageSnapshotEqual(prev.message, next.message)
    && contextEqual(prev.voiceContext, next.voiceContext)
    && prev.renderContent === next.renderContent
  );
});
