/**
 * Social crawlers get /api/og for /recipe/* (Open Graph meta).
 * Browsers get the SPA via the normal index.html rewrite (NEU-635).
 */
const BOT_USER_AGENT =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot|WhatsApp|LinkedInBot|Discordbot|TelegramBot|Googlebot|bingbot|Pinterestbot/i;

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/recipe/')) {
    return;
  }

  const userAgent = request.headers.get('user-agent') ?? '';
  if (!BOT_USER_AGENT.test(userAgent)) {
    return;
  }

  const rewriteUrl = new URL('/api/og', url.origin);
  rewriteUrl.searchParams.set('pathname', url.pathname);

  return new Response(null, {
    headers: {
      'x-middleware-rewrite': rewriteUrl.toString(),
    },
  });
}

export const config = {
  matcher: '/recipe/:path*',
};
