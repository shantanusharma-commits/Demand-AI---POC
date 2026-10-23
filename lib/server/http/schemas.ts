// Request body schemas shared by the API routes.
import 'server-only';
import { z } from 'zod';
import { BU_ROLES } from '../../auth/permissions.ts';
import { badRequest } from './errors.ts';

export const emailField = z.email('Enter a valid email address.').max(254);
export const uuidField = z.uuid('Not a valid ID.');
export const reasonField = z.string().trim().min(3, 'Give a short reason.').max(500);
export const roleField = z.enum(BU_ROLES);
export const tokenField = z.string().min(10).max(200);
export const newPasswordField = z.string().min(1, 'Enter a password.').max(200);

/** Route parameters that must be UUIDs; anything else is a 404 (never a database error). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const nameField = z.string().trim().min(1, 'Give it a name.').max(200);

/** ?after=&limit=&q= on paged lists, plus the route's own filters. Unknown parameters are ignored. */
export function pageQuery<T extends z.ZodRawShape>(request: Request, extra: T) {
  const schema = z.object({
    after: z.coerce.number().int().min(-1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    q: z.string().max(200).optional(),
    ...extra,
  });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fields[i.path.map(String).join('.') || 'query'] ||= []).push(i.message);
    throw badRequest('Some search or paging options are not valid.', fields);
  }
  return parsed.data;
}

/** Analytics options: one rep's results (managers only, checked in the service) and the week of a weekly summary. */
export function analyticsQuery(request: Request): { rep?: string; week?: string } {
  const q = pageQuery(request, { rep: z.string().trim().email().max(254).optional(), week: z.string().regex(/^\d{4}-W\d{2}$/, 'A week such as 2026-W43.').optional() });
  return { rep: q.rep, week: q.week };
}
