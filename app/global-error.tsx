'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client/report-error';

// Replaces the root layout when it fails, so it renders its own document and cannot rely on globals.css.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError('global-error', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F5F6F9', color: '#141A21' }}>
        <title>Something went wrong — DemandAI Pilot</title>
        <main role="alert" style={{ maxWidth: 520, margin: '15vh auto', padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
            DemandAI could not load. Nothing you saved has been lost. Try again, and if it keeps happening, tell your
            administrator{error.digest ? ' and quote the reference below' : ''}.
          </p>
          {error.digest && <p style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 16 }}>Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: '#7D52A2', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
