// Every API route is wrapped in withApi() (plan §8). In order, it:
//  1. takes or makes a request ID and puts it on every log line and on the response;
//  2. refuses state-changing requests from another origin (CSRF, together with SameSite=Lax cookies);
//  3. loads the session (re-read from the database on every request) unless the route is public;
//  4. requires an active business unit and checks the role's permission, with a 403 that names the reason;
//  5. builds the tenant context (owner scoping for reps) for the row-level security policies;
//  6. reads a size-capped JSON body and validates it with zod;
//  7. maps errors to { error, code, requestId } without stack traces, and logs one access line per request.
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import { ACTION_LABELS, can, scopeFor, type Action, type BuRole } from '../../auth/permissions.ts';
import { appDeps, type AppDeps } from '../deps.ts';
import { loadSession, SESSION_COOKIE, type LoadedSession } from '../auth/sessions.ts';
import type { TenantContext } from '../db/tenant.ts';
import { ownerEmailsOf } from '../services/users.ts';
import { addLogContext, logger, withLogContext } from '../logger.ts';
import { badRequest, forbidden, HttpError, unauthorized } from './errors.ts';
import { clientAddress, isSameOrigin, readBodyText } from './request.ts';

/** public: no session. user: any signed-in person. unit: signed in with an active business unit. platform: platform admin. */
export type AuthMode = 'public' | 'user' | 'unit' | 'platform';

export type ApiOptions<B> = {
  /** "METHOD /path" as written in the route inventory, for logs. */
  route: string;
  auth: AuthMode;
  permission?: Action;
  body?: ZodType<B>;
  maxBodyBytes?: number;
};

export type ApiContext<B, P> = {
  request: Request;
  requestId: string;
  params: P;
  body: B;
  ip: string;
  userAgent: string | undefined;
  deps: AppDeps;
  session: LoadedSession | null;
  /** Present when auth is 'unit'. */
  tenant: TenantContext | null;
  role: BuRole | null;
};

export type ApiPolicy = { route: string; auth: AuthMode; permission?: Action };
export type ApiHandler = ((request: Request, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>) & { apiPolicy: ApiPolicy };

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

function zodFields(issues: { path: PropertyKey[]; message: string }[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const i of issues) (fields[i.path.map(String).join('.') || 'body'] ||= []).push(i.message);
  return fields;
}

export function withApi<B = undefined, P = Record<string, string>>(options: ApiOptions<B>, handler: (ctx: ApiContext<B, P>) => Promise<unknown>): ApiHandler {
  const fn = async (request: Request, routeCtx?: { params?: Promise<Record<string, string>> }): Promise<Response> => {
    const given = request.headers.get('x-request-id');
    const requestId = given && /^[A-Za-z0-9-]{8,64}$/.test(given) ? given : randomUUID();
    return withLogContext({ requestId, route: options.route }, async () => {
      const started = performance.now();
      let status = 500;
      try {
        const deps = appDeps();
        if (MUTATIONS.has(request.method) && !isSameOrigin(request, deps.appBaseUrl, deps.production)) {
          throw forbidden('This request did not come from DemandAI, so it was refused.');
        }
        let session: LoadedSession | null = null;
        if (options.auth !== 'public') {
          session = await loadSession(deps.db, deps.session, readCookie(request, SESSION_COOKIE));
          if (!session) throw unauthorized();
          addLogContext({ userId: session.user.id, businessUnitId: session.user.activeBusinessUnit?.id });
        }
        let tenant: TenantContext | null = null;
        let role: BuRole | null = null;
        if (options.auth === 'platform' && !session!.user.platformAdmin) throw forbidden('Only the platform administrator can do this.');
        if (options.auth === 'unit') {
          const unit = session!.user.activeBusinessUnit;
          if (!unit) throw forbidden('You are not an active member of any business unit.');
          role = unit.role;
          if (options.permission && !can(role, options.permission)) throw forbidden(`Your role (${role}) cannot ${ACTION_LABELS[options.permission]}.`);
          const scope = scopeFor(role);
          tenant = {
            userId: session!.user.id, businessUnitId: unit.id, scope,
            ownerEmails: scope === 'own' ? await ownerEmailsOf(deps.db, session!.user.id, session!.user.email) : [],
          };
        }
        let body = undefined as B;
        if (options.body) {
          const text = await readBodyText(request, options.maxBodyBytes ?? 64 * 1024);
          if (text === null) throw new HttpError(413, 'too_large', 'The request is too large.');
          let json: unknown;
          try { json = text ? JSON.parse(text) : {}; } catch { throw badRequest('The request body is not valid JSON.'); }
          const parsed = options.body.safeParse(json);
          if (!parsed.success) throw badRequest('Some fields are missing or not valid.', zodFields(parsed.error.issues));
          body = parsed.data;
        }
        const params = ((routeCtx?.params ? await routeCtx.params : {}) ?? {}) as P;
        const result = await handler({
          request, requestId, params, body, ip: clientAddress(request), userAgent: request.headers.get('user-agent') ?? undefined,
          deps, session, tenant, role,
        });
        const response = result instanceof Response ? result : Response.json(result ?? { ok: true });
        status = response.status;
        response.headers.set('x-request-id', requestId);
        if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
        return response;
      } catch (err) {
        if (err instanceof HttpError) {
          status = err.status;
          if (status >= 500) logger.error({ event: 'api.error', code: err.code, err }, 'Request failed');
          return Response.json({ error: err.message, code: err.code, ...(err.fields ? { fields: err.fields } : {}), requestId },
            { status, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } });
        }
        status = 500;
        logger.error({ event: 'api.error', err }, 'Unhandled error in an API route');
        return Response.json({ error: 'Something went wrong. Try again, and quote this reference if it keeps happening.', code: 'internal', requestId },
          { status, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } });
      } finally {
        const durationMs = Math.round(performance.now() - started);
        const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
        logger[level]({ event: 'http.request', method: request.method, status, durationMs }, `${options.route} ${status}`);
      }
    });
  };
  return Object.assign(fn, { apiPolicy: { route: options.route, auth: options.auth, permission: options.permission } });
}
