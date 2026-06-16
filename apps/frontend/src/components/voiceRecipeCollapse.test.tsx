// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceRichCardPreview } from './VoiceRichCardPreview';
import type { VoiceRichCardPreviewData } from '../lib/voiceRichCard';

const recipePreview: VoiceRichCardPreviewData = {
  kind: 'recipes',
  title: 'Black Forest Trifle',
  emoji: '🥘',
  chips: ['£2.99', '45 mins', 'Hard'],
  imageUrl: '/trifle.jpg',
  subtitle: 'Dessert',
};

describe('voice recipe collapse preview', () => {
  it('renders compact recipe preview with thumbnail, title, and commerce chip', () => {
    const html = renderToStaticMarkup(
      <VoiceRichCardPreview preview={recipePreview} interactive={false} />,
    );

    expect(html).toContain('voice-rich-preview');
    expect(html).toContain('Black Forest Trifle');
    expect(html).toContain('voice-rich-preview__thumb');
    expect(html).toContain('/trifle.jpg');
    expect(html).toContain('£2.99');
    expect(html).not.toContain('process-card__featured');
  });

  it('calls onExpand when the compact preview is tapped', () => {
    let expanded = false;
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <VoiceRichCardPreview
          preview={recipePreview}
          onExpand={() => {
            expanded = true;
          }}
          interactive
        />,
      );
    });

    const button = container.querySelector('button.voice-rich-preview');
    expect(button).not.toBeNull();

    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(expanded).toBe(true);
    root.unmount();
  });
});
