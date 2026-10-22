// Request body schemas shared by the API routes.
import 'server-only';
import { z } from 'zod';
import { BU_ROLES } from '../../auth/permissions.ts';

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
