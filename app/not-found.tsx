import Link from 'next/link';

// Shown for an address that doesn't exist. Next.js's built-in page carries its own style element, which the Content
// Security Policy would block (it has no nonce), so the app has its own, in the same form as error.tsx.
export default function NotFound() {
  return (
    <main style={{ maxWidth: 520, margin: '15vh auto', padding: 24, fontFamily: 'var(--fb)', color: 'var(--i1)' }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontSize: 20, marginBottom: 8 }}>This page doesn’t exist</h1>
      <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>Check the address, or go back to your start page.</p>
      <Link href="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>Go to your start page</Link>
    </main>
  );
}
