// Plain, brand-neutral emails. Every value is escaped for the HTML part.
import 'server-only';
import type { MailMessage } from './mailer.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function html(paragraphs: string[], link?: { href: string; label: string }): string {
  const body = paragraphs.map(p => `<p style="margin:0 0 14px;font:14px/1.5 system-ui,sans-serif;color:#141A21">${esc(p)}</p>`).join('');
  const button = link
    ? `<p style="margin:18px 0"><a href="${esc(link.href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#7D52A2;color:#fff;font:600 14px system-ui,sans-serif;text-decoration:none">${esc(link.label)}</a></p>
       <p style="margin:0 0 14px;font:12px/1.5 system-ui,sans-serif;color:#5b6573">Or paste this address into your browser: ${esc(link.href)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F5F6F9"><div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px">${body}${button}</div></body></html>`;
}

export function inviteMessage(to: string, a: { link: string; unitName: string; expiresHours: number; support?: string }): MailMessage {
  const lines = [
    `You've been invited to DemandAI for ${a.unitName}.`,
    `Choose your password to finish setting up your account. The link works once and expires in ${a.expiresHours} hours.`,
    ...(a.support ? [`If you weren't expecting this, ignore this email or contact ${a.support}.`] : ["If you weren't expecting this, you can ignore this email."]),
  ];
  return { kind: 'invite', to, subject: 'You have been invited to DemandAI', text: `${lines.join('\n\n')}\n\n${a.link}\n`, html: html(lines, { href: a.link, label: 'Set your password' }) };
}

export function passwordResetMessage(to: string, a: { link: string; expiresMinutes: number; support?: string }): MailMessage {
  const lines = [
    'Someone asked to reset the password for your DemandAI account.',
    `The link works once and expires in ${a.expiresMinutes} minutes. Resetting signs you out everywhere.`,
    ...(a.support ? [`If it wasn't you, ignore this email; your password stays the same. Questions: ${a.support}.`] : ["If it wasn't you, ignore this email; your password stays the same."]),
  ];
  return { kind: 'password_reset', to, subject: 'Reset your DemandAI password', text: `${lines.join('\n\n')}\n\n${a.link}\n`, html: html(lines, { href: a.link, label: 'Choose a new password' }) };
}

export function passwordChangedMessage(to: string, a: { support?: string }): MailMessage {
  const lines = [
    'The password for your DemandAI account was just changed, and every session was signed out.',
    a.support ? `If you didn't do this, contact ${a.support} straight away.` : "If you didn't do this, contact your DemandAI administrator straight away.",
  ];
  return { kind: 'password_changed', to, subject: 'Your DemandAI password was changed', text: `${lines.join('\n\n')}\n`, html: html(lines) };
}
