// Sends a browser-side error to the server log. Best effort: a failed report is ignored.
export function reportClientError(source: 'error-boundary' | 'global-error', error: Error & { digest?: string }): void {
  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        source,
        message: String(error?.message ?? '').slice(0, 500),
        digest: error?.digest?.slice(0, 64),
        path: window.location.pathname.slice(0, 300),
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never throw from an error boundary.
  }
}
