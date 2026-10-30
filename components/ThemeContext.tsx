'use client';

/* The active client theme (APP_THEME), handed down from the root layout: the logos the frame and the sign-in pages
   draw. Null is the app's own look. */
import { createContext, useContext, type ReactNode } from 'react';
import type { ClientTheme } from '@/lib/server/theme';

const ThemeContext = createContext<ClientTheme>(null);

export function ThemeProvider({ theme, children }: { theme: ClientTheme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** The product mark: the client's logo when a theme is on, else the DemandAI mark. `on` is the surface behind it. */
export function BrandMark({ on, height }: { on: 'dark' | 'light'; height: number }) {
  const t = useTheme();
  if (!t) return <svg width={height} height={height} viewBox="0 0 200 200" aria-hidden="true"><image href="/demandai-logo.png" width="200" height="200" /></svg>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={on === 'dark' ? t.logo.onDark : t.logo.onLight} alt={t.logo.alt} height={height} width={Math.round(height * t.logo.aspect)} style={{ display: 'block' }} />;
}
