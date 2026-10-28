// Content studio on the server against PostgreSQL (D-36, D-45): a request with no topic asks back and stores nothing;
// a piece is written for the reader named (or a general reader) with the approved sources that fit its topic, and the
// conversation kept; chat changes and own edits are saved with a
// revision guard; an unbacked claim is refused; only a piece whose checks pass goes into the Content library, and one
// that fails again drops back to draft; Word and Markdown files; reps add library pieces to outreach messages (one, or
// every message with the same action in the micro-segment); business units don't see each other's pieces.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import type pg from 'pg';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import type { Actor } from '../../lib/server/services/lists.ts';
import { changeItem, createItem, exportItem, getItem, listItems, saveBlocks, setContent, setReady, type ItemView } from '../../lib/server/services/studio.ts';
import { relevantClaims, type Block } from '../../lib/content/studio.ts';
import { itemDetail } from '../../lib/server/services/recommendations.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { buildPilot } from './pilot.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics, runId = '';
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const mgr = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const unitB = (): TenantContext => ({ userId: ids.repB, businessUnitId: ids.buB, scope: 'own', ownerEmails: ['rep.b@demandai.test'] });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const one = async (q: string, p: unknown[] = []) => (await owner.query(q, p)).rows[0];
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));

/** The text of one file in a ZIP (local headers, deflated entries). */
function unzipEntry(zip: Buffer, name: string): string | null {
  let i = 0;
  while (i + 30 <= zip.length && zip.readUInt32LE(i) === 0x04034b50) {
    const csize = zip.readUInt32LE(i + 18), nlen = zip.readUInt16LE(i + 26), xlen = zip.readUInt16LE(i + 28);
    const n = zip.subarray(i + 30, i + 30 + nlen).toString('utf8'), start = i + 30 + nlen + xlen;
    if (n === name) return inflateRawSync(zip.subarray(start, start + csize)).toString('utf8');
    i = start + csize;
  }
  return null;
}

before(async () => {
  db = await freshDatabase('studio');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  ({ runId } = await buildPilot(app, owner, ids));
});
after(async () => { await db?.drop(); });

