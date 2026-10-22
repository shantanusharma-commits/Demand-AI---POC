import { NextResponse, type NextRequest } from 'next/server';

// Runs before every page and API request (Next 16 "proxy", Node runtime). It only does cheap, optimistic work:
// a request ID for the logs, and a redirect to sign-in when a page is requested without a session cookie at all.
// It never decides access: every page and every API handler checks the session and role again on the server.
const PUBLIC_PAGES = new Set(['/login', '/accept-invite', '/forgot-password', '/reset-password']);

export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  if (!isApi && !PUBLIC_PAGES.has(pathname) && !request.cookies.has('demandai_session')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  // Not for static files, the health probes, or uploads (large bodies go straight to their handler, which checks
  // the session itself; the proxy would otherwise buffer them, N-06).
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|demandai-logo\\.png|api/health|api/ready|api/uploads).*)'],
};
