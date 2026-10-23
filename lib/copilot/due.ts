// For Review's due dates (lib/engine/review.ts dueOf, dueBucket, dueLabel) worked out on the server in the viewer's
// time zone, given as their UTC offset in minutes (Date#getTimezoneOffset), so Copilot and the screen agree.
import { CONFIG } from '../demandai-engine.ts';

const DAY = 864e5;

function zone(offsetMin: number) {
  const shift = -offsetMin * 6e4;
  const local = (t: number) => new Date(t + shift);
  return {
    dayStart: (t: number) => Math.floor((t + shift) / DAY) * DAY - shift,
    dow: (t: number) => local(t).getUTCDay(),
    hours: (t: number) => local(t).getUTCHours(),
    local,
  };
}

export function dueIn(item: { cats: string[]; segment: string | null; spot: string | null; routedAt: number }, offsetMin: number): number {
  const z = zone(offsetMin), D = CONFIG.reviewDue as Record<string, number>, start = item.routedAt;
  if (item.spot === 'pending') { const f = z.dayStart(start); return f + ((5 - z.dow(f) + 7) % 7) * DAY + 17 * 36e5; }
  let days = Math.min(...item.cats.map(c => D[c] ?? D.other));
  if (item.segment === 'Inquiry') days = Math.min(days, D.inquiry);
  if (days === 0 && z.hours(start) >= 15) days = 1;
  let d = z.dayStart(start);
  if (days) {
    let n = days;
    while (n > 0) { d += DAY; if (z.dow(d) % 6) n--; }
    while (!(z.dow(d) % 6)) d += DAY;
  }
  return d + 17 * 36e5;
}

export function bucketIn(t: number, now: number, offsetMin: number): string {
  if (t < now) return 'overdue';
  const z = zone(offsetMin), n = Math.round((z.dayStart(t) - z.dayStart(now)) / DAY);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : n <= 2 ? '2days' : 'later';
}

export function labelIn(t: number, now: number, offsetMin: number): string {
  const z = zone(offsetMin), b = bucketIn(t, now, offsetMin), d = z.local(t);
  const day = d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const hm = d.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
  return b === 'overdue' ? `Overdue since ${day}` : b === 'today' ? `Due by ${hm} today` : b === 'tomorrow' ? `Due by ${hm} tomorrow` : `Due by ${day}`;
}
