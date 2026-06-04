import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type VercelRequest = {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  send: (body: string) => void;
};

const DEFAULT_OG_IMAGE = 'https://jamie-oliver-ai.vercel.app/assets/jamie-heart-xuBJOayD.png';
const DEFAULT_TITLE = 'Jamie Oliver AI';
const DEFAULT_DESCRIPTION = 'Discover and cook Jamie Oliver recipes with AI-guided voice assistance.';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractSlug(pathname: string): string | null {
  const recipeMatch = pathname.match(/^\/recipe\/([^/]+)(?:\/cook)?\/?$/);
  if (!recipeMatch) {
    return null;
  }
  return decodeURIComponent(recipeMatch[1]);
}

function readIndexHtml(): string {
  const candidates = [
    join(process.cwd(), 'dist', 'index.html'),
    join(process.cwd(), 'index.html'),
  ];

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      // try next path
    }
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>${DEFAULT_TITLE}</title></head><body><div id="root"></div></body></html>`;
}

function injectMetaTags(html: string, tags: Record<string, string>): string {
  const tagMarkup = Object.entries(tags)
    .map(([property, content]) => {
      const attr = property.startsWith('twitter:') ? 'name' : 'property';
      return `<meta ${attr}="${escapeHtml(property)}" content="${escapeHtml(content)}" />`;
    })
    .join('\n    ');

  if (html.includes('</head>')) {
    return html.replace('</head>', `    ${tagMarkup}\n  </head>`);
  }

  return `${tagMarkup}\n${html}`;
}

async function fetchRecipeMeta(slug: string, apiBaseUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl: string;
} | null> {
  const response = await fetch(`${apiBaseUrl}/api/v1/recipes/${encodeURIComponent(slug)}`);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    title?: string;
    full_recipe?: {
      recipe?: {
        title?: string;
        description?: string;
        image_url?: string;
      };
    };
    metadata?: {
      title?: string;
      description?: string;
      image_url?: string;
    };
  };

  const recipeMeta = data.full_recipe?.recipe;
  const title = data.title || recipeMeta?.title || slug;
  const description =
    recipeMeta?.description ||
    data.metadata?.description ||
    DEFAULT_DESCRIPTION;
  const imageUrl =
    recipeMeta?.image_url ||
    data.metadata?.image_url ||
    DEFAULT_OG_IMAGE;

  return { title, description, imageUrl };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const requestUrl = new URL(req.url ?? 'http://localhost/recipe/unknown', 'http://localhost');
    const slug = extractSlug(requestUrl.pathname);
    const origin = `${requestUrl.protocol}//${requestUrl.host}`;
    const pageUrl = slug ? `${origin}/recipe/${encodeURIComponent(slug)}` : origin;

    const apiBaseUrl = (process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || '').replace(
      /\/$/,
      '',
    );

    let title = DEFAULT_TITLE;
    let description = DEFAULT_DESCRIPTION;
    let imageUrl = DEFAULT_OG_IMAGE;

    if (slug && apiBaseUrl) {
      const recipeMeta = await fetchRecipeMeta(slug, apiBaseUrl);
      if (recipeMeta) {
        title = recipeMeta.title;
        description = recipeMeta.description;
        imageUrl = recipeMeta.imageUrl;
      }
    }

    const html = injectMetaTags(readIndexHtml(), {
      'og:title': title,
      'og:description': description,
      'og:image': imageUrl,
      'og:url': pageUrl,
      'og:type': 'website',
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': imageUrl,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(html);
  } catch (error) {
    console.error('[og] Failed to render recipe meta tags:', error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(readIndexHtml());
  }
}
