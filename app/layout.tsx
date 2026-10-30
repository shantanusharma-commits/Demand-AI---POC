import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans, Sora } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeContext';
import { activeTheme, clientTheme } from '@/lib/server/theme';
import './globals.css';

// The original pages' fonts, self-hosted: next/font downloads them at build time and serves them from the app, so a
// browser never contacts Google (G-054). globals.css reads the three CSS variables.
const display = Sora({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const body = Plus_Jakarta_Sans({ subsets: ['latin'], style: ['normal', 'italic'], display: 'swap', variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

// The favicon is the active client theme's (APP_THEME), else the app's own.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'DemandAI Pilot', icons: { icon: activeTheme()?.favicon ?? '/favicon.ico' } };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request, so each gets the nonce from its own Content Security Policy (proxy.ts).
  await connection();
  // A client theme is a same-origin stylesheet over globals.css (no inline style element, so no nonce needed).
  const theme = activeTheme();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {theme ? <link rel="stylesheet" href={theme.stylesheet} precedence="theme" /> : null}
        <ThemeProvider theme={clientTheme(theme)}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
