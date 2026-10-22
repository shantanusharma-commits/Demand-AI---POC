// Email for invites, password resets and "password changed" notices (D-29): nodemailer over SMTP with STARTTLS,
// configured with the RFP service's NOTIFICATION_* variables. When email is disabled or not configured, nothing
// is sent and callers fall back to showing the one-time link to the Admin (copy-link). Recipients are never logged.
import 'server-only';
import nodemailer from 'nodemailer';
import type { Env } from '../env.ts';
import { logger } from '../logger.ts';

export type MailKind = 'invite' | 'password_reset' | 'password_changed';
export type MailMessage = { kind: MailKind; to: string; subject: string; text: string; html: string };
export type Mailer = { readonly enabled: boolean; send(message: MailMessage): Promise<{ delivered: boolean }> };

export const disabledMailer: Mailer = {
  enabled: false,
  async send(message) {
    logger.info({ event: 'mail.skipped', kind: message.kind }, 'Email is disabled; the link is shown to the Admin instead');
    return { delivered: false };
  },
};

export function createMailer(env: Env): Mailer {
  const ready = env.NOTIFICATION_EMAIL_FROM && env.NOTIFICATION_SMTP_HOST && env.NOTIFICATION_APP_PASSWORD;
  if (env.NOTIFICATION_DISABLED || !ready) return disabledMailer;
  const port = env.NOTIFICATION_SMTP_PORT;
  const transport = nodemailer.createTransport({
    host: env.NOTIFICATION_SMTP_HOST,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS (required) on 587 and others
    requireTLS: port !== 465,
    auth: { user: env.NOTIFICATION_EMAIL_FROM, pass: env.NOTIFICATION_APP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const from = { name: env.NOTIFICATION_SENDER_NAME || 'DemandAI', address: env.NOTIFICATION_EMAIL_FROM! };
  return {
    enabled: true,
    async send(message) {
      const started = performance.now();
      try {
        await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
        logger.info({ event: 'mail.sent', kind: message.kind, durationMs: Math.round(performance.now() - started) }, 'Email sent');
        return { delivered: true };
      } catch (err) {
        logger.error({ event: 'mail.failed', kind: message.kind, err }, 'Email could not be sent');
        return { delivered: false };
      }
    },
  };
}
