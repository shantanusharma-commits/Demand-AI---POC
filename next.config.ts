import type { NextConfig } from 'next';

// Security headers on every response (G-054; plan §4 item 12). The Content Security Policy needs a nonce per request,
// so proxy.ts sends it. Browsers ignore Strict-Transport-Security over plain http, so local http use is unaffected.
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Same-origin requests keep their Referer (and their Origin header, which the CSRF check needs); links out send none.
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  // The container image runs the minimal server Next.js traces into .next/standalone.
  output: 'standalone',
  // No floating Next.js badge in development: the screens should look exactly as they do in production.
  devIndicators: false,
  // The dev server refuses its own assets to any other hostname than localhost; this lets a tunnel set as
  // APP_BASE_URL (a Cloudflare quick tunnel or ngrok, for trying the local setup with others) load the pages. Ignored in production.
  allowedDevOrigins: process.env.APP_BASE_URL ? [new URL(process.env.APP_BASE_URL).hostname] : [],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
