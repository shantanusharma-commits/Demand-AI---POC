// What a prospect handed from Scoring to Micro-segments & NBA carries: the action and channel follow the stage
// sheet's rules; the draft is a template until AI drafting is connected (Phase 6). Same wording as the original
// Scoring page's toNBA. The item's ID is the hand-off item's UUID, so two prospects can never share one (G-049).
// The NBA port in Phase 5b replaces the action and channel choice with the full rules (canContact, segments).
import { CONFIG } from '../demandai-engine.ts';
import type { NbaItem } from '../nba/data.ts';
import type { Prospect } from './prospects.ts';

const NBA_ABOUT: Record<string, string> = { 'Inquiry or RFQ': 'your recent inquiry', 'Installed system near end of support': 'your control system reaching end of support',
  'Service contract renewal': 'your service contract coming up for renewal', 'Capital project': 'the project you have under way', 'Leadership change': 'your new role',
  'Webinar attended': 'the webinar you attended', 'Webinar registered': 'the webinar you registered for', 'Content download': 'the material you downloaded', 'Email clicked': 'the material you opened' };
const NBA_ACTION: Record<string, string> = { Inquiry: 'Follow up on the inquiry', Modernisation: 'Propose a migration or upgrade discussion', 'Service renewal': 'Offer a renewal review',
  Project: 'Share a comparable case study and offer a technical session', Leadership: 'Introduction to a new leader in a buying role', Engagement: 'Follow up on the topic they engaged with' };

const fmt1 = (n: number | undefined | null): string => n === undefined || n === null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 1 });

/** A hand-off item for a prospect with a live signal. */
export function toNbaItem(x: Prospect, id: string): NbaItem {
  const p = x.p!;
  const c = x.c, top = p.signals[0], seg = top.segment || (CONFIG.signalTypes[top.type] || {}).segment || 'Engagement';
  const first = c.firstName || c.name.split(' ')[0];
  const emailOk = c.email && c.emailVerified, liOk = !!c.linkedin;
  const channel = seg === 'Inquiry' || (!emailOk && !liOk) ? 'Call' : emailOk ? 'Email' : 'DM';
  const why = p.whyNow!.replace(/^./, m => m.toUpperCase());
  const about = NBA_ABOUT[top.type] || 'your recent activity';
  const action = NBA_ACTION[seg];
  return { id, name: c.name, title: c.jobTitle, co: x.r.account.name, priority: Math.round(x.score!),
    action: seg, chosenAction: action, channel,
    channelWhy: channel === 'Call' ? (seg === 'Inquiry' ? 'Inquiries go to a call task, per the routing rules.' : 'No verified email and no LinkedIn URL: call is the only channel.') : channel === 'Email' ? 'Verified, sendable email.' : 'No verified email on file, but a LinkedIn URL exists: DM.',
    routed: 'review', confidence: x.r.confidence || 'medium', team: null, isNew: true, fromScoring: true,
    signal: why, signalSrc: `${top.source || 'Signal file'} · scored ${fmt1(x.score)} (tier ${x.tier}) · draft from a template, AI drafting not connected`, format: 'email',
    emailSubj: `${x.r.account.name}: ${about.replace(/^your /, '')}`,
    email: `Hi ${first},\n\nFollowing up on ${about}.\n\nWould a short conversation in the next couple of weeks be useful? We'd come prepared to ${action.charAt(0).toLowerCase() + action.slice(1)}.\n\nBest,\nClient Team`,
    dmNote: `Hi ${first}, following up on ${about}. Happy to connect.`,
    dmMessage: `Thanks for connecting. Would a short conversation be useful? We'd come prepared to ${action.charAt(0).toLowerCase() + action.slice(1)}.`,
    callOpener: `"Hi ${first}, this is [name] from Client, following up on ${about}. Do you have two minutes?"` };
}
