import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Every screen now runs on server data (Phases 3-5), so the React Compiler hook rules apply everywhere: the
// prototype screens' relaxed list is gone.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
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
