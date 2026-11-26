/* sovereign. (AI-off copy) — Guided Assessment Studio. This file exists only in the AI-off copy.
   You assess your own work against the assignment's rubric: a score, a reason, evidence and an improvement flag for each criterion.
   The app only does what it can do without judging: completeness checks (is the work there, is it the asked-for format, how many words)
   and adding up your scores. It never decides whether work is good, correct or complete in meaning, and it writes no performance standards.
   Workflow: submit → self-assess → set revision goals → revise and resubmit → reassess → you finalize. Every version is kept.
   Saved as a.studio (normalised in js/store.js). */
(function (S) {
  'use strict';
  const { h, toast, commit, badge } = S;
  const A = (S.assess = {});
  const MAXV = 12;
  const ui = {}; // per assignment, this visit only: { confirm: n, sel: {start,end}, kind }
  const u = (a) => ui[a.id] || (ui[a.id] = {});
  const now = () => new Date().toISOString();
  const r1 = (n) => Math.round(n * 10) / 10;
  const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const countWords = (t) => (String(t || '').trim().match(/\S+/g) || []).length;
  const ext = (n) => ((String(n || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '');
  const tabHref = (c, a, t) => S.href(c, 'assignments', a.id + '/' + t);
  const GOAL = { open: 'Not reviewed yet', addressed: 'Addressed', partly: 'Partly addressed', not: 'Not addressed' };
  const KIND = { strength: 'Strength', revise: 'Needs revision' };

  /* ----- records ----- */
  const subOf = (v) => ({ text: v.text, fileId: v.fileId, fileName: v.fileName, fileType: v.fileType, fileSize: v.fileSize, at: v.at, late: v.late, feedback: null });
  const verOf = (sub, n, note) => ({ n, at: sub.at, late: sub.late === true, text: sub.text || '', fileId: sub.fileId || '', fileName: sub.fileName || '', fileType: sub.fileType || '', fileSize: sub.fileSize || 0, imported: !!sub.feedback, note: note || '', highlights: [], assessment: null, goals: [] });
  const log = (st, what) => { st.log.push({ at: now(), what }); if (st.log.length > 80) st.log.shift(); };

  // The studio record, rebuilt from older saved work the first time it is needed (the submitted work itself is never changed).
  A.ensure = function (a) {
    if (a.studio) return a.studio;
    const w = a.work, s = w && (w.final || w.first), vs = s ? [verOf(s, 1)] : [];
    a.studio = { versions: vs, recorded: null, finalV: 0, finalizedAt: '', log: [] };
    if (vs.length && vs[0].imported && a.score != null) a.studio.recorded = { v: 1, score: a.score, points: a.points, total: null, max: null, kind: 'imported', at: vs[0].at, final: false };
    return a.studio;
  };
  const latest = (st) => st.versions[st.versions.length - 1];
  const done = (as) => !!(as && as.completedAt);

  // Why a new version can't be added, or '' if it can.
  A.canAdd = function (a) {
    const st = a.studio;
    if (st && st.finalizedAt) return 'This assignment is finalized. Reopen it in the Revise tab to submit a new version.';
    if (st && st.versions.length >= MAXV) return 'This assignment already has ' + MAXV + ' versions, the most this app keeps. Finalize one of them.';
    return '';
  };
  // Called by js/views-work.js before the new submission becomes a.work.final. Earlier versions, and their files, are kept.
  A.addVersion = function (a, sub, note) {
    const st = A.ensure(a), n = st.versions.length + 1;
    st.versions.push(verOf(sub, n, String(note || '').trim().slice(0, 1000)));
    log(st, 'Submitted version ' + n + (sub.late ? ' (late)' : '') + '.');
    return n;
  };

  // Criteria for a self-assessment. Only what the assignment defines: its rubric (name and points). Without a rubric, one overall score out of the
  // assignment's points; without points, the written criteria to reflect on (completion only). No performance-level descriptions are invented.
  A.criteriaOf = function (a) {
    if (a.rubric.length) return { list: a.rubric.map((k) => ({ name: k.name, max: k.max })), mode: 'rubric' };
    if (a.points > 0) return { list: [{ name: 'Overall', max: a.points }], mode: 'holistic' };
    if (a.criteria.length) return { list: a.criteria.map((x) => ({ name: x, max: 0 })), mode: 'reflect' };
    return { list: [], mode: 'none' };
  };
  const blank = (k) => ({ name: k.name, max: k.max, score: null, reason: '', evidence: '', improve: false });
  const critOk = (k) => (k.max > 0 ? k.score != null && k.score >= 0 && k.score <= k.max : true) && !!k.reason.trim() && !!k.evidence.trim();
  A.isComplete = (as) => !!as && (as.criteria.length ? as.criteria.every(critOk) : !!as.overall.trim());
  A.totals = function (as) {
    const sc = as.criteria.filter((k) => k.max > 0);
    return { score: r1(sc.reduce((x, k) => x + (k.score || 0), 0)), max: r1(sc.reduce((x, k) => x + k.max, 0)) };
  };
  // Converts a rubric total to the assignment's points, keeping the same percentage. Deterministic: the same inputs always give the same number.
  A.toPoints = (t, points) => (!(points > 0) || !(t.max > 0) ? null : t.max === points ? t.score : r1((t.score / t.max) * points));

  function completeAssessment(a, v) {
    const st = a.studio, as = v.assessment;
    if (!A.isComplete(as)) return;
    as.completedAt = now();
    const t = A.totals(as), sc = A.toPoints(t, a.points);
    if (sc != null) { a.score = sc; st.recorded = { v: v.n, score: sc, points: a.points, total: t.score, max: t.max, kind: 'self', at: as.completedAt, final: false }; }
    a.done = true;
    log(st, 'Completed the self-assessment of version ' + v.n + (sc != null ? ': ' + sc + ' / ' + a.points + ' points.' : '.'));
    toast(sc != null ? 'Assessment complete. ' + sc + ' / ' + a.points + ' recorded as your self-assessed score.' : 'Assessment complete.');
    commit();
  }

  function finalize(a, n) {
    const st = a.studio, v = st.versions[n - 1];
    if (!v || st.finalizedAt) return;
    let sc = null;
    if (a.points > 0) {
      if (!done(v.assessment)) return;
      const t = A.totals(v.assessment); sc = A.toPoints(t, a.points);
      if (sc != null) { a.score = sc; st.recorded = { v: n, score: sc, points: a.points, total: t.score, max: t.max, kind: 'self', at: now(), final: true }; }
    }
    st.finalV = n; st.finalizedAt = now(); a.done = true;
    // The finalized version becomes the work shown elsewhere in the app. Other versions stay in History.
    if (a.work && a.work.final && a.work.final.at !== v.at) a.work = { phase: 'final', deadline: '', first: null, final: subOf(v), ...(a.work.firstSummary ? { firstSummary: a.work.firstSummary } : {}) };
    if (a.kind === 'demonstrate') a.portfolio = true;
    log(st, 'Finalized version ' + n + (sc != null ? ' with a self-assessed score of ' + sc + ' / ' + a.points + '.' : '.'));
    u(a).confirm = 0;
    toast('Finalized. Version ' + n + ' is your final work.');
    commit();
  }

  function reopen(a) {
    const st = a.studio;
    log(st, 'Reopened after finalizing version ' + st.finalV + '. The recorded score stays until you complete another assessment.');
    st.finalV = 0; st.finalizedAt = '';
    if (st.recorded) st.recorded.final = false;
    toast('Reopened. You can submit a new version.');
    commit();
  }

  /* ----- what the workbench shows as the status ----- */
  A.status = function (a) {
    const st = a.studio || (a.work ? A.ensure(a) : null);
    if (!st || !st.versions.length) return a.done ? 'Marked completed' : 'Not submitted';
    const v = latest(st), rec = st.recorded;
    const recTxt = rec && a.points > 0 ? (rec.kind === 'imported' ? 'imported AI grade ' : 'self-assessed ') + rec.score + ' / ' + a.points : '';
    if (st.finalizedAt) return 'Final · version ' + st.finalV + (recTxt ? ' · ' + recTxt : '');
    if (done(v.assessment)) return 'Version ' + v.n + ' self-assessed' + (recTxt ? ' · ' + recTxt.replace(/^self-assessed /, '') : '');
    return 'Version ' + v.n + ' submitted · not assessed yet' + (recTxt ? ' · recorded: ' + recTxt + ' (version ' + rec.v + ')' : '');
  };
  // Is the assignment finished by the learner (finalized), for later stages (grades, exports).
  A.isFinal = (a) => !!(a.studio && a.studio.finalizedAt);
  // Where a recorded score came from, in words. null when there is no score (shown as "Not assessed", never as zero).
  A.source = function (a) {
    if (a.score == null) return null;
    const r = a.studio && a.studio.recorded;
    if (r && r.kind === 'self') return a.studio.finalizedAt ? { key: 'final', label: 'Self-assessed · final' } : { key: 'prov', label: 'Self-assessed · provisional' };
    if ((r && r.kind === 'imported') || (a.work && a.work.final && a.work.final.feedback)) return { key: 'ai', label: 'AI review, imported' };
    return { key: 'manual', label: 'Entered by hand' };
  };
  // A short score line for lists: "8 / 10 pts · 80% · Self-assessed · final", or "Not assessed".
  A.scoreLine = function (a) {
    if (!(a.points > 0)) return a.done ? 'Complete' : 'Completion only';
    const s = A.source(a);
    return s ? a.score + ' / ' + a.points + ' pts · ' + S.pctOf(a) + '% · ' + s.label : 'Not assessed · ' + a.points + ' pts';
  };
  // Studio facts for exports (read-only copy of what was saved).
  A.facts = function (a) {
    const st = a.studio; if (!st || !st.versions.length) return null;
    return { finalV: st.finalV, finalizedAt: st.finalizedAt, recorded: st.recorded,
      versions: st.versions.map((v) => ({ n: v.n, at: v.at, late: v.late, note: v.note, words: v.text ? countWords(v.text) : null, fileName: v.fileName, highlights: v.highlights.length,
        assessment: v.assessment ? { done: done(v.assessment), at: v.assessment.completedAt, overall: v.assessment.overall, criteria: v.assessment.criteria.map((k) => ({ ...k })), total: A.totals(v.assessment) } : null,
        goals: v.goals.map((g) => ({ text: g.text, criterion: g.criterion, status: GOAL[g.status] })) })) };
  };

  /* ----- automated completeness checks (never about quality) ----- */
  function wordRule(a) {
    const src = [['What to submit', a.submit], ['Steps', a.steps.concat(a.parts.flatMap((p) => p.questions)).join('\n')], ['Overview', a.description]];
    const n = (x) => parseInt(String(x).replace(/,/g, ''), 10);
    for (const [where, t] of src) {
      if (!t) continue;
      let m = t.match(/(\d[\d,]*)\s*(?:–|—|-|to)\s*(\d[\d,]*)\s*words\b/i); if (m) return { min: n(m[1]), max: n(m[2]), where, quote: m[0] };
      m = t.match(/(?:at least|a minimum of|minimum of|no fewer than)\s+(\d[\d,]*)\s*words\b/i); if (m) return { min: n(m[1]), max: null, where, quote: m[0] };
      m = t.match(/(?:up to|no more than|a maximum of|maximum of|at most)\s+(\d[\d,]*)\s*words\b/i); if (m) return { min: null, max: n(m[1]), where, quote: m[0] };
    }
    return null;
  }
  function formatCheck(a, v) {
    const f = a.format || 'any', e = v.fileName ? ext(v.fileName) : '', typed = !v.fileName && !!v.text, img = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e);
    const want = { text: 'typed text or a text file (.txt or .md)', pdf: 'a PDF', image: 'an image (PNG, JPG, WEBP or GIF)', file: 'a PDF, an Excel (.xlsx) file or an image' }[f];
    const got = typed ? 'typed text' : e ? 'a .' + e + ' file' : 'a file';
    if (!want) return ['na', 'Format', 'This assignment accepts typed text or any common file, so there is nothing to compare. You submitted ' + got + '.'];
    const ok = f === 'text' ? typed || ['txt', 'md'].includes(e) : f === 'pdf' ? e === 'pdf' : f === 'image' ? img : e === 'pdf' || e === 'xlsx' || img;
    return [ok ? 'ok' : 'no', 'Format', (ok ? 'Matches' : 'Does not match') + ' what this assignment asks for (' + want + '). You submitted ' + got + '.'];
  }
  A.checks = function (a, v) {
    const out = [];
    out.push(v.text || v.fileName ? ['ok', 'Work present', v.fileName ? 'A file is recorded: ' + v.fileName + '. Whether it is still on this device is shown below the work.' : 'Typed text is saved with this version.'] : ['no', 'Work present', 'Nothing is saved with this version.']);
    out.push(formatCheck(a, v));
    const readable = !!v.text, wc = readable ? countWords(v.text) : null;
    out.push(readable ? ['ok', 'Word count', wc.toLocaleString() + (wc === 1 ? ' word' : ' words') + '.'] : ['na', 'Word count', 'Not counted: this app does not read the text inside PDF, image or spreadsheet files.']);
    const rule = wordRule(a);
    if (rule) {
      const lbl = 'Length (' + rule.where + ': “' + rule.quote + '”)';
      if (!readable) out.push(['na', lbl, 'Not checked: the words in this file could not be counted.']);
      else { const ok = (rule.min == null || wc >= rule.min) && (rule.max == null || wc <= rule.max); out.push([ok ? 'ok' : 'no', lbl, ok ? 'Within the stated length.' : wc < (rule.min || 0) ? 'Shorter than the stated length by ' + (rule.min - wc) + ' words.' : 'Longer than the stated length by ' + (wc - rule.max) + ' words.']); }
    }
    if (a.due) out.push(v.late ? ['no', 'Due date', 'Submitted after the due date (' + S.fmtDate(a.due) + '), so it is marked late. Late work is accepted.'] : ['ok', 'Due date', 'Submitted by the due date (' + S.fmtDate(a.due) + ').']);
    const parts = a.parts.filter((p) => p.title).length;
    if (parts) out.push(['na', 'Parts', 'The Steps list ' + parts + ' parts. This app does not check whether your work covers each one; judge that yourself in the rubric.']);
    return out;
  };
  const MARK = { ok: 'Met', no: 'Not met', na: 'Not checked' };
  function checksView(a, v) {
    return h('section', { class: 'as-checks', 'aria-label': 'Automated completeness checks' },
      h('h4', { class: 'minor' }, 'Automated checks'),
      h('p', { class: 'small muted' }, 'Completeness only. These count and compare; they never judge quality, accuracy or meaning. That is your call in the rubric.'),
      h('ul', { class: 'as-chk' }, A.checks(a, v).map(([st, label, msg]) => h('li', { class: 'chk-' + st }, h('span', { class: 'chk-k' }, MARK[st]), h('span', {}, h('b', {}, label), ' · ', msg)))));
  }

  /* ----- your highlights: blue for strengths, yellow for what to revise ----- */
  function markedText(v) {
    const box = h('div', { class: 'as-text pre', tabindex: '0', 'aria-label': 'Your work, version ' + v.n });
    const hs = v.highlights.filter((x) => x.start != null && x.end <= v.text.length).sort((x, y) => x.start - y.start);
    let pos = 0;
    for (const x of hs) {
      if (x.start < pos) continue;
      box.append(v.text.slice(pos, x.start), h('mark', { class: 'hl hl-' + x.kind, title: KIND[x.kind] + (x.note ? ': ' + x.note : '') }, v.text.slice(x.start, x.end)));
      pos = x.end;
    }
    box.append(v.text.slice(pos));
    return box;
  }
  function selectionIn(box, text) {
    const s = window.getSelection(); if (!s || !s.rangeCount || s.isCollapsed) return null;
    const r = s.getRangeAt(0); if (!box.contains(r.startContainer) || !box.contains(r.endContainer)) return null;
    const pre = document.createRange(); pre.selectNodeContents(box); pre.setEnd(r.startContainer, r.startOffset);
    let start = pre.toString().length, end = start + r.toString().length;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return end > start ? { start, end } : null;
  }
  function addHighlight(a, v, kind, sel, quote, note) {
    if (sel && v.highlights.some((x) => x.start != null && x.start < sel.end && sel.start < x.end)) { toast('That overlaps a highlight you already made. Remove it first.'); return; }
    if (v.highlights.length >= 60) { toast('A version can hold 60 highlights.'); return; }
    v.highlights.push({ id: S.uid(), kind, start: sel ? sel.start : null, end: sel ? sel.end : null, quote: String(quote).slice(0, 1000), note: String(note || '').slice(0, 500) });
    commit();
  }
  function highlightList(a, v, editable) {
    if (!v.highlights.length) return h('p', { class: 'small muted' }, editable ? 'No highlights yet.' : 'No highlights.');
    return h('ul', { class: 'as-hls' }, v.highlights.map((x) => h('li', { class: 'hl-item hl-item-' + x.kind },
      h('span', { class: 'badge ' + (x.kind === 'strength' ? 'hl-b-strength' : 'hl-b-revise') }, KIND[x.kind]), ' ',
      h('q', {}, x.quote.length > 220 ? x.quote.slice(0, 220) + '…' : x.quote), x.note ? h('span', { class: 'small' }, ' — ' + x.note) : null, ' ',
      editable ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { v.highlights = v.highlights.filter((y) => y !== x); commit(); } }, 'Remove') : null)));
  }
  function highlightsView(a, v, editable) {
    const st = u(a), legend = h('p', { class: 'small muted as-legend' }, h('mark', { class: 'hl hl-strength' }, 'Blue'), ' marks a strength. ', h('mark', { class: 'hl hl-revise' }, 'Yellow'), ' marks something to revise. Only you make highlights.');
    const out = [h('h4', { class: 'minor' }, 'Your highlights'), legend];
    if (v.text) {
      const box = markedText(v);
      const noteIn = h('input', { type: 'text', class: 'as-note', placeholder: 'Note (optional)', maxlength: '500' });
      const hint = h('span', { class: 'small muted', role: 'status' }, 'Select a passage in your work, then choose a colour.');
      const grab = () => { st.sel = selectionIn(box, v.text); hint.textContent = st.sel ? 'Selected ' + (st.sel.end - st.sel.start) + ' characters.' : 'Select a passage in your work, then choose a colour.'; };
      box.addEventListener('mouseup', grab); box.addEventListener('keyup', grab); box.addEventListener('touchend', () => setTimeout(grab, 0));
      const mk = (kind, label) => h('button', { class: 'btn ghost hl-btn hl-btn-' + kind, type: 'button', onclick: () => { const sel = st.sel; if (!sel) { toast('Select a passage in your work first.'); return; } st.sel = null; addHighlight(a, v, kind, sel, v.text.slice(sel.start, sel.end), noteIn.value.trim()); } }, label);
      out.push(box);
      if (editable) out.push(h('div', { class: 'as-hl-tools' }, hint, h('div', { class: 'btn-row' }, mk('strength', 'Mark as strength (blue)'), mk('revise', 'Mark for revision (yellow)')), noteIn));
    } else {
      out.push(S.fileLine(v), h('p', { class: 'small muted' }, 'This app can’t show the text inside this file, so add a highlight by copying the passage in yourself.'));
      if (editable) {
        const q = h('textarea', { rows: 2, placeholder: 'The passage, copied from your file', maxlength: '1000' }), noteIn = h('input', { type: 'text', placeholder: 'Note (optional)', maxlength: '500' });
        const mk = (kind, label) => h('button', { class: 'btn ghost hl-btn hl-btn-' + kind, type: 'button', onclick: () => { if (!q.value.trim()) { toast('Copy in the passage first.'); return; } addHighlight(a, v, kind, null, q.value.trim(), noteIn.value.trim()); } }, label);
        out.push(h('div', { class: 'as-hl-tools' }, q, noteIn, h('div', { class: 'btn-row' }, mk('strength', 'Add as strength (blue)'), mk('revise', 'Add for revision (yellow)'))));
      }
    }
    out.push(highlightList(a, v, editable));
    return h('section', { class: 'as-hl' }, out);
  }

  /* ----- the guided rubric (your judgments) ----- */
  function startAssessment(a, v, from) {
    const cr = A.criteriaOf(a).list;
    const prev = from && from.assessment;
    v.assessment = { startedAt: now(), completedAt: '', overall: '', criteria: cr.map((k) => { const p = prev && prev.criteria.find((x) => x.name === k.name && x.max === k.max); return p ? { ...p } : blank(k); }) };
    log(a.studio, 'Started the self-assessment of version ' + v.n + (prev ? ', starting from the version ' + from.n + ' assessment.' : '.'));
    commit();
  }

  function rubricView(c, m, a, v, editable) {
    const st = a.studio, as = v.assessment, cm = A.criteriaOf(a), prev = st.versions[v.n - 2];
    if (!as) {
      if (!editable) return h('p', { class: 'small muted' }, 'This version was not self-assessed.');
      return h('section', { class: 'as-start' },
        h('h4', { class: 'minor' }, 'Assess version ' + v.n),
        h('p', {}, cm.mode === 'none' ? 'This assignment has no rubric, criteria or points, so the assessment is a written reflection.' : 'For each criterion you give a score, the reason for it, the evidence in your work, and whether to improve it.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onclick: () => startAssessment(a, v, null) }, 'Start the assessment'),
          prev && done(prev.assessment) ? h('button', { class: 'btn ghost', type: 'button', onclick: () => startAssessment(a, v, prev) }, 'Start from my version ' + prev.n + ' assessment') : null));
    }
    const live = editable && !done(as);
    const totalEl = h('p', { class: 'as-total', role: 'status' }), btn = h('button', { class: 'btn', type: 'button', onclick: () => completeAssessment(a, v) }, 'Complete assessment');
    const refresh = () => {
      const t = A.totals(as), n = as.criteria.filter(critOk).length, sc = A.toPoints(t, a.points);
      totalEl.textContent = (t.max > 0 ? 'Total: ' + t.score + ' / ' + t.max + (sc != null && t.max !== a.points ? ' → ' + sc + ' / ' + a.points + ' points (same percentage)' : '') + '. ' : a.points > 0 ? '' : 'No points: this assignment is tracked as complete or not. ')
        + (as.criteria.length ? n + ' of ' + as.criteria.length + ' criteria complete.' : as.overall.trim() ? 'Reflection written.' : 'Write your reflection to complete it.');
      btn.disabled = !A.isComplete(as);
    };
    const save = () => { S.save(); refresh(); };
    const hlOpts = v.highlights.map((x) => h('option', { value: x.id }, KIND[x.kind] + ': ' + (x.quote.length > 60 ? x.quote.slice(0, 60) + '…' : x.quote)));
    const cards = as.criteria.map((k, i) => {
      const id = 'as-' + a.id + '-' + i;
      if (!live) return h('li', { class: 'as-crit' },
        h('div', { class: 'as-crit-h' }, h('b', {}, k.name), k.max > 0 ? h('span', { class: 'as-pts' }, (k.score != null ? k.score : '—') + ' / ' + k.max) : null, k.improve ? badge('Flagged to improve', 'warn') : null),
        k.reason ? h('p', {}, h('span', { class: 'as-k' }, 'Reason: '), k.reason) : null,
        k.evidence ? h('p', {}, h('span', { class: 'as-k' }, 'Evidence: '), k.evidence) : null);
      const ev = h('textarea', { id: id + '-e', rows: 2, maxlength: '2000', value: k.evidence, placeholder: 'Quote or point to the part of your work (a highlight, “paragraph 2”, “the table on page 1”).', oninput: (e) => { k.evidence = e.target.value; save(); } });
      return h('li', { class: 'as-crit' },
        h('div', { class: 'as-crit-h' }, h('b', {}, k.name), k.max > 0 ? h('span', { class: 'as-pts' }, 'out of ' + k.max) : h('span', { class: 'as-pts' }, 'no points')),
        k.max > 0 ? h('label', { class: 'field as-score' }, h('span', {}, 'Your score (0 to ' + k.max + ')'),
          h('input', { type: 'number', min: '0', max: String(k.max), step: '0.5', inputmode: 'decimal', value: k.score != null ? String(k.score) : '', oninput: (e) => { const x = e.target.value === '' ? null : Number(e.target.value); k.score = x != null && Number.isFinite(x) && x >= 0 && x <= k.max ? x : null; e.target.setAttribute('aria-invalid', e.target.value !== '' && k.score == null ? 'true' : 'false'); save(); } })) : null,
        h('label', { class: 'field' }, h('span', {}, k.max > 0 ? 'Reason for this score' : 'How your work meets this'), h('textarea', { rows: 2, maxlength: '2000', value: k.reason, placeholder: 'What your work does, or doesn’t yet do, for this criterion.', oninput: (e) => { k.reason = e.target.value; save(); } })),
        h('label', { class: 'field', for: id + '-e' }, h('span', {}, 'Evidence from your work'), ev),
        hlOpts.length ? h('label', { class: 'field as-ins' }, h('span', { class: 'small' }, 'Add one of your highlights as evidence'),
          h('select', { onchange: (e) => { const x = v.highlights.find((y) => y.id === e.target.value); if (x) { k.evidence = (k.evidence ? k.evidence.replace(/\s*$/, '') + '\n' : '') + '“' + x.quote + '”'; ev.value = k.evidence; save(); } e.target.value = ''; } }, h('option', { value: '' }, 'Choose a highlight…'), hlOpts.map((o) => o.cloneNode(true)))) : null,
        h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: k.improve, onchange: (e) => { k.improve = e.target.checked; save(); } }), h('span', {}, 'Flag this criterion for improvement')));
    });
    const notes = [];
    if (cm.mode === 'rubric') notes.push('The rubric gives each criterion a name and points only. No descriptions of performance levels were written for it, so none are shown; the judgment is yours.');
    if (cm.mode === 'holistic') notes.push('No rubric was written for this assignment, so you give one overall score out of its ' + a.points + ' points.');
    if (cm.mode === 'reflect') notes.push('These criteria have no points. Describe how your work meets each one; the assignment is tracked as complete or not.');
    const rec = st.recorded;
    const out = [
      h('h4', { class: 'minor' }, 'Your assessment of version ' + v.n),
      notes.map((x) => h('p', { class: 'small muted' }, x)),
      h('ol', { class: 'as-crits' }, cards),
      live ? h('label', { class: 'field' }, h('span', {}, as.criteria.length ? 'Overall reflection (optional)' : 'Your reflection'), h('textarea', { rows: 3, maxlength: '3000', value: as.overall, oninput: (e) => { as.overall = e.target.value; save(); } }))
        : as.overall ? h('p', {}, h('span', { class: 'as-k' }, 'Overall: '), as.overall) : null,
      totalEl];
    if (live) {
      refresh();
      out.push(h('p', { class: 'small muted' }, a.points > 0 ? 'Completing records the total as your self-assessed score on the Grades page. It is your own assessment, not an independent evaluation.' : 'Completing marks this assessment done. There is no score.'),
        h('div', { class: 'btn-row' }, btn));
    } else {
      const t = A.totals(as), sc = A.toPoints(t, a.points);
      totalEl.textContent = t.max > 0 ? 'Total: ' + t.score + ' / ' + t.max + (sc != null && t.max !== a.points ? ' (' + sc + ' / ' + a.points + ' points)' : '') + '.' : '';
      out.push(h('p', { class: 'small muted' }, done(as) ? 'Completed ' + when(as.completedAt) + '. Self-assessed: your own judgment, not an independent evaluation.' : 'This assessment was not finished, so it recorded no score.'));
      if (editable) out.push(h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { as.completedAt = ''; log(st, 'Reopened the self-assessment of version ' + v.n + ' to edit it.'); commit(); } }, 'Edit this assessment')));
    }
    if (live && rec && rec.v === v.n) out.push(h('p', { class: 'small muted' }, 'Your recorded score (' + rec.score + ' / ' + rec.points + ') is from when you completed this assessment. It updates when you complete it again.'));
    return h('section', { class: 'as-rubric' }, out);
  }

  // Goals set after the previous version, and how far this version met them (your call).
  function followUp(a, v, editable) {
    const prev = a.studio.versions[v.n - 2];
    if (!prev || !prev.goals.length) return null;
    return h('section', { class: 'as-follow' },
      h('h4', { class: 'minor' }, 'Your revision goals from version ' + prev.n),
      h('ul', { class: 'as-goals' }, prev.goals.map((g) => h('li', {},
        h('span', {}, g.text || '(no wording)', g.criterion ? h('span', { class: 'small muted' }, ' · ' + g.criterion) : null),
        editable ? h('select', { 'aria-label': 'Did version ' + v.n + ' meet this goal?', onchange: (e) => { g.status = e.target.value; S.save(); } },
          Object.entries(GOAL).map(([k, l]) => h('option', { value: k, selected: g.status === k }, l))) : badge(GOAL[g.status], 'soft')))));
  }

  /* ----- the workflow, as a strip of steps ----- */
  function steps(a) {
    const st = a.studio, v = latest(st), assessed = done(v.assessment), many = st.versions.length > 1;
    const list = [
      ['Submit', true],
      ['Self-assess', many ? done(st.versions[0].assessment) : assessed],
      ['Set revision goals', st.versions.some((x) => x.goals.length)],
      ['Revise and resubmit', many],
      ['Reassess', many && assessed],
      ['Finalize', !!st.finalizedAt]];
    return h('ol', { class: 'as-steps', 'aria-label': 'Assessment steps' }, list.map(([t, ok]) => h('li', { class: ok ? 'is-done' : '' }, h('span', { class: 'sr-only' }, ok ? 'Done: ' : 'Not yet: '), t)));
  }

  /* ----- tabs ----- */
  function assessTab(c, m, a) {
    const st = a.studio, v = st.finalizedAt ? st.versions[st.finalV - 1] : latest(st), editable = !st.finalizedAt && v === latest(st);
    return [
      steps(a),
      h('p', { class: 'as-ver' }, badge('Version ' + v.n, 'solid'), ' ', v.late ? badge('Late', 'warn') : null, ' ', v.imported ? badge('AI review, imported', 'soft') : null, ' ', h('span', { class: 'small muted' }, 'Submitted ' + when(v.at)),
        st.finalizedAt ? h('span', { class: 'small' }, ' · Final version') : null),
      checksView(a, v),
      highlightsView(a, v, editable),
      followUp(a, v, editable),
      rubricView(c, m, a, v, editable)];
  }

  function goalsView(a, v) {
    const crit = v.assessment ? v.assessment.criteria : A.criteriaOf(a).list;
    const flagged = v.assessment ? v.assessment.criteria.filter((k) => k.improve && !v.goals.some((g) => g.criterion === k.name)) : [];
    return h('section', { class: 'as-goalset' },
      h('h4', { class: 'minor' }, 'Revision goals for version ' + (v.n + 1)),
      h('p', { class: 'small muted' }, 'What you will change, in your own words. You mark how far the next version met each goal when you assess it.'),
      v.goals.length ? h('ol', { class: 'as-goals' }, v.goals.map((g) => h('li', {},
        h('input', { type: 'text', maxlength: '500', value: g.text, placeholder: 'A goal, for example “Name the reading each claim draws on.”', 'aria-label': 'Revision goal', oninput: (e) => { g.text = e.target.value; S.save(); } }),
        crit.length ? h('select', { 'aria-label': 'Criterion for this goal', onchange: (e) => { g.criterion = e.target.value; S.save(); } }, h('option', { value: '' }, 'Any criterion'), crit.map((k) => h('option', { value: k.name, selected: g.criterion === k.name }, k.name))) : null,
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { v.goals = v.goals.filter((x) => x !== g); commit(); } }, 'Remove')))) : h('p', { class: 'small muted' }, 'No goals yet.'),
      h('div', { class: 'btn-row' },
        v.goals.length < 12 ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { v.goals.push({ id: S.uid(), text: '', criterion: '', status: 'open' }); commit(); } }, 'Add a goal') : null,
        flagged.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { flagged.slice(0, 12 - v.goals.length).forEach((k) => v.goals.push({ id: S.uid(), text: '', criterion: k.name, status: 'open' })); commit(); } }, 'Add one for each criterion you flagged (' + flagged.length + ')') : null));
  }

  function finalizeView(a) {
    const st = a.studio, x = u(a), need = a.points > 0;
    const ok = st.versions.filter((v) => !need || done(v.assessment));
    const pick = x.pick && ok.some((v) => v.n === x.pick) ? x.pick : ok.length ? ok[ok.length - 1].n : 0;
    if (!ok.length) return h('section', { class: 'as-final' }, h('h4', { class: 'minor' }, 'Finalize'), h('p', { class: 'small muted' }, 'Complete a self-assessment first. Only an assessed version can be finalized, and only its score is recorded.'));
    const scoreOf = (v) => { if (!need) return ''; const s = A.toPoints(A.totals(v.assessment), a.points); return s != null ? ' · self-assessed ' + s + ' / ' + a.points : ''; };
    return h('section', { class: 'as-final' },
      h('h4', { class: 'minor' }, 'Finalize'),
      h('p', { class: 'small muted' }, 'When you are done revising, choose your final version. Its self-assessed score becomes your recorded grade. Every version stays in History, and you can reopen later.'),
      h('fieldset', { class: 'as-pick' }, h('legend', { class: 'small' }, 'Final version'),
        ok.map((v) => h('label', { class: 'consent' }, h('input', { type: 'radio', name: 'fin-' + a.id, value: String(v.n), checked: v.n === pick, onchange: () => { x.pick = v.n; x.confirm = 0; S.render(false); } }), h('span', {}, 'Version ' + v.n + ' · ' + when(v.at) + scoreOf(v))))),
      x.confirm === pick
        ? h('div', { class: 'callout' }, h('p', {}, 'Finalize version ' + pick + '? ' + (need ? 'Your recorded grade will be its self-assessed score.' : 'The assignment will be marked complete.')),
          h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => finalize(a, pick) }, 'Yes, finalize'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { x.confirm = 0; S.render(false); } }, 'Cancel')))
        : h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { x.confirm = pick; S.render(false); } }, 'Finalize version ' + pick + '…')));
  }

  function reviseTab(c, m, a) {
    const st = a.studio, v = latest(st);
    if (st.finalizedAt) return [steps(a),
      h('div', { class: 'callout' }, h('p', {}, badge('Final', 'solid'), ' Version ' + st.finalV + ' was finalized on ' + when(st.finalizedAt) + '.'),
        h('p', { class: 'small muted' }, 'Reopen to submit another version. Your history and recorded score stay as they are until you complete a new assessment.'),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => reopen(a) }, 'Reopen for revision')))];
    const gate = A.canAdd(a);
    return [
      steps(a),
      done(v.assessment) ? null : h('p', { class: 'banner', role: 'note' }, 'Version ' + v.n + ' has not been self-assessed yet. ', h('a', { href: tabHref(c, a, 'assess') }, 'Assess it first'), ', then set goals for the next version. You can still submit a revision now.'),
      goalsView(a, v),
      h('section', { class: 'as-resubmit' }, h('h4', { class: 'minor' }, 'Submit version ' + (v.n + 1)),
        gate ? h('p', { class: 'small muted' }, gate) : S.revisionForm(c, m, a, v.n + 1)),
      finalizeView(a)];
  }

  function versionView(a, v, open) {
    const st = a.studio, as = v.assessment;
    return h('details', { class: 'as-version', open: open || null },
      h('summary', {}, 'Version ' + v.n + ' · ' + when(v.at), v.late ? ' · late' : '', st.finalV === v.n ? ' · final' : '', as ? (done(as) ? ' · self-assessed' + (A.totals(as).max > 0 ? ' ' + A.totals(as).score + ' / ' + A.totals(as).max : '') : ' · assessment not finished') : ' · not assessed'),
      h('div', { class: 'wp-body' },
        v.imported ? h('p', { class: 'small muted' }, 'This version came with a backup from the full app, where the AI reviewed it. That review is on the Imported AI review tab.') : null,
        v.note ? h('p', {}, h('span', { class: 'as-k' }, 'What changed: '), v.note) : null,
        v.text ? markedText(v) : S.fileLine(v),
        v.text && v.fileName ? S.fileLine(v) : null,
        v.highlights.length ? [h('h5', {}, 'Highlights'), highlightList(a, v, false)] : null,
        as ? [h('h5', {}, 'Self-assessment'), rubricView(null, null, a, v, false)] : null,
        v.goals.length ? [h('h5', {}, 'Revision goals set after this version'), h('ul', { class: 'as-goals' }, v.goals.map((g) => h('li', {}, g.text || '(no wording)', g.criterion ? ' · ' + g.criterion : '', ' — ', GOAL[g.status])))] : null));
  }

  function historyTab(c, m, a) {
    const st = a.studio, vs = st.versions.slice().reverse();
    return [
      h('p', { class: 'small muted' }, st.versions.length + (st.versions.length === 1 ? ' version' : ' versions') + ', newest first. Nothing here is ever replaced or deleted by the app.'),
      vs.map((v, i) => versionView(a, v, i === 0)),
      st.log.length ? h('details', { class: 'as-log' }, h('summary', {}, 'Activity'), h('ol', { class: 'plain small' }, st.log.slice().reverse().map((l) => h('li', {}, when(l.at) + ' · ' + l.what)))) : null];
  }

  // The workbench asks for these when the assignment has submitted work.
  A.parts = function (c, m, a) {
    const st = A.ensure(a), v = latest(st);
    if (!v) return null;
    return {
      assess: () => assessTab(c, m, a),
      revise: () => reviseTab(c, m, a),
      history: () => historyTab(c, m, a),
      flag: !st.finalizedAt && !done(v.assessment) ? 'Not assessed yet' : '',
    };
  };
})(window.Sovereign = window.Sovereign || {});