let piece: ItemView;
test('a request with no topic asks back and stores nothing; a clear one writes a piece for its reader with the sources that fit its topic', async () => {
  const vague = await as(admin(), s => createItem(s, mgr(), { text: 'write a blog', type: 'blog' }));
  assert.deepEqual([vague.created, (await one(`SELECT count(*)::int n FROM studio_items`)).n], [false, 0]);
  assert.match((vague as { question: string }).question, /^Happy to write a blog\. What should it be about/);
  const made = await as(admin(), s => createItem(s, mgr(), { text: 'A blog on planning a control system migration for plant managers', type: 'blog' }));
  assert.equal(made.created, true);
  piece = (made as { item: ItemView }).item;
  const live = await one(`SELECT pack FROM brand_versions WHERE business_unit_id = $1 ORDER BY version_no DESC LIMIT 1`, [ids.buA]);
  const expected = relevantClaims('planning a control system migration', live.pack, new Date().toISOString().slice(0, 10)).slice(0, 3).map(c => c.id);
  assert.ok(expected.length > 0);
  assert.deepEqual([piece.type, piece.audience, piece.status, piece.issues, piece.rev, piece.sources], ['blog', 'plant managers', 'Draft', 0, 1, expected]);
  assert.deepEqual(piece.cited.sort(), [...expected].sort());
  assert.deepEqual(piece.messages.map(m => m.who), ['me', 'ai', 'ai']);
  assert.match(piece.messages[1].text, /^I'll write a medium blog on \*\*planning a control system migration\*\*/);
  assert.equal((await one(`SELECT count(*)::int n FROM audit_log WHERE action = 'studio.created'`)).n, 1);
  // Any topic, for any reader (D-45): nothing about it is a micro-segment, and no approved source fits, so no claims.
  const sales = (await as(admin(), s => createItem(s, mgr(), { text: 'A blog on how AI can help in sales for AI marketers', type: 'blog' })) as { item: ItemView }).item;
  assert.deepEqual([sales.audience, sales.sources, sales.cited, sales.issues], ['AI marketers', [], [], 0]);
  assert.match(sales.messages[1].text, /for AI marketers, .* No approved source fits the topic, so it makes no product claims\.$/);
  assert.equal((await one(`SELECT audience FROM studio_items WHERE id = $1`, [sales.id])).audience, 'AI marketers');
});

test('chat changes and own edits are saved with a revision guard; an unbacked claim is refused; undo restores', async () => {
  const before = piece.blocks;
  const sec = await as(admin(), s => changeItem(s, mgr(), piece.id, { op: 'ask', q: 'add a section on lifecycle planning', rev: 1 }));
  assert.deepEqual([sec.item.rev, sec.item.blocks.length, sec.item.messages.length], [2, before.length + 2, 5]);
  assert.match(sec.reply, /^Added a section on lifecycle planning before the close/);
  await assert.rejects(as(admin(), s => changeItem(s, mgr(), piece.id, { op: 'tone', value: 'Formal', rev: 1 })), status(409, /Someone else changed this piece/));
  const formal = await as(admin(), s => changeItem(s, mgr(), piece.id, { op: 'tone', value: 'Formal', rev: 2 }));
  assert.deepEqual([formal.item.tone, formal.item.messages.at(-2)!.text], ['Formal', 'Tone: Formal']);
  const refused = await as(admin(), s => changeItem(s, mgr(), piece.id, { op: 'ask', q: 'say it cuts downtime by 40%', rev: 3 }));
  assert.equal(refused.item.rev, 3, 'nothing changed, nothing saved');
  assert.match(refused.reply, /there's no approved source for it/);
  const undo = await as(admin(), s => changeItem(s, mgr(), piece.id, { op: 'restore', blocks: before, rev: 3 }));
  assert.deepEqual([undo.item.rev, undo.item.blocks.length, undo.reply], [4, before.length, 'Undone. The piece is back to how it was before my last change.']);
  await assert.rejects(as(admin(), s => saveBlocks(s, mgr(), piece.id, { blocks: [{ id: 'x', tag: 'script', role: 'free', v: 0, text: 'x' }], rev: 4 })), status(400, /not a block type/));
  const edited: Block[] = before.map(b => (b.tag === 'h1' ? { ...b, text: 'Plan the cutover first', edited: true } : b));
  const saved = await as(admin(), s => saveBlocks(s, mgr(), piece.id, { blocks: edited, rev: 4 }));
  assert.deepEqual([saved.rev, saved.backToDraft, saved.checks.unsupported.length], [5, false, 0]);
  assert.equal((await as(admin(), s => getItem(s, piece.id))).title, 'Plan the cutover first', 'the title follows the heading');
});

test('only a piece whose checks pass goes into the Content library; one that fails again drops back to draft', async () => {
  const cur = await as(admin(), s => getItem(s, piece.id));
  const claimy: Block[] = [...cur.blocks, { id: 'c1', tag: 'p', role: 'free', v: 0, edited: true, text: 'We guarantee 50% lower maintenance costs.' }];
  await as(admin(), s => saveBlocks(s, mgr(), piece.id, { blocks: claimy, rev: cur.rev }));
  const failing = await as(admin(), s => getItem(s, piece.id));
  assert.ok(failing.issues > 0 && failing.checks.unsupported.length > 0);
  await assert.rejects(as(admin(), s => setReady(s, mgr(), piece.id, true)), status(409, /^Fix \d+ checks? first/));
  await as(admin(), s => saveBlocks(s, mgr(), piece.id, { blocks: cur.blocks, rev: failing.rev }));
  const ready = await as(admin(), s => setReady(s, mgr(), piece.id, true));
  assert.deepEqual([ready.item.status, ready.item.issues], ['Ready', 0]);
  await assert.rejects(as(admin(), s => setReady(s, mgr(), piece.id, true)), status(409, /already/));
  const back = await as(admin(), s => saveBlocks(s, mgr(), piece.id, { blocks: claimy, rev: ready.item.rev }));
  assert.equal(back.backToDraft, true);
  assert.equal((await one(`SELECT status FROM studio_items WHERE id = $1`, [piece.id])).status, 'Draft');
  await as(admin(), s => saveBlocks(s, mgr(), piece.id, { blocks: cur.blocks, rev: back.rev }));
  await as(admin(), s => setReady(s, mgr(), piece.id, true));
});

test('files: a Word document (a ZIP whose document holds the piece and "Client") and Markdown', async () => {
  const docx = await as(admin(), s => exportItem(s, mgr(), piece.id, 'docx'));
  const bytes = docx.body as Buffer;
  assert.equal(docx.fileName, 'plan-the-cutover-first.docx');
  assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304');
  const doc = unzipEntry(bytes, 'word/document.xml')!;
  assert.ok(doc.includes('Plan the cutover first') && doc.includes('Blog · Client · '));
  assert.ok(unzipEntry(bytes, 'word/header1.xml')!.includes('>Client<'));
  const md = await as(admin(), s => exportItem(s, mgr(), piece.id, 'md'));
  assert.match(md.body as string, /^# Plan the cutover first\n\n/);
});

test('reps add library pieces to outreach messages: one, or every message with the same action in the micro-segment; logged', async () => {
  const draft = (await as(admin(), s => createItem(s, mgr(), { text: 'A short whitepaper on service contract renewal for site maintenance leads', type: 'whitepaper' })) as { item: ItemView }).item;
  const target = await one(`SELECT r.id, r.segment, r.action FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version
    WHERE r.nba_run_id = $1 AND r.segment IS NOT NULL AND d.channel = 'Email' AND (SELECT count(*) FROM recommendations x WHERE x.nba_run_id = r.nba_run_id AND x.segment = r.segment AND x.action = r.action) > 1
    ORDER BY r.position LIMIT 1`, [runId]);
  await assert.rejects(as(admin(), s => setContent(s, mgr(), target.id, { ids: [draft.id], scope: 'one' })), status(400, /Content library/));
  const oneMsg = await as(admin(), s => setContent(s, mgr(), target.id, { ids: [piece.id], scope: 'one' }));
  assert.deepEqual(oneMsg, { content: [piece.id], messages: 1 });
  // One message in the micro-segment switched to its runner-up action: a different action, so it is left out.
  const switched = await one(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND segment = $2 AND action = $3 AND id <> $4 AND runner_up IS NOT NULL LIMIT 1`,
    [runId, target.segment, target.action, target.id]);
  if (switched) await owner.query(`UPDATE recommendations SET use_runner_up = true WHERE id = $1`, [switched.id]);
  const all = await as(admin(), s => setContent(s, mgr(), target.id, { ids: [piece.id], scope: 'all' }));
  const same = (await one(`SELECT count(*)::int n FROM recommendations WHERE nba_run_id = $1 AND segment = $2 AND action = $3 AND NOT use_runner_up AND manual_action IS NULL`,
    [runId, target.segment, target.action])).n;
  assert.ok(switched, 'the sample has a runner-up to switch to');
  assert.equal(all.messages, same);
  assert.equal((await one(`SELECT count(*)::int n FROM recommendations WHERE $1 = ANY(content)`, [piece.id])).n, same);
  const listed = (await as(admin(), s => listItems(s))).find(i => i.id === piece.id)!;
  assert.equal(listed.usage, same);
  assert.deepEqual((await as(admin(), s => listItems(s, { ready: true }))).map(i => i.id), [piece.id]);
  const detail = await as(admin(), s => itemDetail(s, mgr(), target.id));
  assert.deepEqual([detail.content.map(c => [c.id, c.status]), detail.sameAction, detail.can.content], [[[piece.id, 'Ready']], same - 1, true],
    'the drawer shows what is attached and how many messages share the action');
  const log = await one(`SELECT decision, note FROM decision_log WHERE recommendation_id = $1 ORDER BY seq DESC LIMIT 1`, [target.id]);
  assert.match(`${log.decision} · ${log.note}`, new RegExp(`^Content added to the message · 1 piece\\(s\\), also added to ${same - 1} other message`));
  const task = await one(`SELECT r.id FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version WHERE d.channel = 'Task' LIMIT 1`);
  if (task) await assert.rejects(as(admin(), s => setContent(s, mgr(), task.id, { ids: [piece.id], scope: 'one' })), status(409, /task/));
});

test('business units don’t see each other’s pieces', async () => {
  assert.deepEqual(await as(unitB(), s => listItems(s)), []);
  await assert.rejects(as(unitB(), s => getItem(s, piece.id)), status(404));
  await assert.rejects(as(unitB(), s => saveBlocks(s, { userId: ids.repB, role: 'Sales rep' }, piece.id, { blocks: [], rev: 1 })), status(404));
  await assert.rejects(owner.query(`UPDATE studio_messages SET text = 'x'`), /append-only/);
});
