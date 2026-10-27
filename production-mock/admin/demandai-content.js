/* ═══════════════ CONTENT: blogs and whitepapers, shared by Content studio and Micro-segments & NBA ═══════════════
   One writer (a router) picks the instructions for the content type; the brand pack from the Content library applies
   to every piece, and the outreach drafts' brand and claim checks run on it. Rules only in the POC: production swaps
   the templates for the model; the checks and the approved sources stay. Nothing is published: content is saved,
   added by the reps to an email or LinkedIn message in Micro-segments & NBA, and downloaded. */
(function (root) {
  const E = root.DemandAI;
  const KEY = 'demandai_studio_v2';
  const BRAND_HEX = '7D52A2';

  const TYPES = {
    blog:       { label: 'Blog',       ic: '📝', skill: 'blog-post',  about: 'A headline, short sections and one call to action' },
    whitepaper: { label: 'Whitepaper', ic: '📄', skill: 'whitepaper', about: 'Executive summary, the problem, a sequence, evidence and next steps' },
  };
  const TONES = ['Direct', 'Formal', 'Warm'];
  const LENGTHS = ['Short', 'Medium', 'Long'];
  const AUDIENCE = {
    Modernisation: 'Sites planning a control system migration', Inquiry: 'Accounts that asked us a question',
    'Service renewal': 'Customers with a renewal coming up', Project: 'Teams starting a new project',
    Leadership: 'Newly appointed plant leaders', Engagement: 'Accounts reading our content',
  };
  const PERSONA = { Modernisation: 'plant and automation managers', Inquiry: 'engineering teams', 'Service renewal': 'site maintenance leads',
    Project: 'project and design leads', Leadership: 'new plant leaders', Engagement: 'operations teams' };
  // Words in a request that point at a micro-segment's audience.
  const SEG_WORDS = [['Modernisation', /migrat|legacy|moderni[sz]|end of support|end-of-support|upgrade|obsolete/i],
    ['Service renewal', /renew|service contract|support contract|lifecycle|cover/i], ['Project', /project|expansion|greenfield|front-end design|new plant|design/i],
    ['Leadership', /new (plant )?(leader|manager|director)|first 100|appointed|priorit/i], ['Inquiry', /inquir|enquir|quote|asked/i],
    ['Engagement', /webinar|newsletter|engag|content/i]];

  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const lc = s => { s = String(s || '').trim(); return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; };
  const noDot = s => String(s || '').trim().replace(/[.?!]+$/, '');
  const cited = c => `${c.claim} [${c.type}, ${c.year}]`;
  function who() {
    try { const r = localStorage.getItem('demandai_role') || 'Sales manager';
      return (typeof ROLE_PERSON !== 'undefined' && ROLE_PERSON[r]) || { Admin: 'Rajiv Nair', 'Sales manager': 'Pavan Kumar', 'Sales rep': 'Sofia Ahlgren' }[r] || 'Pavan Kumar';
    } catch (e) { return 'Pavan Kumar'; }
  }
  const brandTone = () => (E.brandPack().voice || {}).preset || 'Direct';

  /* ─── The writer's instructions per type: sections by length, headings, and the words for each part ─── */
  const LAYOUT = {
    blog:       { Short: ['title', 'intro', 'why', 'proof', 'cta'], Medium: ['title', 'intro', 'why', 'questions', 'proof', 'objection', 'cta'],
                  Long: ['title', 'intro', 'why', 'steps', 'questions', 'proof', 'objection', 'pitfalls', 'cta'] },
    whitepaper: { Short: ['title', 'summary', 'challenge', 'steps', 'proof', 'cta'], Medium: ['title', 'summary', 'challenge', 'good', 'steps', 'proof', 'questions', 'cta'],
                  Long: ['title', 'summary', 'challenge', 'good', 'steps', 'pitfalls', 'proof', 'questions', 'objection', 'cta'] },
  };
  const HEAD = {
    why: ['Why it matters now', 'Why now, not later'], questions: ['Questions worth asking', 'Questions for your team'],
    proof: ['What comparable sites did', 'Evidence from comparable sites'], objection: ['A common concern', 'What we often hear'],
    cta: ['Next step', 'Where to start'], steps: ['A practical sequence', 'How to sequence the work'], pitfalls: ['Where plans slip', 'What to watch for'],
    summary: ['Executive summary', 'In brief'], challenge: ['The challenge', 'What makes it hard'], good: ['What good looks like', 'The outcome to aim for'],
  };
  const LIST_ROLES = { questions: 'ul', steps: 'ol' };
  const GEN = {
    title: (c, v) => [c.it.title, `${cap(c.topic)}: what to settle first`, `What comparable sites learned about ${lc(c.topic)}`][v % 3],
    intro: (c, v) => [
      `Most ${c.persona} we work with know the moment is coming. The question is whether they set the timing, or the timing is set for them. This post covers what to settle first, and what comparable sites did.`,
      `${cap(c.topic)} rarely starts as a project. It starts as a question someone on site asks, and it's easier to answer while there's still time to plan. Here is how we'd approach it.`,
      `If ${lc(c.topic)} is on your list this year, you're not alone. The sites that handled it well made a few decisions early. This post walks through them.`][v % 3],
    why: (c, v) => [
      `Timing is the hidden cost. Decide early, and the decision stays in your hands: the work fits a window you choose, the people you need are booked, and nothing is rushed.`,
      `Waiting rarely makes the decision easier. The options narrow as dates get closer, and the work ends up scheduled around constraints rather than around the plant.`,
      `The earlier the question is asked, the more options there are. Planning early turns a forced change into a planned one.`][v % 3],
    questions: (c, v) => [c.fw.questions.slice(), c.fw.questions.concat(['Who else needs to be part of the decision?']),
      ['What has changed on site in the last two years?'].concat(c.fw.questions.slice(0, 2))][v % 3],
    proof: (c, v) => { const cl = c.claims.map(cited);
      return [cl.join(' '), 'One example says more than a list of features. ' + cl.join(' '), cl.slice().reverse().join(' ') + ' Your account team can share the full story.'][v % 3]; },
    objection: (c, v) => [`"${noDot(c.fw.objection)}." ${c.fw.response}`, `We often hear: "${noDot(c.fw.objection)}." ${c.fw.response}`,
      `It's fair to ask whether now is the time. ${c.fw.response}`][v % 3],
    cta: (c, v) => [
      'If this is on your list, a short conversation is a good place to start. We can share how comparable sites sequenced the work, and what they would do differently.',
      'Start with one question: what would we need to know to plan this properly? If it helps, we can walk through it with your team.',
      'Talk to your account team about where to start. A short call is usually enough to see whether it is worth planning now.'][v % 3],
    steps: (c, v) => [
      ['Agree the window you want to work in.', 'List what has to keep running, and what can stop.', 'Settle the scope with the people who will run it.', 'Plan the cutover, and the way back if something goes wrong.'],
      ['Write down the date you cannot move.', 'Work back from it to the decisions you need.', 'Name one owner for each decision.'],
      ['Start with what the site needs to keep doing.', 'Agree the scope before the design is fixed.', 'Book the people who know the current system.', 'Choose the window, then plan backwards.']][v % 3],
    pitfalls: (c, v) => [
      'Plans slip in predictable places. The scope grows after the design is fixed, the people who know the old system are not in the room, or the window is agreed before the work is understood. Naming these early is most of the cure.',
      'Most delays trace back to one of three things: a scope that keeps moving, missing knowledge of the current system, or a window agreed too late.'][v % 2],
    summary: (c, v) => [
      `${cap(c.topic)} is a decision most ${c.persona} will face. This paper sets out what to decide first, a practical sequence, and what comparable sites did.`,
      `This paper is for ${c.persona} looking at ${lc(c.topic)}. It covers the decisions to make early and how comparable sites approached them.`][v % 2],
    challenge: (c, v) => [
      "The difficulty is rarely technical. It's timing, scope and people: deciding before the date is forced, agreeing what is in and out, and keeping the people who know the site involved.",
      'Every site has a version of the same problem. The current setup still runs, the people who know it are busy, and the next window is closer than it looks.'][v % 2],
    good: (c, v) => [
      'A good outcome looks ordinary. The work fits a window the site chose, the team knows the plan, and nothing surprises operations.',
      'The aim is a change that operations barely notice: planned, scoped with the people who run the plant, and finished inside the window.'][v % 2],
  };
  // Extra sentences when asked for more detail (no product claims).
  const MORE = ['That is usually where the real decisions sit.', 'It helps to write the answer down and share it with the people who run the plant.',
    'Comparable sites found it easier once one person owned the plan.', 'None of this needs a decision today, only a date to decide by.'];
  const CONTRACT = [[/\bI'm\b/g, 'I am'], [/\bit's\b/g, 'it is'], [/\bIt's\b/g, 'It is'], [/\byou're\b/g, 'you are'], [/\bYou're\b/g, 'You are'],
    [/\bdon't\b/g, 'do not'], [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'], [/\bwe'll\b/g, 'we will'], [/\bwe'd\b/g, 'we would'],
    [/\byou'd\b/g, 'you would'], [/\bWhat's\b/g, 'What is'], [/\bthat's\b/g, 'that is'], [/\bthere's\b/g, 'there is'], [/\bwe're\b/g, 'we are'],
    [/\baren't\b/g, 'are not'], [/\bisn't\b/g, 'is not'], [/\bThey're\b/g, 'They are'], [/\bthey're\b/g, 'they are']];
  function toneize(text, tone, role) {
    if (Array.isArray(text)) return text.map(t => toneize(t, tone, role));
    let t = String(text);
    if (tone === 'Formal') for (const [a, b] of CONTRACT) t = t.replace(a, b);
    if (tone === 'Warm') { if (role === 'intro' || role === 'summary') t += ' We hope it helps.'; if (role === 'cta') t += ' We would be glad to help.'; }
    return t;
  }
  function ctxOf(it) {
    const pack = E.brandPack();
    const fw = (pack.framework && pack.framework[it.seg]) || E.PLAYBOOK[it.seg] || E.PLAYBOOK.Engagement;
    return { it, fw, claims: E.approvedClaims().filter(c => (it.sources || []).includes(c.id)), topic: it.topic || it.title, persona: PERSONA[it.seg] || 'teams' };
  }
  function genBlock(c, role, v) {
    return { tag: role === 'title' ? 'h1' : LIST_ROLES[role] || 'p', role, v, text: toneize(GEN[role](c, v), c.it.tone, role) };
  }
  function generate(it) {
    const c = ctxOf(it), out = [];
    for (const role of LAYOUT[it.type][it.length]) {
      if (role === 'proof' && !c.claims.length) continue;      // no approved source, no proof section
      if (HEAD[role]) out.push({ tag: 'h2', role: 'h:' + role, v: 0, text: HEAD[role][0] });
      out.push(genBlock(c, role, 0));
    }
    return out;
  }
  function blockInner(b) {
    if (b.tag === 'ul' || b.tag === 'ol') return b.text.map(i => `<li>${esc(i)}</li>`).join('');
    return esc(b.text).replace(/\n/g, '<br>');
  }
  const blockHtml = b => `<${b.tag} data-b="${uid()}" data-role="${b.role}" data-v="${b.v || 0}">${blockInner(b)}</${b.tag}>`;
  const docHtml = blocks => blocks.map(blockHtml).join('');

  /* ─── Reading a request: type, topic, audience, tone and length ─── */
  function parseBrief(q, typeHint) {
    const s = String(q || '').trim();
    const type = /white\s?-?paper/i.test(s) ? 'whitepaper' : /\b(blog|article|post)\b/i.test(s) ? 'blog' : (typeHint || 'blog');
    const forM = s.match(/\bfor\s+(.+?)(?:[,.;]|\s+(?:in|with|that|and keep|keep it)\b|$)/i);
    let topic = '';
    const onM = s.match(/\b(?:on|about|covering|around)\s+(.+?)(?:\s+for\s+|[,.;]|\s+(?:in a|with a|keep it)\b|$)/i);
    if (onM) topic = onM[1];
    else topic = s.replace(/\b(please|can you|could you|write|draft|create|generate|make|me|us|a|an|the|new|short|long|detailed|formal|warm|friendly|blog|post|article|white\s?-?paper)\b/gi, ' ')
      .replace(forM ? forM[0] : '', ' ').replace(/\s+/g, ' ').trim();
    topic = topic.replace(/^(on|about)\s+/i, '').replace(/[.?!]+$/, '').trim();
    const hay = s + ' ' + (forM ? forM[1] : '');
    const seg = (SEG_WORDS.find(([, re]) => re.test(hay)) || ['Modernisation'])[0];
    const tone = /\bformal|professional\b/i.test(s) ? 'Formal' : /\bwarm|friendly\b/i.test(s) ? 'Warm' : brandTone();
    const length = /\b(short|brief|quick)\b/i.test(s) ? 'Short' : /\b(long|detailed|in-depth|comprehensive|thorough)\b/i.test(s) ? 'Long' : 'Medium';
    return { type, topic, seg, tone, length, audienceText: forM ? forM[1].trim() : '', ok: topic.split(/\s+/).filter(w => w.length > 2).length >= 2 };
  }

  /* ─── Store ─── */
  let S = null;
  function load() { try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; } return S; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { return false; } }
  function newItem(o) {
    const it = Object.assign({ id: uid(), type: 'blog', title: '', topic: '', seg: 'Modernisation', tone: brandTone(), length: 'Medium', sources: null,
      status: 'Draft', brandV: E.brandPack().v, created: Date.now(), updated: Date.now(), by: who() }, o);
    if (!it.sources) it.sources = E.approvedClaims().filter(c => c.segments.includes(it.seg)).map(c => c.id);
    if (!it.title) it.title = cap(it.topic);
    if (!it.html) it.html = docHtml(generate(it));
    return it;
  }
  function textOfHtml(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    return Array.from(d.children).map(el => (el.tagName === 'UL' || el.tagName === 'OL') ? Array.from(el.children).map(li => li.textContent).join('\n') : el.textContent).join('\n');
  }
  const checksOf = it => E.checkContent(textOfHtml(it.html));
  const citedIn = it => checksOf(it).claims.filter(c => c.verified).map(c => c.source.split(' · ')[0]);
  function summaryFor(it) {
    const used = citedIn(it), chk = checksOf(it), n = chk.flags.length + chk.unsupported.length;
    return `Done. I used the ${TYPES[it.type].skill} instructions and Brand v${it.brandV} (${it.tone} voice). ` +
      (used.length ? `It cites ${used.join(', ')} word for word from the approved sources. ` : 'It makes no product claims. ') +
      (n ? `${n} brand check${n > 1 ? 's' : ''} need a look.` : 'All brand checks pass.') +
      `\n\nTell me what to change, or click a paragraph in the canvas to change just that one. Add it to the Content library when it's right; reps can then add it to an email or LinkedIn message in Micro-segments & NBA.`;
  }
  function seed() {
    const d = n => Date.now() - n * 864e5;
    const mk = (o, ask, at) => {
      const it = newItem(Object.assign({ created: at, updated: at }, o)), conv = { id: uid(), updated: at, active: it.id, items: [it.id],
        msgs: [{ who: 'me', text: ask, by: it.by, at }, { who: 'ai', card: it.id, at }, { who: 'ai', text: summaryFor(it), at }] };
      it.conv = conv.id; return { it, conv };
    };
    const a = mk({ type: 'blog', title: 'Plan the migration before end of support sets the date', topic: 'control system migration', seg: 'Modernisation', status: 'Ready', by: 'Pavan Kumar' }, 'Write a blog on control system migration for plant managers with legacy systems', d(4));
    const b = mk({ type: 'whitepaper', title: 'Modernising legacy control systems: a planning guide', topic: 'legacy control system modernisation', seg: 'Modernisation', length: 'Long', by: 'Pavan Kumar',
      sources: ['CS-01', 'OP-02', 'BR-03'] }, 'A detailed whitepaper about legacy control system modernisation for plant managers', d(2));
    const c = mk({ type: 'blog', title: 'Renewal season: check the cover still fits', topic: 'service contract renewal', seg: 'Service renewal', length: 'Short', by: 'Sofia Ahlgren', status: 'Ready' }, 'Short blog on service contract renewal for customers with a renewal coming up', d(1));
    S = { v: 2, items: [a.it, b.it, c.it], convs: [a.conv, b.conv, c.conv] };
    save();
  }
  // Loaded once per page, so every screen part edits the same copy.
  function ensure() { if (!S) load(); if (!S || !S.items) seed(); return S; }
  const items = () => ensure().items;
  const itemOf = id => items().find(i => i.id === id);

  /* ─── A small picker, styled inline so it works on any screen ─── */
  function modal(title, body, onSave, saveLabel) {
    const old = document.getElementById('clModal'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'clModal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(20,26,33,.42);display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px;z-index:900;overflow-y:auto';
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(20,26,33,.14);width:100%;max-width:560px;font-family:var(--fb, sans-serif)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #E5E9EE"><div style="font-family:var(--fd, sans-serif);font-size:15px;font-weight:700;color:#141A21">${title}</div>
        <button id="clX" style="font-size:15px;color:#4A5664;border:none;background:none;cursor:pointer">✕</button></div>
      <div style="padding:14px 20px;max-height:60vh;overflow-y:auto">${body}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #E5E9EE">
        <button id="clCancel" class="btn btn-ghost btn-sm">Cancel</button>${onSave ? `<button id="clSave" class="btn btn-primary btn-sm">${saveLabel || 'Save'}</button>` : ''}</div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelector('#clX').onclick = close; ov.querySelector('#clCancel').onclick = close;
    if (onSave) ov.querySelector('#clSave').onclick = () => { onSave(ov); close(); };
    return ov;
  }
  const row = (val, checked, title, sub, extra) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border:1px solid #E5E9EE;border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:12.5px;color:#141A21">
      <input type="checkbox" value="${esc(val)}" ${checked ? 'checked' : ''} style="margin-top:2px"><div style="flex:1;min-width:0"><div style="font-weight:600">${title}</div>${sub ? `<div style="font-size:11.5px;color:#9DA8B5;margin-top:2px">${sub}</div>` : ''}</div>${extra || ''}</label>`;
  /* ─── Word (.docx) with minimal branding: a rule under the title, underlined headings, the client name in the header ─── */
  const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function runs(node, fmt, out) {
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { if (n.textContent) out.push({ t: n.textContent, ...fmt }); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'BR') { out.push({ br: true }); return; }
      const f = Object.assign({}, fmt);
      if (tag === 'B' || tag === 'STRONG') f.b = true;
      if (tag === 'I' || tag === 'EM') f.i = true;
      if (tag === 'U') f.u = true;
      if (tag === 'A') { f.u = true; f.color = BRAND_HEX; }
      runs(n, f, out);
    });
    return out;
  }
  function rXml(r, base) {
    if (r.br) return '<w:r><w:br/></w:r>';
    const f = Object.assign({}, base, r);
    return `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${f.b ? '<w:b/>' : ''}${f.i ? '<w:i/>' : ''}${f.u ? `<w:u w:val="single" w:color="${f.ucolor || BRAND_HEX}"/>` : ''}<w:color w:val="${f.color || '1D242C'}"/><w:sz w:val="${f.sz || 22}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(f.t)}</w:t></w:r>`;
  }
  const pXml = (rs, base, ppr) => `<w:p><w:pPr>${ppr || ''}</w:pPr>${rs.map(r => rXml(r, base)).join('')}</w:p>`;
  function docxXml(it, html) {
    const box = document.createElement('div'); box.innerHTML = html;
    const sp = (b, a) => `<w:spacing w:before="${b}" w:after="${a}" w:line="300" w:lineRule="auto"/>`;
    const date = new Date(it.updated || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const body = [];
    Array.from(box.children).forEach(el => {
      const t = el.tagName;
      if (t === 'H1') {
        body.push(pXml(runs(el, {}, []), { b: true, sz: 44, color: '141A21' }, sp(0, 80) + `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${BRAND_HEX}"/></w:pBdr>`));
        body.push(pXml([{ t: `${TYPES[it.type].label} · Client · ${date}` }], { sz: 18, color: '7A8592' }, sp(60, 240)));
      } else if (t === 'H2' || t === 'H3') {
        body.push(pXml(runs(el, {}, []), { b: true, sz: 28, color: '141A21', u: true }, sp(280, 100) + '<w:keepNext/>'));
      } else if (t === 'UL' || t === 'OL') {
        Array.from(el.children).forEach((li, i) => body.push(pXml([{ t: t === 'OL' ? `${i + 1}.  ` : '•  ', color: BRAND_HEX, b: true }].concat(runs(li, {}, [])), {}, sp(0, 80) + '<w:ind w:left="567" w:hanging="340"/>')));
      } else if (t === 'BLOCKQUOTE') {
        body.push(pXml(runs(el, { i: true }, []), { color: '4A5664' }, sp(60, 160) + `<w:ind w:left="400"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="${BRAND_HEX}"/></w:pBdr>`));
      } else {
        const rs = runs(el, {}, []); if (rs.length) body.push(pXml(rs, {}, sp(0, 160)));
      }
    });
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1300" w:left="1300" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const hdr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${pXml([{ t: 'Client' }], { b: true, sz: 18, color: BRAND_HEX }, '<w:jc w:val="right"/>')}</w:hdr>`;
    const grey = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="7A8592"/><w:sz w:val="16"/></w:rPr>';
    const ftr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${grey}<w:t xml:space="preserve">${xmlEsc(it.title)} · Page </w:t></w:r><w:r>${grey}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${grey}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${grey}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${grey}<w:t>1</w:t></w:r><w:r>${grey}<w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    return { doc, hdr, ftr };
  }
  async function docxBlob(it, html) {
    if (typeof JSZip === 'undefined') throw new Error('The Word writer did not load');
    const x = docxXml(it, html || it.html), z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(it.title)}</dc:title><dc:creator>Client</dc:creator></cp:coreProperties>`);
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>');
    z.file('word/document.xml', x.doc); z.file('word/header1.xml', x.hdr); z.file('word/footer1.xml', x.ftr);
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  const fileName = (it, ext) => ((it.title || 'content').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'content') + '.' + ext;
  // On claude.ai the viewer confirms a save; opened as a plain file, it downloads directly.
  async function saveFile(name, data, toast) {
    let dl = null;
    try { dl = root.claude && root.claude.use ? await root.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (!dl) { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); return; }
    try { await dl.save({ filename: name, data }); if (toast) toast(name + ' saved'); }
    catch (e) { if (e && e.code === 'declined') return; if (toast) toast(e && e.code === 'rate_limited' ? 'A save is already open' : "This view can't save files"); }
  }
  async function downloadDocx(itemId, html, toast) {
    const it = itemOf(itemId);
    try { await saveFile(fileName(it, 'docx'), await docxBlob(it, html), toast); } catch (e) { if (toast) toast(e.message || "Couldn't build the Word file"); }
  }

  /* ─── In the email or LinkedIn message (Micro-segments & NBA, For Review) ─── */
  // How many outreach messages a piece has been added to, across the saved micro-segment runs.
  function usage(id) {
    let n = 0;
    (E.loadSegmentations() || []).forEach(r => Object.values(r.decisions || {}).forEach(d => { if ((d.content || []).includes(id)) n++; }));
    return n;
  }
  // The bar at the top of the message box: one button, and the content already added.
  function messageBar(key, ids, channel, canEdit) {
    const list = (ids || []).map(itemOf).filter(Boolean);
    const chip = it => `<span style="display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 6px 4px 9px;border:1px solid var(--brand-mid);background:var(--brand-lt);border-radius:8px;font-size:11.5px;color:var(--brand-dk)">
        <span>${channel === 'LinkedIn' ? '🔗' : '📎'}</span><a href="15-content-studio.html?item=${it.id}" target="_blank" style="color:var(--brand-dk);font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(channel === 'LinkedIn' ? it.title : fileName(it, 'docx'))}</a>
        <span style="color:var(--i3)">${TYPES[it.type].label}</span>${canEdit ? `<button title="Remove" onclick="removeContent('${key}','${it.id}')" style="border:none;background:none;cursor:pointer;color:var(--i3);font-size:12px">✕</button>` : ''}</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;margin:-2px 0 8px">
        <span style="font-size:11px;color:var(--i3);flex:1">${list.length ? (channel === 'LinkedIn' ? 'Shared as a link in the note' : 'Attached to the email') : 'No content added'}</span>
        ${canEdit ? `<button class="btn btn-sec btn-sm" onclick="ContentLink.pickForMessage('${key}')">📎 Add content</button>` : ''}</div>
      ${list.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${list.map(chip).join('')}</div>` : ''}`;
  }
  /* ─── Adding content to a message: a focus screen. One choice can reach every account that gets the same
     action in the micro-segment, so the screen shows exactly which messages change before anything does. ─── */
  let FX = null;
  function fxCss() {
    if (document.getElementById('fxCss')) return;
    const st = document.createElement('style'); st.id = 'fxCss';
    st.textContent = `.fx-ov{position:fixed;inset:0;background:rgba(20,26,33,.5);z-index:700;display:flex;padding:24px;}
.fx-w{flex:1;background:var(--surf,#fff);border-radius:14px;box-shadow:0 20px 60px rgba(20,26,33,.3);display:flex;flex-direction:column;overflow:hidden;font-family:var(--fb);}
.fx-h{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border,#E5E9EE);}
.fx-h b{font-family:var(--fd);font-size:16px;color:var(--i1,#141A21);} .fx-h span{font-size:12px;color:var(--i3,#7A8592);flex:1;}
.fx-x{border:none;background:none;font-size:18px;color:var(--i3,#7A8592);cursor:pointer;}
.fx-b{flex:1;display:grid;grid-template-columns:minmax(260px,1fr) minmax(320px,1.3fr) minmax(300px,1.1fr);min-height:0;}
.fx-col{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border,#E5E9EE);} .fx-col:last-child{border-right:none;}
.fx-ch{padding:12px 16px 8px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--i3,#7A8592);}
.fx-sc{flex:1;overflow-y:auto;padding:0 16px 16px;}
.fx-tools{display:flex;gap:6px;padding:0 16px 10px;flex-wrap:wrap;}
.fx-tools input{flex:1;min-width:140px;padding:7px 10px;border:1px solid var(--bdk,#CBD2DA);border-radius:8px;font-size:12.5px;}
.fx-pill{padding:5px 10px;border:1px solid var(--border,#E5E9EE);border-radius:999px;background:#fff;font-size:11.5px;color:var(--i2,#4A5664);cursor:pointer;}
.fx-pill.on{border-color:var(--brand,#7D52A2);background:var(--brand-lt,#F0EBF8);color:var(--brand-dk,#5E3A80);font-weight:600;}
.fx-it{display:flex;gap:10px;padding:10px 11px;border:1px solid var(--border,#E5E9EE);border-radius:10px;margin-bottom:7px;cursor:pointer;background:#fff;}
.fx-it:hover{border-color:var(--brand-mid,#C9B3E8);} .fx-it.cur{border-color:var(--brand,#7D52A2);box-shadow:0 0 0 2px var(--brand-lt,#F0EBF8);}
.fx-it.off{opacity:.5;cursor:default;} .fx-it input{margin-top:3px;accent-color:var(--brand,#7D52A2);}
.fx-it b{display:block;font-size:12.5px;color:var(--i1,#141A21);line-height:1.35;} .fx-it small{font-size:11px;color:var(--i3,#7A8592);}
.fx-fit{display:inline-block;margin-top:4px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:#E3F4EC;color:#1F6B4A;}
.fx-pv h3{font-family:var(--fd);font-size:17px;color:var(--i1,#141A21);margin:4px 0 8px;line-height:1.3;}
.fx-pv p{font-size:12.5px;color:var(--i2,#4A5664);line-height:1.6;margin:0 0 8px;}
.fx-kv{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--s75,#EEF1F4);font-size:12px;} .fx-kv span{width:110px;color:var(--i3,#7A8592);flex-shrink:0;} .fx-kv b{font-weight:500;color:var(--i1,#141A21);}
.fx-kv b{display:flex;flex-wrap:wrap;gap:4px;align-items:center;}
.fx-cl{display:inline-block;flex:0 0 auto;width:auto;font-family:var(--fm,monospace);font-size:11px;padding:1px 6px;border-radius:5px;background:var(--brand-lt,#F0EBF8);color:var(--brand-dk,#5E3A80);font-weight:600;margin-right:3px;}
.fx-scope{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;}
.fx-opt{display:flex;gap:10px;padding:10px 12px;border:1px solid var(--border,#E5E9EE);border-radius:10px;cursor:pointer;font-size:12.5px;color:var(--i1,#141A21);}
.fx-opt.on{border-color:var(--brand,#7D52A2);background:#FCFAFE;} .fx-opt input{accent-color:var(--brand,#7D52A2);margin-top:2px;}
.fx-opt small{display:block;font-size:11.5px;color:var(--i3,#7A8592);margin-top:2px;line-height:1.4;}
.fx-acc{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--s75,#EEF1F4);font-size:12px;color:var(--i1,#141A21);}
.fx-acc b{flex:1;min-width:0;font-weight:600;} .fx-acc em{font-style:normal;font-size:10.5px;padding:1px 7px;border-radius:999px;background:var(--s75,#EEF1F4);color:var(--i2,#4A5664);white-space:nowrap;}
.fx-acc em.big{background:#FFF1E0;color:#8A4B00;} .fx-acc em.sent{background:#E3F4EC;color:#1F6B4A;}
.fx-msg{margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--s50,#F7F8FA);font-size:12px;color:var(--i2,#4A5664);line-height:1.5;white-space:pre-wrap;}
.fx-f{display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid var(--border,#E5E9EE);background:var(--s50,#F7F8FA);}
.fx-f span{flex:1;font-size:12.5px;color:var(--i1,#141A21);}
.fx-warn{margin-top:10px;padding:8px 10px;border-radius:8px;background:#FFF7E8;border:1px solid #F3D9A4;color:#7A4B00;font-size:12px;line-height:1.45;}
@media (max-width:1100px){ .fx-b{grid-template-columns:1fr 1fr;} .fx-col.pv{display:none;} }`;
    document.head.appendChild(st);
  }
  // The other messages that get the same action in the same micro-segment: one content choice reaches all of them.
  function sameAction(key) {
    if (typeof RUN === 'undefined' || !RUN || typeof recOf !== 'function') return [];
    const r = recOf(key); if (!r) return [];
    const seg = typeof segOf === 'function' ? segOf(r) : r.segment, act = typeof chosenAction === 'function' ? chosenAction(r) : r.action;
    return RUN.seg.recs.filter(x => x.key !== key && (typeof segOf === 'function' ? segOf(x) : x.segment) === seg && seg && (typeof chosenAction === 'function' ? chosenAction(x) : x.action) === act);
  }
  function pickForMessage(key) {
    if (typeof dec !== 'function') return;
    fxCss();
    const r = recOf(key), seg = typeof segOf === 'function' ? segOf(r) : r.segment;
    FX = { key, sel: new Set(dec(key).content || []), cur: null, q: '', type: '', fits: false, scope: 'one', seg };
    const ready = items().filter(it => it.status === 'Ready');
    FX.cur = [...FX.sel][0] || (ready.find(it => it.seg === seg) || ready[0] || {}).id || null;
    let ov = document.getElementById('fxOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'fxOv'; ov.className = 'fx-ov'; document.body.appendChild(ov); ov.addEventListener('click', e => { if (e.target === ov) fxClose(); }); }
    ov.style.display = 'flex'; fxDraw();
    document.addEventListener('keydown', fxKey);
  }
  const fxKey = e => { if (e.key === 'Escape') fxClose(); };
  function fxClose() { const ov = document.getElementById('fxOv'); if (ov) ov.style.display = 'none'; document.removeEventListener('keydown', fxKey); FX = null; }
  function fxDraw() {
    if (!FX) return;
    const key = FX.key, r = recOf(key), lr = typeof liveRec === 'function' ? liveRec(r) : r, x = typeof draftOf === 'function' ? draftOf(r) : {};
    const all = items().slice().sort((a, b) => (a.status === 'Ready' ? 0 : 1) - (b.status === 'Ready' ? 0 : 1) || (b.seg === FX.seg) - (a.seg === FX.seg) || b.updated - a.updated);
    const q = FX.q.toLowerCase(), list = all.filter(it => (!q || (it.title + ' ' + it.topic).toLowerCase().includes(q)) && (!FX.type || it.type === FX.type) && (!FX.fits || it.seg === FX.seg));
    const cur = itemOf(FX.cur), others = sameAction(key), targets = FX.scope === 'all' ? [r].concat(others) : [r];
    const sent = t => { const d = dec(t.key); return !!(d.outcome || d.copiedAt); };
    const big = t => { const ds = E.estimateDealSize && E.estimateDealSize(t.account); return t.account.existingCustomer ? 'Existing customer' : ds && !ds.below ? `~USD ${Math.round(ds.value / 1000)}k` : ''; };
    const para = it => { const d = document.createElement('div'); d.innerHTML = it.html; return Array.from(d.querySelectorAll('p')).slice(0, 2).map(p => p.textContent); };
    const selItems = [...FX.sel].map(itemOf).filter(Boolean);
    const att = x.channel === 'LinkedIn' ? selItems.map(it => `Link: ${it.title}`).join('\n') : selItems.map(it => `Attached: ${fileName(it, 'docx')}`).join('\n');
    document.getElementById('fxOv').innerHTML = `<div class="fx-w" role="dialog" aria-label="Add content to the message">
      <div class="fx-h"><b>Add content to the message</b><span>${esc(lr.contact.name)} · ${esc(r.account.name)} · ${esc(x.channel || '')}${FX.seg ? ` · ${esc(FX.seg)}` : ''}</span><button class="fx-x" onclick="ContentLink.fxClose()" aria-label="Close">✕</button></div>
      <div class="fx-b">
        <div class="fx-col"><div class="fx-ch">Content library</div>
          <div class="fx-tools"><input placeholder="Search content" value="${esc(FX.q)}" oninput="ContentLink.fxSet('q', this.value, true)">
            ${[['', 'All'], ['blog', 'Blogs'], ['whitepaper', 'Whitepapers']].map(([k, l]) => `<button class="fx-pill ${FX.type === k ? 'on' : ''}" onclick="ContentLink.fxSet('type','${k}')">${l}</button>`).join('')}
            ${FX.seg ? `<button class="fx-pill ${FX.fits ? 'on' : ''}" onclick="ContentLink.fxSet('fits', ${!FX.fits})">Fits ${esc(FX.seg)}</button>` : ''}</div>
          <div class="fx-sc">${list.map(it => it.status === 'Ready'
            ? `<div class="fx-it ${FX.cur === it.id ? 'cur' : ''}" onclick="ContentLink.fxSet('cur','${it.id}')"><input type="checkbox" ${FX.sel.has(it.id) ? 'checked' : ''} onclick="event.stopPropagation();ContentLink.fxToggle('${it.id}', this.checked)" aria-label="Add ${esc(it.title)}">
                <div><b>${esc(it.title)}</b><small>${TYPES[it.type].label} · ${esc(AUDIENCE[it.seg] || it.seg)} · in ${usage(it.id)} message${usage(it.id) === 1 ? '' : 's'}</small>${it.seg === FX.seg ? `<div><span class="fx-fit">Fits ${esc(FX.seg)}</span></div>` : ''}</div></div>`
            : `<div class="fx-it off" title="Not in the library yet"><input type="checkbox" disabled><div><b>${esc(it.title)}</b><small>Draft: add it to the Content library first, from Content studio</small></div></div>`).join('')
            || '<div style="font-size:12.5px;color:#7A8592;padding:10px 0">Nothing matches. <a href="15-content-studio.html" style="color:#7D52A2">Write it in Content studio</a>.</div>'}</div></div>
        <div class="fx-col pv"><div class="fx-ch">Preview</div><div class="fx-sc fx-pv">${cur ? `<small style="font-size:11px;color:#7A8592">${TYPES[cur.type].label} · ${esc(cur.by)}</small><h3>${esc(cur.title)}</h3>${para(cur).map(t => `<p>${esc(t)}</p>`).join('')}
            <div class="fx-kv"><span>Written for</span><b>${esc(AUDIENCE[cur.seg] || cur.seg)}</b></div>
            <div class="fx-kv"><span>Approved claims</span><b>${citedIn(cur).map(id => `<span class="fx-cl">${esc(id)}</span>`).join('') || 'No product claims'}</b></div>
            <div class="fx-kv"><span>Brand checks</span><b>${(() => { const c = checksOf(cur), n = c.flags.length + c.unsupported.length; return n ? `${n} to fix` : 'All pass'; })()} · Brand v${cur.brandV}</b></div>
            <div class="fx-kv"><span>Already in</span><b>${usage(cur.id)} message${usage(cur.id) === 1 ? '' : 's'}</b></div>
            <div style="margin-top:10px">${FX.sel.has(cur.id) ? `<button class="btn btn-sec btn-sm" onclick="ContentLink.fxToggle('${cur.id}', false)">Remove from the message</button>` : cur.status === 'Ready' ? `<button class="btn btn-primary btn-sm" onclick="ContentLink.fxToggle('${cur.id}', true)">Add to the message</button>` : ''}
              <a class="btn btn-ghost btn-sm" href="15-content-studio.html?item=${cur.id}" target="_blank" style="text-decoration:none">Open in Content studio ↗</a></div>` : '<div style="font-size:12.5px;color:#7A8592">Pick a piece on the left to preview it.</div>'}</div></div>
        <div class="fx-col"><div class="fx-ch">Where it goes</div><div class="fx-sc">
          <div class="fx-scope">
            <label class="fx-opt ${FX.scope === 'one' ? 'on' : ''}"><input type="radio" name="fxs" ${FX.scope === 'one' ? 'checked' : ''} onchange="ContentLink.fxSet('scope','one')"><span>Only this message<small>${esc(lr.contact.name)} at ${esc(r.account.name)}</small></span></label>
            ${others.length ? `<label class="fx-opt ${FX.scope === 'all' ? 'on' : ''}"><input type="radio" name="fxs" ${FX.scope === 'all' ? 'checked' : ''} onchange="ContentLink.fxSet('scope','all')"><span>Every message with this action in ${esc(FX.seg)}<small>${others.length + 1} accounts get “${esc(typeof chosenAction === 'function' ? chosenAction(r) : r.action)}”</small></span></label>` : `<div style="font-size:11.5px;color:#7A8592">No other account in ${esc(FX.seg || 'this list')} gets the same action, so only this message changes.</div>`}
          </div>
          <div class="fx-ch" style="padding:4px 0 2px">${targets.length} message${targets.length === 1 ? '' : 's'} will change</div>
          ${targets.map(t => `<div class="fx-acc"><b>${esc(t.account.name)}</b>${big(t) ? `<em class="big">${esc(big(t))}</em>` : ''}${sent(t) ? '<em class="sent">already sent</em>' : ''}</div>`).join('')}
          ${FX.scope === 'all' && targets.some(sent) ? `<div class="fx-warn">${targets.filter(sent).length} of these went out already. The content is added for the record; it doesn't reach them again.</div>` : ''}
          ${FX.scope === 'all' && targets.filter(big).length ? `<div class="fx-warn">${targets.filter(big).length} of these are large accounts. Check the piece fits each of them before you apply.</div>` : ''}
          <div class="fx-ch" style="padding:12px 0 2px">In the ${esc((x.channel || 'message').toLowerCase())}</div>
          <div class="fx-msg">${selItems.length ? esc(att) : 'Nothing added yet.'}</div>
        </div></div>
      </div>
      <div class="fx-f"><span>${selItems.length ? `<b>${selItems.length}</b> piece${selItems.length === 1 ? '' : 's'} · <b>${targets.length}</b> message${targets.length === 1 ? '' : 's'}` : 'No content selected'}</span>
        <button class="btn btn-ghost btn-sm" onclick="ContentLink.fxClose()">Cancel</button><button class="btn btn-primary btn-sm" onclick="ContentLink.fxApply()">${FX.scope === 'all' ? `Apply to ${targets.length} messages` : 'Apply to this message'}</button></div>
    </div>`;
    if (FX.focusQ) { const i = document.querySelector('.fx-tools input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } FX.focusQ = false; }
  }
  function fxSet(k, v, keepFocus) { if (!FX) return; FX[k] = v; if (keepFocus) FX.focusQ = true; fxDraw(); }
  function fxToggle(id, on) { if (!FX) return; if (on) FX.sel.add(id); else FX.sel.delete(id); FX.cur = id; fxDraw(); }
  function fxApply() {
    if (!FX) return;
    const key = FX.key, ids = [...FX.sel], others = FX.scope === 'all' ? sameAction(key) : [];
    // The other messages keep what they had and gain the pieces chosen here.
    others.forEach(t => setDec(t.key, { content: [...new Set((dec(t.key).content || []).concat(ids))] }));
    if (others.length && typeof logIt === 'function') logIt(recOf(key), 'Content added to the micro-segment', { note: `${ids.length} piece(s) to ${others.length + 1} messages in ${FX.seg}` });
    fxClose();
    if (typeof setContent === 'function') setContent(key, ids);
    if (others.length && typeof showToast === 'function') showToast(`Added to ${others.length + 1} messages in ${others.length ? 'the micro-segment' : 'this account'}`);
  }

  root.ContentLink = {
    KEY, TYPES, TONES, LENGTHS, AUDIENCE, PERSONA, LAYOUT, HEAD, GEN, MORE, CONTRACT, LIST_ROLES,
    uid, esc, cap, lc, noDot, cited, who, brandTone, toneize, ctxOf, genBlock, generate, blockInner, blockHtml, docHtml, parseBrief,
    ensure, save, items, itemOf, newItem, textOfHtml, checksOf, citedIn, summaryFor, store: () => ensure(),
    docxXml, docxBlob, downloadDocx, saveFile, fileName, usage, messageBar, pickForMessage, fxClose, fxSet, fxToggle, fxApply,
  };
})(typeof window !== 'undefined' ? window : globalThis);
