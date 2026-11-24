/* One content library, shared by Content studio and the admin Content library.
   Assets and templates live here; a change on either side shows on the other. */
(function () {
  const KEY = 'dmock_lib';
  const SEED = [
    ['l1', 'Turnaround readiness: the 3 risks refineries miss', 'Whitepaper', ['Outbound email', 'Newsletter'], 'Refining', 'Turnaround season 2027', 'Operations manager', 'Pain point', 'Turnaround overruns', 'Completed', 'Daniel Brooks', '3 days ago', 11, '7 replies from 11 accounts', ['Turnaround season 2027 · touch 2'], ['sofia', 'kenji', 'marco'], 'Mon 19 Oct', 3],
    ['l2', 'Where unplanned downtime really comes from', 'Infographic', ['Outbound email', 'LinkedIn DM'], 'Petrochemicals', 'New reliability & operations leaders', 'Reliability leader', 'Pain point', 'Unplanned trips', 'Completed', 'Sofia Ahlgren', '5 days ago', 9, 'Reply rate 24%', ['NBA · Juniper Petrochem', 'NBA · Kingfisher Refining'], ['sofia'], 'Thu 22 Oct', 5],
    ['l3', 'Switch at contract end: the 5-slide decision', 'Carousel', ['LinkedIn post', 'LinkedIn DM'], 'Petrochemicals', 'Rival contract ending', 'Technical lead (I&C)', 'Initiative', 'Vendor switch', 'To approve', 'Sofia Ahlgren', 'Today', 0, '–', [], [], 'Today', 0],
    ['l4', '2027 emissions-reporting checklist', 'PDF one-pager', ['Outbound email', 'Newsletter'], 'Gas processing', '2027 emissions-reporting deadline', 'Plant head', 'Need', 'Compliance by 2027', 'Under review', 'Marco Lindqvist', 'Today', 0, '–', [], [], 'Today', 0],
    ['l5', 'Historian migration: a phased path', 'Whitepaper', ['Blog email', 'LinkedIn DM'], 'Gas processing', 'Historian & tech-stack change', 'Technical lead (I&C)', 'Initiative', 'Historian upgrade', 'Under review', 'Kenji Watanabe', 'Yesterday', 0, '–', [], [], 'Mon 26 Oct', 1],
    ['l6', 'A peer site cut unplanned trips by 18%', 'Infographic', ['Newsletter', 'Blog email'], 'Refining', 'New reliability & operations leaders', 'Reliability leader', 'Pain point', 'Unplanned trips', 'Completed', 'Sofia Ahlgren', '2 weeks ago', 31, '9 replies · 3 meetings', ['Rival contract ending · touch 2', 'Monthly newsletter · Oct'], ['sofia', 'marco', 'aisha'], 'Mon 12 Oct', 14],
    ['l7', 'Scope expansion automation in 30 days', 'Carousel', ['LinkedIn post'], 'Petrochemicals', 'Expansion & capex projects', 'Operations manager', 'Initiative', 'Plant expansion', 'Completed', 'Aisha Rahman', '1 week ago', 14, '212 engagements from target accounts', ['Expansion & capex projects · touch 1'], ['aisha', 'kenji'], 'Thu 15 Oct', 7],
    ['l8', 'Staffing a control-system upgrade', 'Infographic', ['Outbound email', 'LinkedIn post'], 'Refining', 'Control-systems hiring surge', 'Plant head', 'Need', 'Skills gap', 'To approve', 'Marco Lindqvist', 'Today', 0, '–', [], [], 'Today', 0],
    ['l9', 'LNG terminal reliability benchmark', 'Whitepaper', ['Newsletter', 'Outbound email'], 'LNG', 'Rival contract ending', 'Reliability leader', 'Need', 'Benchmark against peers', 'Draft', 'Aisha Rahman', 'Today', 0, '–', [], [], 'Today', 0],
    ['l10', 'The cost of a delayed restart', 'PDF one-pager', ['Outbound email', 'LinkedIn DM'], 'Refining', 'Turnaround season 2027', 'Procurement', 'Pain point', 'Restart delays', 'Completed', 'Daniel Brooks', '4 days ago', 8, 'Reply rate 19%', ['Turnaround season 2027 · touch 3'], ['marco'], 'Fri 23 Oct', 4],
    ['l11', 'Support you can count on through the switch', 'Carousel', ['LinkedIn post', 'LinkedIn DM'], 'Petrochemicals', 'Researching competitors', 'Technical lead (I&C)', 'Pain point', 'Slow vendor support', 'Under review', 'Sofia Ahlgren', 'Today', 0, '–', [], [], 'Today', 0],
    ['l12', 'Monthly reliability brief: three numbers', 'Infographic', ['Newsletter'], 'Refining', 'New reliability & operations leaders', 'Reliability leader', 'Need', 'Peer benchmarks', 'Completed', 'Daniel Brooks', '1 week ago', 46, 'Clicks from 19 target accounts', ['Monthly newsletter · Nov'], ['pavan'], 'Tue 20 Oct', 7]
  ].map(r => ({ id: r[0], t: r[1], type: r[2], fmt: r[3], ind: r[4], seg: r[5], per: r[6], topicK: r[7], topic: r[8], st: r[9], by: r[10], at: r[11], used: r[12], metric: r[13], inC: r[14], usedBy: r[15], created: r[16], age: r[17], src: 'Content studio' }));
  const REVIEW0 = { l1: '15 Jan 2027', l2: '30 Nov 2026', l6: '28 Feb 2027', l7: '10 Dec 2026' };
  const TPL0 = [
    { id: 't1', name: 'Field report', type: 'Whitepaper', design: 'Vantera Brand v3', sections: ['Executive summary', 'Why it matters now', 'Questions worth asking', 'What a comparable site did', 'A sensible next step'], st: 'Active', def: true, by: 'Rajiv Nair', at: 'Mon 2 Nov', uses: 4 },
    { id: 't5', name: 'Boardroom brief', type: 'Whitepaper', design: 'Boardroom', sections: ['The decision in one line', 'Cost of waiting', 'Peer proof', 'Recommendation'], st: 'Active', def: false, by: 'Rajiv Nair', at: 'Thu 5 Nov', uses: 1 },
    { id: 't2', name: 'Three numbers and a chart', type: 'Infographic', design: 'Vantera Brand v3', sections: ['Headline and one-line problem', 'Three peer numbers with sources', 'One bar chart', 'Three questions', 'Next step'], st: 'Active', def: true, by: 'Rajiv Nair', at: 'Mon 2 Nov', uses: 6 },
    { id: 't3', name: 'Problem, proof, ask', type: 'Carousel', design: 'Vantera Brand v3', sections: ['Cover', 'Why it matters', 'One big number', 'Questions to ask', 'What a peer did', 'The ask'], st: 'Active', def: true, by: 'Daniel Brooks', at: 'Tue 3 Nov', uses: 3 },
    { id: 't4', name: 'One-page checklist', type: 'PDF one-pager', design: 'Vantera Brand v3', sections: ['Lead', 'What changes', 'Checklist', 'Peer proof', 'Next step'], st: 'Active', def: true, by: 'Rajiv Nair', at: 'Mon 2 Nov', uses: 2 },
    { id: 't6', name: 'Extend vs switch', type: 'PDF one-pager', design: 'Plain paper', sections: ['Option A and option B', 'Five-year cost', 'Risks of each', 'Recommendation'], st: 'Draft', def: false, by: 'Daniel Brooks', at: 'Fri 13 Nov', uses: 0 }
  ];
  const GAPS = [['What does a phased migration cost per year of outage saved?', 7, 'Rival contract ending'], ['Which sites like ours finished a migration inside one turnaround?', 5, 'Turnaround season 2027'], ['How do you handle a mixed vendor estate?', 4, 'Historian & tech-stack change'], ['What support response time do you commit to?', 3, 'Researching competitors']];
  let D = {};
  function load() { try { D = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { D = {}; } D.extra = D.extra || []; D.st = D.st || {}; D.review = D.review || {}; D.log = D.log || []; if (!D.tpl) D.tpl = TPL0.map(x => Object.assign({}, x, { sections: x.sections.slice() })); return D; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* storage blocked: changes last for this page only */ } }
  const log = (x, who) => { D.log.unshift({ x, who: who || '', at: 'Just now' }); D.log = D.log.slice(0, 30); };
  window.CONTENT_LIB = {
    TYPES: ['Whitepaper', 'Infographic', 'Carousel', 'PDF one-pager'],
    seed: () => SEED.map(a => Object.assign({}, a)),
    all() { load(); return D.extra.concat(SEED).map(a => Object.assign({}, a, D.st[a.id] ? { st: D.st[a.id] } : {}, { review: D.review[a.id] || a.review || REVIEW0[a.id] || '' })); },
    add(a, who) { load(); D.extra = [a].concat(D.extra.filter(x => x.id !== a.id)); log(`Added "${a.t}" (${a.type}) · ${a.st}`, who); save(); },
    setSt(id, st, who) { load(); const a = D.extra.concat(SEED).find(x => x.id === id); D.st[id] = st; log(`${st === 'Completed' ? 'Approved' : st === 'Retired' ? 'Retired' : 'Set to ' + st} "${a ? a.t : id}"`, who); save(); },
    setReview(id, d, who) { load(); D.review[id] = d; save(); },
    templates() { load(); return D.tpl; },
    saveTemplates(L, msg, who) { load(); D.tpl = L; if (msg) log(msg, who); save(); },
    defTemplate(type) { const L = this.templates().filter(x => x.type === type && x.st === 'Active'); return L.find(x => x.def) || L[0] || null; },
    gaps: () => GAPS.map(g => g.slice()),
    log() { load(); return D.log; }
  };
  load();
})();
