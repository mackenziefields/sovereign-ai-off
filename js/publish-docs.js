/* sovereign. — the publication documents (Phase 4B): Academic Record, Professional Portfolio and Feedback Report.
   They share one engine (js/publish.js), one set of components (below) and one read-only data model (js/publish-model.js).
   The components emit the same markup in every theme; css/publish.css gives each theme its own interior. Nothing here writes to saved work. */
(function (S) {
  'use strict';
  const { h } = S;
  const P = S.publish, M = S.pubModel, H = P.helpers;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
  const lab = (t, n) => ({ modernist: String(n).padStart(2, '0'), editorial: 'No. ' + n, intellectual: '§ ' + n, institution: ROMAN[n] || String(n) }[t] || String(n));
  const dateOnly = (iso) => { const d = iso ? new Date(iso) : null; return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''; };
  const learner = () => (S.state && S.state.name ? S.state.name : '');
  const pct1 = (n) => (n == null ? '' : n + '%');
  const trim = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };
  const paras = (txt) => String(txt || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((x) => h('p', { class: 'pre' }, x));

  /* ================= components ================= */
  function opener(t, n, title, o) {
    o = o || {};
    return h('section', { class: 'opener ' + (o.cls || ''), id: o.id || null },
      h('span', { class: 'o-no' }, lab(t, n)), h('h2', {}, title),
      o.deck ? h('p', { class: 'o-deck' }, o.deck) : null,
      o.meta && o.meta.length ? h('div', { class: 'o-meta' }, o.meta.filter(Boolean).map(([k, v]) => h('span', {}, h('b', {}, k), ' ' + v))) : null);
  }
  const secHead = (t, n, title, id) => h('div', { class: 'pub-sec-head', id: id || null }, h('span', { class: 'no' }, lab(t, n)), h('h2', {}, title));
  const notice = (bold, text) => h('div', { class: 'notice' }, h('b', {}, bold + ' '), text);
  const klabel = (txt) => h('span', { class: 'k' }, txt);
  const chip = (kind, text) => h('span', { class: 'status ' + kind }, text);
  const withNote = (t, main, note) => (t === 'intellectual' && note ? h('div', { class: 'mg' }, main, h('aside', { class: 'aside-n' }, note)) : [main, note ? h('p', { class: 'aside-n' }, note) : null]);
  const CST = { met: 'Met', partly: 'Partly met', 'not-met': 'Not met', 'not-assessed': 'Not assessed' };

  function rubricTable(criteria) {
    if (!criteria || !criteria.length) return null;
    const asd = criteria.filter((k) => k.assessed !== false);
    const rows = criteria.map((k) => {
      const on = k.assessed !== false;
      return h('tr', {}, h('td', {}, h('b', {}, k.name), k.status ? h('span', { class: 'muted' }, ' · ' + (CST[k.status] || '')) : null, k.comment ? h('div', { class: 'muted' }, k.comment) : null),
        h('td', { class: 'n' }, on ? k.score + ' / ' + k.max : '—'),
        h('td', {}, on && k.max > 0 ? h('div', { class: 'sbar' }, h('i', { style: 'width:' + Math.round(100 * k.score / k.max) + '%' })) : h('span', { class: 'muted' }, 'not assessed')));
    });
    const ts = asd.reduce((x, k) => x + k.score, 0), tm = asd.reduce((x, k) => x + k.max, 0);
    return h('table', { class: 'rub' }, h('thead', {}, h('tr', {}, h('th', {}, 'Criterion'), h('th', { class: 'n' }, 'Points'), h('th', {}, 'Result'))),
      h('tbody', {}, rows, h('tr', { class: 'total' }, h('td', {}, 'Total (assessed criteria)'), h('td', { class: 'n' }, (Math.round(ts * 10) / 10) + ' / ' + (Math.round(tm * 10) / 10)), h('td', {}))));
  }

  // The assessment history: stages come only from saved facts (see publish-model.js).
  function history(facts) {
    const T = facts.timeline, r = facts.review, f = facts.first, rec = facts.recorded, cells = [];
    const when = (iso) => M.fmtWhen(iso);
    if (T.how === 'first-review' || facts.state === 'reviewed') {
      cells.push(h('div', {}, h('div', { class: 'st' }, facts.state === 'reviewed' ? 'First review · no grade yet' : 'First review · the recorded grade'), h('div', { class: 'v' }, facts.state === 'reviewed' ? '—' : pct1(rec.pct)), h('div', { class: 'd' }, when(r && r.at) + (facts.state === 'reviewed' ? ' · automated feedback only' : ''))));
    } else {
      cells.push(h('div', {}, h('div', { class: 'st' }, 'Stage 1 · First review'), h('div', { class: 'v' }, f ? pct1(f.pct) : '—'),
        h('div', { class: 'd' }, T.firstAt ? when(T.firstAt) + (T.firstSource === 'derived' ? ' (derived from the review deadline)' : '') + (f ? ' · automated feedback; recorded score, not the grade' : ' · its score was not kept for this record') : 'The first review’s details were not kept for this record.')));
      cells.push(h('div', {}, h('div', { class: 'st' }, 'Stage 2 · Final graded review'), h('div', { class: 'v' }, pct1(rec.pct)), h('div', { class: 'd' }, when(T.finalAt || (r && r.at)) + ' · the recorded grade')));
    }
    return [h('div', { class: 'hist' + (cells.length === 1 ? ' one' : '') }, cells), ...T.statements.map((x) => h('p', { class: 'muted' }, x))];
  }

  const FT = { strength: ['Working well', 'Correct or well done', 'clar'], error: ['Verified error', 'The reviewer checked this and quoted your work', 'err'], missing: ['Missing requirement', 'Asked for by the assignment; not found', 'miss'], partial: ['Partially achieved', 'Present, but only partly correct or supported', 'part'], clarity: ['Clarity improvement', 'Correct, but could be clearer', 'clar'], optional: ['Optional suggestion', 'Enrichment, not a deduction', 'opt'], unverified: ['Could not assess', 'The reviewer could not check this', 'una'] };
  const FORDER = ['error', 'missing', 'partial', 'clarity', 'optional', 'unverified'];
  function finding(f) {
    const ty = FT[f.type] || FT.optional;
    const where = f.quote ? (f.located === true ? 'Found in the submission' + (f.where ? ' (' + f.where + ')' : '') : f.located === false ? 'Not found exactly in the submission' : 'Quoted from the file; the location was not checked') : '';
    return h('div', { class: 'finding' },
      h('div', { class: 'ty' }, h('span', { class: 'dot ' + ty[2] }), ty[0], h('i', {}, ty[1])),
      h('div', { class: 'bd' }, h('span', { class: 'ft' }, f.criterion || ty[0]), h('p', {}, f.claim),
        f.quote ? h('div', { class: 'q' }, '“' + f.quote + '”') : null, where ? h('span', { class: 'loc' }, where) : null,
        f.fix ? h('p', {}, h('b', {}, 'Suggested change: '), f.fix) : null));
  }

  const FILE_KIND = (t, n) => { t = String(t || '').toLowerCase(); n = String(n || '').toLowerCase(); return /pdf/.test(t) || /\.pdf$/.test(n) ? 'PDF' : /word|\.docx?$/.test(t + n) ? 'DOCX' : /sheet|excel|\.xlsx?$/.test(t + n) ? 'XLSX' : /^image\//.test(t) ? 'IMG' : 'FILE'; };
  const kb = (n) => (n >= 1048576 ? (Math.round(n / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  function fileCard(sub, why) {
    if (!sub || !sub.fileName || (sub.text && /^text\//.test(sub.fileType || ''))) return null;
    return h('div', { class: 'ref-card' }, h('div', { class: 'thumb' }, FILE_KIND(sub.fileType, sub.fileName)),
      h('div', { class: 'meta' }, h('b', { class: 't' }, sub.fileName), (sub.fileType || 'File') + ' · ' + kb(sub.fileSize || 0) + (sub.at ? ' · submitted ' + dateOnly(sub.at) : ''), h('br', {}),
        h('span', { class: 'warn' }, 'Not embedded in this document.'), ' ' + (why || 'This export includes the learner’s typed work only. The original file stays on the learner’s device, unchanged.')));
  }

  /* ================= selection and settings ================= */
  const completed = (a) => !!(a.work && a.work.phase === 'final');
  // Every finished piece the learner could include, in course order, capstone last.
  function eligible(c, mode) {
    const out = [];
    c.modules.forEach((m) => m.assignments.forEach((a) => { if (completed(a)) out.push({ a, m, cap: false, stage: S.stageOf(a) }); }));
    const cap = S.capstoneOf(c); if (cap && completed(cap)) out.push({ a: cap, m: c.capstone, cap: true, stage: 'demonstrate' });
    return mode === 'professional' ? out.filter((x) => x.cap || x.stage === 'demonstrate') : out;
  }
  function defaultInclude(c, mode) {
    const list = eligible(c, mode), caps = list.filter((x) => x.cap), rest = list.filter((x) => !x.cap && x.stage === 'demonstrate');
    if (mode === 'professional') rest.sort((x, y) => (S.pctOf(y.a) == null ? -1 : S.pctOf(y.a)) - (S.pctOf(x.a) == null ? -1 : S.pctOf(x.a))); // strongest first; the score is used for ordering only and is not shown
    return caps.concat(rest).map((x) => x.a.id).slice(0, 8);
  }
  // The learner's chosen, ordered pieces: only ones that are still eligible, in the saved order.
  function selection(c, o) {
    const list = eligible(c, o.mode), byId = new Map(list.map((x) => [x.a.id, x]));
    const ids = (o.include && o.include.length ? o.include : (o.include ? [] : defaultInclude(c, o.mode))).filter((id) => byId.has(id));
    return [...new Set(ids)].map((id) => byId.get(id));
  }
  const settings = (c) => Object.assign({ mode: 'academic', size: null, grades: false, include: null, intro: '', closing: '', notes: {}, remember: false }, c.pub || {});
  function persist(c, o) {
    c.pub = { mode: o.mode, size: o.size, grades: !!o.grades, include: o.include, intro: o.remember ? o.intro : '', closing: o.remember ? o.closing : '', notes: o.remember ? o.notes : {}, remember: !!o.remember };
    S.save();
  }

  /* ================= one project, as it appears in either mode ================= */
  function projectBlock(c, t, n, e, o, flags) {
    const { a, m, cap } = e, facts = M.reviewFacts(a), sub = a.work && a.work.final, nodes = [];
    const rec = facts.recorded, grade = rec.kind === 'ai' ? pct1(rec.pct) + ' · AI-generated assessment' : rec.kind === 'self' ? 'Self-scored ' + rec.score + ' of ' + rec.points : '';
    const meta = flags.professional
      ? [[cap ? 'Capstone' : 'Project', ''], sub && sub.at ? ['Completed', dateOnly(sub.at)] : null, flags.grades && grade ? ['Assessment', grade] : null]
      : [[cap ? 'Capstone' : (H.STAGE[e.stage] || 'Work'), cap && c.capstone ? 'counts ' + c.capstone.weight + '% of the course grade' : m.title], sub && sub.at ? ['Completed', dateOnly(sub.at)] : null, grade ? ['Recorded grade', grade] : null];
    nodes.push(opener(t, n, a.title, { cls: 'project', id: 'proj-' + a.id, meta }));
    const crit = facts.review ? facts.review.criteria.filter((k) => k.assessed !== false).map((k) => k.name) : [];
    const intro = a.portfolioNote || a.purpose || trim(a.description, 360);
    const noteText = flags.professional ? (crit.length ? 'Skills demonstrated (from the assessment criteria): ' + crit.join(' · ') : '') : (crit.length ? 'Assessed against: ' + crit.join(' · ') : '');
    if (intro) nodes.push(withNote(t, h('p', { class: 'lede' }, intro), noteText)); else if (noteText) nodes.push(h('p', { class: 'aside-n' }, noteText));
    const pn = (o.notes && o.notes[a.id]) || '';
    if (flags.history && facts.state !== 'none') {
      nodes.push(klabel('Assessment history'), ...history(facts));
      if (facts.first && facts.first.findings.length) nodes.push(h('p', { class: 'muted' }, 'The first review recorded ' + facts.first.findings.length + ' findings' + (facts.first.criteria.length ? ' across ' + facts.first.criteria.length + ' criteria' : '') + '.'));
    }
    if (flags.rubric && facts.review) nodes.push(klabel('Rubric results (final review, AI-generated)'), rubricTable(facts.review.criteria));
    if (sub && (sub.text || '').trim()) nodes.push(h('div', { class: 'work' }, h('span', { class: 'work-label' }, 'Submitted work'), h('div', { class: 'work-text' + (t === 'editorial' ? ' dropcap' : '') }, paras(sub.text))));
    else nodes.push(h('p', { class: 'muted' }, 'No typed text was submitted for this piece.'));
    const ar = sub && P.attach ? P.attach.nodes(sub, o.att && o.att[a.id]) : null; // a file is shown only when the learner ticked it for this export
    if (ar && ar.nodes) {
      nodes.push(klabel('File submitted · ' + ar.name), h('p', { class: 'att-status' }, h('b', {}, 'Included in this document. '), ar.status + '.'), ...ar.nodes, ...ar.notes.map((x) => h('p', { class: 'aside-n' }, x)));
    } else { const fc = fileCard(sub, ar ? (ar.pending ? 'You chose to include it; it was still being prepared when this was made.' : ar.status + '. ' + (ar.why || '')) : ''); if (fc) nodes.push(klabel('File submitted'), fc); }
    if (pn.trim()) nodes.push(h('div', { class: 'work' }, h('span', { class: 'work-label' }, flags.professional ? 'Process notes' : 'Learner’s notes'), h('div', { class: 'work-text' }, paras(pn))));
    return nodes;
  }

  const learnerBy = () => { const nm = learner(); return nm ? { byline: nm, bylineLabel: 'Learner' } : {}; };

  /* ================= Academic Record ================= */
  function buildAcademic(c, o) {
    const t = o.theme, sel = selection(c, Object.assign({}, o, { mode: 'academic' })), gate = M.assertPublishable(c);
    if (!gate.ok) return { blocked: gate.diagnostics };
    const cf = M.courseFacts(c), cg = cf.grade, nodes = []; let n = 0;
    const all = c.modules.reduce((x, m) => x + m.assignments.length, 0), doneN = c.modules.reduce((x, m) => x + m.assignments.filter(completed).length, 0);
    // 1 About
    n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'About this record'),
      c.description ? h('p', { class: 'lede pre' }, c.description) : null,
      h('dl', { class: 'facts' }, [['Learner', learner() || '—'], ['Course', c.code], ['Length', c.duration || '—'], ['Completed', doneN + ' of ' + all]].map((x) => h('div', {}, h('dt', {}, x[0]), h('dd', {}, x[1])))),
      c.outcomes.length ? [klabel('Learning outcomes'), h('ol', {}, c.outcomes.map((x) => h('li', {}, x)))] : null,
      notice('How to read this record.', 'Scores are AI-generated assessments made by Sovereign’s reviewer against each assignment’s rubric. They are not human-verified grades and are not accredited or endorsed by any institution. Credentials and the learner’s own final project are self-reported.')));
    // 2 Course grade
    n++;
    const gradeRows = [];
    if (cg.hasCapstone && cg.weight > 0) {
      gradeRows.push(h('tr', {}, h('td', {}, 'Module assignments (points-weighted average of graded work)'), h('td', { class: 'n' }, (100 - cg.weight) + '%'), h('td', { class: 'n' }, cg.module ? cg.module.pct + '%' : 'no graded work')));
      gradeRows.push(h('tr', {}, h('td', {}, 'Capstone'), h('td', { class: 'n' }, cg.weight + '%'), h('td', { class: 'n' }, cg.capstone ? cg.capstone.pct + '%' : 'not graded yet')));
      gradeRows.push(h('tr', { class: 'total' }, h('td', {}, 'Course grade' + (cg.provisional ? ' (provisional)' : '')), h('td', { class: 'n' }, '100%'), h('td', { class: 'n' }, cg.pct == null ? '—' : cg.pct + '%')));
    } else gradeRows.push(h('tr', { class: 'total' }, h('td', {}, 'Course grade (module average)'), h('td', { class: 'n' }, '100%'), h('td', { class: 'n' }, cg.pct == null ? '—' : cg.pct + '%')));
    nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'Course grade'),
      h('table', { class: 'rub' }, h('thead', {}, h('tr', {}, h('th', {}, 'Component'), h('th', { class: 'n' }, 'Weight'), h('th', { class: 'n' }, 'Result'))), h('tbody', {}, gradeRows)),
      cg.provisional ? h('p', {}, 'This grade is ', h('b', {}, 'provisional'), ': the capstone has no final grade yet, so it shows the module average alone. An ungraded capstone never counts as zero. When the capstone is graded the course grade becomes ' + (100 - cg.weight) + '% module average and ' + cg.weight + '% capstone.')
        : (cg.basis === 'combined' ? h('p', {}, 'This is the completed course grade: ' + (100 - cg.weight) + '% module average and ' + cg.weight + '% capstone.') : (cg.pct == null ? h('p', { class: 'muted' }, 'No assignment has been graded yet.') : null)),
      cg.pct != null ? h('p', { class: 'muted' }, 'Letter equivalent on a common scale: ' + S.letter(cg.pct) + '. It accompanies the percentage and does not replace it.') : null));
    // 3 progression, module by module
    c.modules.forEach((m) => {
      n++;
      const rows = ['learn', 'apply', 'demonstrate'].flatMap((k) => m.assignments.filter((a) => S.stageOf(a) === k).map((a) => {
        const f = M.reviewFacts(a), sub = a.work && (a.work.final || a.work.first), r = f.recorded;
        const res = r.kind === 'ai' ? r.pct + '% · AI-assessed' : r.kind === 'self' ? 'Self-scored ' + r.score + ' of ' + r.points : f.state === 'attached' ? 'Attached as evidence' : f.state === 'reviewed' ? 'Feedback ready; no grade yet' : a.done ? 'Marked complete' : 'Not started';
        return h('tr', {}, h('td', {}, H.STAGE[k]), h('td', {}, a.title), h('td', { class: 'nw' }, sub && sub.at ? dateOnly(sub.at) : '—'), h('td', {}, res));
      }));
      nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, m.title), m.overview ? h('p', { class: 'pre' }, trim(m.overview, 600)) : null,
        m.objectives.length ? [klabel('Objectives'), h('ul', { class: 'plain' }, m.objectives.map((x) => h('li', {}, x)))] : null,
        m.readings.length ? [klabel('Learning materials'), h('ul', {}, m.readings.map((r) => h('li', {}, H.link(r.title, r.url), r.done ? h('span', { class: 'muted' }, ' · completed') : null)))] : null,
        rows.length ? [klabel('Learn → Apply → Demonstrate'), h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Stage'), h('th', {}, 'Assignment'), h('th', {}, 'Completed'), h('th', {}, 'Result'))), h('tbody', {}, rows))] : h('p', { class: 'muted' }, 'No assignments in this module yet.')));
    });
    // 4 selected work (capstone and chosen pieces), each with its assessment history
    const flags = { professional: false, history: true, rubric: true, grades: true };
    if (!sel.length) { n++; nodes.push(h('section', { class: 'pub-sec', style: 'break-before:page' }, secHead(t, n, 'Selected work'), h('p', { class: 'muted' }, 'No pieces were selected for this record.'))); }
    sel.forEach((e) => { n++; nodes.push(...projectBlock(c, t, n, e, o, flags)); });
    // 5 skills and competencies (from AI-assessed rubric criteria; not an external standard)
    const sk = new Map();
    c.modules.flatMap((m) => m.assignments).concat(S.capstoneOf(c) ? [S.capstoneOf(c)] : []).forEach((a) => { const f = M.reviewFacts(a); if (f.state !== 'final' || !f.review) return; f.review.criteria.forEach((k) => { if (k.assessed !== false && k.max > 0 && k.score / k.max >= 0.8) { const e = sk.get(k.name) || { n: 0 }; e.n++; sk.set(k.name, e); } }); });
    if (sk.size) { n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'Skills and competencies'), h('p', { class: 'muted' }, 'Criteria on which the AI reviewer scored this learner at 80% or more, in at least one final review. These are the reviewer’s rubric criteria, not an external competency standard.'),
      h('ul', { class: 'plain' }, [...sk.entries()].map(([k, v]) => h('li', {}, h('b', {}, k), ' · assessed strongly in ' + v.n + (v.n === 1 ? ' assignment' : ' assignments')))))); }
    // 6 credentials, always labelled self-reported
    if (c.credentials.length) { n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'Credentials and next steps'), h('p', { class: 'muted' }, 'Self-reported by the learner. Sovereign does not verify or issue credentials, and nothing here is an accredited qualification.'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Credential'), h('th', {}, 'Issuer'), h('th', {}, 'Status (self-reported)'))), h('tbody', {}, c.credentials.map((k) => h('tr', {}, h('td', {}, H.link(k.name, k.url)), h('td', {}, k.issuer || ''), h('td', {}, S.label(S.CRED_STATUS, k.status) || k.status))))))); }
    // 7 the self-reported final project, kept apart from the graded capstone
    const w = c.work; if (w && (w.title || w.description || w.reflection)) { n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'Self-reported final project'), notice('Not graded by Sovereign.', 'The learner wrote this description themselves. It is separate from the graded capstone.'),
      w.title ? h('h3', {}, w.title) : null, w.status ? h('p', { class: 'muted' }, 'Status: ' + (S.label(S.WORK_STATUS, w.status) || w.status)) : null,
      w.description ? [klabel('What I made'), h('p', { class: 'pre' }, w.description)] : null, w.reflection ? [klabel('Reflection'), h('p', { class: 'pre' }, w.reflection)] : null, w.url ? h('p', {}, H.link(w.url, w.url)) : null)); }
    return Object.assign({ doc: 'Academic Record', kicker: 'sovereign. · Academic Record', deck: c.objective || 'What was studied, practised and demonstrated.', nodes, colophon: 'Grades follow the rules the app applies and every score is an AI-generated assessment' }, learnerBy());
  }

  /* ================= Professional Portfolio ================= */
  function buildProfessional(c, o) {
    const t = o.theme, sel = selection(c, Object.assign({}, o, { mode: 'professional' }));
    if (!sel.length) return { empty: 'There are no completed Demonstrate projects or capstone to include yet. Finish a Demonstrate assignment, then come back.' };
    if (o.grades) { const gate = M.assertPublishable(c, sel.map((e) => e.a.id)); if (!gate.ok) return { blocked: gate.diagnostics }; }
    const nodes = []; let n = 0;
    const toc = h('ul', { class: 'toc' }, sel.map((e, i) => h('li', {}, h('span', { class: 'n' }, lab(t, i + 2)), h('a', { class: 't', href: '#proj-' + e.a.id }, e.a.title), h('span', { class: 's' }, e.cap ? 'Capstone' : 'Project'))));
    n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, o.intro && o.intro.trim() ? 'Introduction' : 'Contents'),
      o.intro && o.intro.trim() ? h('div', { class: 'work-text' + (t === 'editorial' ? ' dropcap' : '') }, paras(o.intro)) : h('p', { class: 'lede' }, 'A selection of finished work from ' + c.title + '.'),
      klabel('Contents'), toc));
    sel.forEach((e) => { n++; nodes.push(...projectBlock(c, t, n, e, o, { professional: true, history: false, rubric: !!o.grades, grades: !!o.grades })); });
    nodes.push(h('section', { class: 'pub-sec', style: 'break-before:avoid' }, o.closing && o.closing.trim() ? [secHead(t, n + 1, 'Closing'), h('div', { class: 'work-text' }, paras(o.closing))] : null,
      notice('About this work.', 'This work was completed in Sovereign, an independent learning app' + (o.grades ? ', and any scores shown are AI-generated assessments, not human-verified grades' : '') + '. It is not an accredited qualification, an official certification or an independently verified credential.')));
    return Object.assign({ doc: 'Professional Portfolio', kicker: 'sovereign. · Portfolio', deck: 'Selected work', nodes, colophon: 'The work is shown as the learner submitted it' }, learnerBy());
  }

  /* ================= Feedback Report ================= */
  function buildFeedback(c, o, ctx) {
    const found = c.modules.flatMap((m) => m.assignments.map((a) => ({ a, m }))).concat(c.capstone && c.capstone.assignments[0] ? [{ a: c.capstone.assignments[0], m: c.capstone }] : []).find((x) => x.a.id === ctx.assignmentId);
    if (!found || !found.a.work) return { empty: 'This assignment has no review to report on.' };
    const { a, m } = found, gate = M.assertPublishable(c, [a.id]);
    if (!gate.ok) return { blocked: gate.diagnostics };
    const f = M.reviewFacts(a), r = f.review; if (!r) return { empty: 'This assignment was attached as evidence and has no AI review, so there is no report to make.' };
    const t = o.theme, sub = a.work.final || a.work.first, nodes = []; let n = 0;
    const stageName = f.state === 'final' ? 'Final graded review' : 'First review (no grade yet)';
    n++; nodes.push(opener(t, n, 'The assessment', { cls: 'report', deck: 'An automated review of ' + a.title + ', with the evidence behind each finding', meta: [['Course', c.title], ['Type', f.state === 'final' ? stageName : 'First review'], ['Reviewed', M.fmtWhen(r.at)]] }));
    nodes.push(h('table', {}, h('tbody',
      h('tr', {}, h('th', { style: 'width:1.5in' }, 'Assignment'), h('td', {}, a.title + (found.m === c.capstone ? ' (capstone)' : ' · ' + m.title))),
      h('tr', {}, h('th', {}, 'Submitted'), h('td', {}, M.fmtWhen(sub && sub.at))),
      h('tr', {}, h('th', {}, 'Reviewed by'), h('td', {}, 'AI reviewer (automated assessment, not a human grade)' + (r.model ? ' · ' + r.model : ''))),
      h('tr', {}, h('th', {}, 'Recorded grade'), h('td', {}, f.recorded.kind === 'ai' ? f.recorded.score + ' of ' + f.recorded.points + ' points (' + f.recorded.pct + '%)' : f.recorded.kind === 'pending' ? 'None yet. This is a first review.' : '—')))));
    nodes.push(klabel('Assessment history'), ...history(f));
    const strengths = (r.strengths || []).concat((r.findings || []).filter((x) => x.type === 'strength').map((x) => x.claim));
    nodes.push(klabel('Overall evaluation'), h('div', { class: 'verdict' }, r.summary ? h('p', { class: 'lede' }, r.summary) : h('p', { class: 'muted' }, 'The reviewer did not write an overall summary.')));
    if (f.state === 'final') nodes.push(h('div', { class: 'seal' }, h('small', {}, 'Recorded grade'), h('span', { class: 'grade' }, f.recorded.pct + '%'), h('small', {}, 'AI-generated')));
    if (strengths.length) { n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'Strengths'), strengths.map((x) => h('div', { class: 'strength' }, x)))); }
    const groups = FORDER.map((k) => [k, (r.findings || []).filter((x) => x.type === k)]).filter((g) => g[1].length);
    if (groups.length) { n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'Findings'),
      h('p', { class: 'muted' }, 'Findings are grouped by kind so that a verified error is never confused with a suggestion. A quotation is shown only where the reviewer quoted your work, with its location when the app could check it.'),
      groups.map(([k, list]) => list.map(finding)))); }
    if (r.criteria.length) { n++; nodes.push(h('section', { class: 'pub-sec keep' }, secHead(t, n, 'Rubric results'), rubricTable(r.criteria))); }
    if ((r.nextSteps || []).length) { n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'Next steps'), h('ol', { class: 'steps' }, r.nextSteps.map((x) => h('li', {}, h('div', {}, x)))))); }
    const ins = r.inspection || {};
    n++; nodes.push(h('section', { class: 'pub-sec' }, secHead(t, n, 'About this assessment'),
      notice('AI-generated.', 'This assessment was produced by an AI reviewer. It is an automated assessment, not a human grade, and may contain mistakes. It is not accredited or externally verified.'),
      ins.received ? notice('What the reviewer could see.', ins.received + ((ins.couldNotInspect || []).length ? ' It could not read: ' + ins.couldNotInspect.join('; ') + '.' : '')) : null,
      o.includeSubmission ? null : notice('Submission not included.', 'The learner’s full submission is left out of this report. It can be included with the checkbox before exporting. Nothing is sent to any service to make this PDF.')));
    if (o.includeSubmission && sub && (sub.text || '').trim()) { n++; nodes.push(h('section', { class: 'pub-sec', style: 'break-before:page' }, secHead(t, n, 'The submission'), notice('Included by the learner.', 'This is the text that was reviewed, exactly as submitted.'), h('div', { class: 'work-text' }, paras(sub.text)))); }
    return Object.assign({ doc: 'Feedback Report', title: a.title, kicker: 'sovereign. · Feedback Report', deck: 'An assessment, with the evidence behind each finding.', nodes, colophon: 'Every number comes from the saved review' }, learnerBy());
  }

  /* ================= files the learner submitted: choose which to show ================= */
  function attachFieldset(o, sel, changed, draw) {
    const A = P.attach; if (!A) return null; o.att = o.att || {};
    const files = sel.map((e) => ({ e, sub: e.a.work && e.a.work.final })).filter((x) => x.sub && A.kindOf(x.sub) !== 'none');
    if (!files.length) return null;
    const spec = (st) => ({ on: !!st.on, from: st.from, to: st.to, rows: st.rows });
    const reload = (x, st) => { const sp = spec(st); A.load(x.sub, sp).then(() => { changed(true); draw(); }); };
    const row = (x) => {
      const k = A.kindOf(x.sub), st = o.att[x.e.a.id] || (o.att[x.e.a.id] = { on: false });
      const ready = st.on ? A.nodes(x.sub, spec(st)) : null;
      const pm = k === 'pdf' ? (A.probed(x.sub) || null) : null;
      if (k === 'pdf' && !pm) A.probe(x.sub).then(() => draw());
      const kids = [h('label', {}, h('input', { type: 'checkbox', checked: !!st.on, disabled: k === 'other' ? 'disabled' : null, onchange: async (ev) => {
          st.on = ev.target.checked;
          if (st.on && k === 'pdf') { const m = await A.probe(x.sub); st.from = 1; st.to = Math.min(m.pages || A.LIM.pdfDefault, A.LIM.pdfDefault); }
          if (st.on && k === 'xlsx' && !st.rows) st.rows = A.LIM.rows;
          if (st.on) { draw(); reload(x, st); } else { changed(true); draw(); }
        } }), ' Show ', h('b', {}, x.sub.fileName), h('span', { class: 'small muted' }, ' · ' + A.KIND_NAME[k] + ' · ' + A.mb(x.sub.fileSize || 0) + ' · ' + x.e.a.title))];
      if (k === 'other') kids.push(h('p', { class: 'small muted' }, 'This kind of file can’t be shown inside a PDF. It will be listed as “not embedded”.'));
      if (st.on && k === 'pdf' && pm && pm.pages) {
        const num = (key, min, max, label) => h('label', { class: 'small' }, label + ' ', h('input', { type: 'number', min, max, value: st[key], style: 'width:4.5em', onchange: (ev) => { st[key] = Math.max(min, Math.min(max, parseInt(ev.target.value, 10) || min)); if (st.to < st.from) st.to = st.from; if (st.to - st.from + 1 > A.LIM.pdfPages) st.to = st.from + A.LIM.pdfPages - 1; reload(x, st); draw(); } }));
        kids.push(h('div', { class: 'row small' }, num('from', 1, pm.pages, 'Pages from'), num('to', 1, pm.pages, 'to'), h('span', { class: 'muted' }, ' of ' + pm.pages + ' (at most ' + A.LIM.pdfPages + ' pages)')));
      }
      if (st.on && k === 'xlsx') kids.push(h('label', { class: 'small' }, 'Rows per sheet ', h('input', { type: 'number', min: 1, max: A.LIM.rowsMax, value: st.rows || A.LIM.rows, style: 'width:4.5em', onchange: (ev) => { st.rows = Math.max(1, Math.min(A.LIM.rowsMax, parseInt(ev.target.value, 10) || A.LIM.rows)); reload(x, st); draw(); } })));
      if (st.on) kids.push(h('p', { class: 'small ' + (ready && ready.failed ? 'warn' : 'muted'), role: 'status' }, !ready ? 'Preparing…' : ready.failed ? ready.status + '. ' + ready.why : ready.status + '.'), ready && ready.notes ? h('ul', { class: 'small muted' }, ready.notes.map((n) => h('li', {}, n))) : null);
      return h('li', { class: 'pub-row' + (st.on ? ' on' : '') }, kids);
    };
    return h('fieldset', { class: 'pub-fs' }, h('legend', {}, 'Files you submitted'),
      h('p', { class: 'small muted' }, 'Nothing is shown unless you tick it. Files are read on this device only, your originals are never changed, and anything that cannot be shown is listed as “not embedded”.'),
      h('ul', { class: 'pub-list' }, files.map(row)));
  }

  /* ================= the dialog controls ================= */
  function pubOptions(c, o, changed) {
    const box = h('div', { class: 'pub-opts' });
    const draw = () => {
      box.textContent = '';
      const modeCard = (key, name, who) => h('label', { class: 'pub-mode' + (o.mode === key ? ' on' : '') }, h('input', { type: 'radio', name: 'pub-mode', value: key, checked: o.mode === key, onchange: () => { o.mode = key; o.include = o.include; changed(true); draw(); } }), h('b', {}, name), h('span', { class: 'small' }, who));
      box.append(h('fieldset', { class: 'pub-fs' }, h('legend', {}, 'Type'),
        modeCard('academic', 'Academic Record', 'What you studied, practised and demonstrated, with grades and assessment history. For advisers and admissions.'),
        modeCard('professional', 'Professional Portfolio', 'Your best finished work, without grades by default. For employers, clients and collaborators.')));
      const list = eligible(c, o.mode), sel = selection(c, o), selIds = sel.map((e) => e.a.id);
      const setSel = (ids) => { o.include = ids; changed(true); draw(); };
      const row = (e, i) => {
        const on = selIds.includes(e.a.id), pos = selIds.indexOf(e.a.id);
        return h('li', { class: 'pub-row' + (on ? ' on' : '') },
          h('label', {}, h('input', { type: 'checkbox', checked: on, onchange: (ev) => setSel(ev.target.checked ? selIds.concat(e.a.id) : selIds.filter((x) => x !== e.a.id)) }), ' ', h('span', {}, e.a.title), h('span', { class: 'small muted' }, ' · ' + (e.cap ? 'Capstone' : H.STAGE[e.stage]))),
          on ? h('span', { class: 'pub-mv' },
            h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Move ' + e.a.title + ' up', disabled: pos === 0, onclick: () => { const x = selIds.slice(); [x[pos - 1], x[pos]] = [x[pos], x[pos - 1]]; setSel(x); } }, '↑'),
            h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Move ' + e.a.title + ' down', disabled: pos === selIds.length - 1, onclick: () => { const x = selIds.slice(); [x[pos + 1], x[pos]] = [x[pos], x[pos + 1]]; setSel(x); } }, '↓')) : null,
          on ? h('details', {}, h('summary', { class: 'small' }, (o.notes[e.a.id] ? 'Edit' : 'Add') + ' a note for this piece'), h('textarea', { rows: 3, 'aria-label': 'Note about ' + e.a.title, placeholder: o.mode === 'professional' ? 'Process or methodology note (optional)' : 'A note about this piece (optional)', value: o.notes[e.a.id] || '', oninput: (ev) => { o.notes[e.a.id] = ev.target.value; changed(false); } })) : null);
      };
      box.append(h('fieldset', { class: 'pub-fs' }, h('legend', {}, 'Pieces to include'),
        list.length ? h('ul', { class: 'pub-list' }, [...sel, ...list.filter((e) => !selIds.includes(e.a.id))].map(row)) : h('p', { class: 'small muted' }, o.mode === 'professional' ? 'No completed Demonstrate projects or capstone yet.' : 'Nothing has been completed yet.'),
        h('p', { class: 'small muted' }, 'Order follows the list. Only completed work appears here.')));
      const af = attachFieldset(o, sel, changed, draw); if (af) box.append(af);
      if (o.mode === 'professional') box.append(h('label', { class: 'pub-check' }, h('input', { type: 'checkbox', checked: !!o.grades, onchange: (ev) => { o.grades = ev.target.checked; changed(true); } }), ' Include grades and rubric results (AI-generated)'));
      else box.append(h('p', { class: 'small muted' }, 'An Academic Record always shows grades and assessment history, each labelled as AI-generated.'));
      box.append(h('label', { class: 'field' }, h('span', {}, o.mode === 'professional' ? 'Introduction or personal statement (optional)' : 'Introduction (optional)'), h('textarea', { rows: 4, value: o.intro || '', oninput: (ev) => { o.intro = ev.target.value; changed(false); } })));
      if (o.mode === 'professional') box.append(h('label', { class: 'field' }, h('span', {}, 'Closing statement or contact details (optional)'), h('textarea', { rows: 3, value: o.closing || '', oninput: (ev) => { o.closing = ev.target.value; changed(false); } })));
      box.append(h('label', { class: 'pub-check' }, h('input', { type: 'checkbox', checked: !!o.remember, onchange: (ev) => { o.remember = ev.target.checked; changed(true); } }), ' Remember my text on this device for next time'),
        h('p', { class: 'small muted' }, 'Your choices (type, pieces, order, grades, paper) are saved with this course. Your text is saved only if you tick the box above.'),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { if (!confirm('Reset the saved export settings for this course? Your work, grades and feedback are not affected.')) return; delete c.pub; Object.assign(o, settings(c), { notes: {}, size: getSz(), theme: c.designTheme }); changed(true); delete c.pub; S.save(); draw(); } }, 'Reset saved export settings'));
    };
    const getSz = () => H.getSize();
    draw();
    return box;
  }

  P.builders.publication = {
    name: 'Portfolio', intro: 'Choose an Academic Record (learning and assessment) or a Professional Portfolio (finished work for an outside audience).',
    init: (c) => { const s = settings(c); return Object.assign({}, s, { notes: Object.assign({}, s.notes), size: s.size, att: {} }); }, // att (which files to show) is for this export only and is never saved
    build: (c, o) => (o.mode === 'professional' ? buildProfessional(c, o) : buildAcademic(c, o)), options: pubOptions, persist,
  };
  P.builders.feedback = {
    name: 'Feedback Report', intro: 'An editorial assessment of this review: overall evaluation, strengths, findings by kind, rubric, next steps. Your submission is left out unless you tick the box.',
    init: () => ({ includeSubmission: false }),
    build: buildFeedback,
    options: (c, o, changed) => h('label', { class: 'pub-check' }, h('input', { type: 'checkbox', checked: false, onchange: (ev) => { o.includeSubmission = ev.target.checked; changed(true); } }), ' Include my submitted text in the report (off by default)'),
  };
  P.docs = { eligible, selection, defaultInclude, settings, persist, buildAcademic, buildProfessional, buildFeedback, lab };
})(window.Sovereign);
