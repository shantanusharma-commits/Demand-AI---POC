// The Content Security Policy every page is served with (G-054; plan §4 item 12). proxy.ts makes a fresh nonce per
// request and sends this header; Next.js reads the nonce from it and puts it on its own scripts. Scripts run only with
// the nonce ('strict-dynamic' lets those scripts load the app's chunks). Style elements need the nonce too; style
// attributes stay allowed, because the screens set hundreds of inline styles (plan §11 risk 5). Browsers that predate
// style-src-elem and style-src-attr fall back to style-src, which allows inline styles as before.
export type CspOptions = { dev: boolean; https: boolean };

export function contentSecurityPolicy(nonce: string, o: CspOptions): string {
  return [
    "default-src 'self'",
    // React in development reconstructs server stacks with eval; production never needs it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Development injects style elements without a nonce (hot reload); a nonce would make 'unsafe-inline' ignored.
    `style-src-elem 'self' ${o.dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(o.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** A nonce: 128 random bits, base64. */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
