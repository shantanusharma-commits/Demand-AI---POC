'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client/report-error';

// Shown when a screen fails to render. The message is generic on purpose: server errors reach the browser only
// as a digest, which support can match in the server log.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError('error-boundary', error);
  }, [error]);

  return (
    <main role="alert" style={{ maxWidth: 520, margin: '15vh auto', padding: 24, fontFamily: 'var(--fb)', color: 'var(--i1)' }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
      <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
        This screen could not be shown. Nothing you saved has been lost. Try again, and if it keeps happening, tell
        your administrator{error.digest ? ' and quote the reference below' : ''}.
      </p>
      {error.digest && (
        <p style={{ fontFamily: 'var(--fm)', fontSize: 12, marginBottom: 16 }}>Reference: {error.digest}</p>
      )}
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
