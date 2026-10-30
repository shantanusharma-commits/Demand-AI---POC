// A client's look, switched on with APP_THEME=<folder>: public/themes/<folder>/ holds theme.json (name, logos,
// favicon, accent colour), theme.css (the colour tokens over globals.css) and the files they name. The folders are
// local only (.gitignore): the repository is public and never names a client. Without APP_THEME, or when the folder
// is missing or unreadable, the app keeps its own look; a theme is cosmetic, so a problem is logged, never fatal.
import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { env } from './env.ts';
import { logger } from './logger.ts';

/** What the screens need of a theme: the files as URLs, ready to use. */
export type Theme = {
  name: string;
  /** The primary colour as #RRGGBB, for places CSS doesn't reach (emails, Word files). */
  accent: string;
  stylesheet: string;
  logo: { onDark: string; onLight: string; alt: string; aspect: number };
  favicon: string | null;
};

const file = z.string().regex(/^[\w.-]+\.(svg|png|ico|webp)$/, 'a file name in the theme folder');
const ThemeFile = z.object({
  name: z.string().trim().min(1).max(60),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logo: z.object({ onDark: file, onLight: file, alt: z.string().trim().min(1).max(60), aspect: z.number().min(0.5).max(20) }),
  favicon: file.optional(),
});

let loaded: { key: string; theme: Theme | null } | undefined;

/** The active theme, or null for the app's own look. Read once per process. */
export function activeTheme(): Theme | null {
  const name = env().APP_THEME ?? '';
  if (loaded?.key === name) return loaded.theme;
  let theme: Theme | null = null;
  if (name) {
    try {
      const dir = join(process.cwd(), 'public', 'themes', name);
      const t = ThemeFile.parse(JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8')));
      readFileSync(join(dir, 'theme.css'));
      const url = (f: string) => `/themes/${name}/${f}`;
      theme = { name: t.name, accent: t.accent.toUpperCase(), stylesheet: url('theme.css'), favicon: t.favicon ? url(t.favicon) : null,
        logo: { onDark: url(t.logo.onDark), onLight: url(t.logo.onLight), alt: t.logo.alt, aspect: t.logo.aspect } };
    } catch (err) {
      logger.warn({ event: 'theme.unavailable', theme: name, problem: err instanceof z.ZodError ? 'theme.json is not valid' : (err as NodeJS.ErrnoException).code ?? 'unreadable' },
        'APP_THEME is set but its folder cannot be used: the default look is shown');
    }
  }
  loaded = { key: name, theme };
  return theme;
}

/** The theme as the browser gets it: no server paths, nothing but what the screens draw. */
export type ClientTheme = Pick<Theme, 'name' | 'logo'> | null;
export const clientTheme = (t: Theme | null): ClientTheme => (t ? { name: t.name, logo: t.logo } : null);
