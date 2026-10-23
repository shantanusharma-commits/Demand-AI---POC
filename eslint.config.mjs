import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Screens carried over from the prototype break the React Compiler hook rules (refs read during render,
// impure render, setState in effects). They are rewired to server data in Phases 3-5; until each one is,
// these rules only warn there. Remove a file from this list when its screen is rewritten.
const PROTOTYPE_SCREENS = [
  'components/screens/ReviewScreen.tsx',
  'components/screens/TodayScreen.tsx',
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: PROTOTYPE_SCREENS,
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // The legacy demo is the unchanged behavioural reference (D-1); it is not linted or shipped.
    'legacy/**',
    'reference_content/**',
    'test-data/**',
    'vendor/**',
  ]),
]);
