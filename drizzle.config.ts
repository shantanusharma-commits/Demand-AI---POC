import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` writes reviewed SQL migrations to drizzle/. Hand-written migrations (RLS, triggers, grants,
// functions) are created with `npm run db:generate -- --custom --name=<what>` and filled in by hand.
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/server/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
