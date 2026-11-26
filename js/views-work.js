/* sovereign. (AI-off copy) — submitting work. Replaces the full app's file of the same name.
   Submitting saves your work on this device: typed text, or a file of any common kind. Nothing is sent anywhere, and there is no review deadline.
   Reviews made by the AI in the full app, if a backup from it was imported, are shown read-only and labelled as such; none can be made here.
   Every submission is kept as a version in the Guided Assessment Studio (js/assess.js), where you assess it yourself. */
(function (S) {
  'use strict';
  const { h, toast, commit, badge } = S;
  const drafts = {}; // draft key -> { text, file, busy, err }
  // Typed text is kept in this browser (not in backups) so a refresh or a tab switch can't lose it. Files are never kept until you submit.
  const DKEY = 'sovereign.aioff.drafts.v1';
  const readDrafts = () => { try { return JSON.parse(localStorage.getItem(DKEY)) || {}; } catch (e) { return {}; } };
  const writeDraft = (key, text) => { try { const all = readDrafts(); if (text) all[key] = text; else delete all[key]; localStorage.setItem(DKEY, JSON.stringify(all)); } catch (e) { /* storage blocked: the in-memory draft still works */ } };
  const dr = (key) => drafts[key] || (drafts[key] = { text: String(readDrafts()[key] || ''), file: null, note: '', busy: false, err: '' });
  const dropDraft = (key) => { drafts[key] = null; writeDraft(key, ''); };
  S.hasDraft = (key) => !!((drafts[key] && drafts[key].text) || readDrafts()[key]);

  const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const money = (n) => '$' + (n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2));
  const list = (items, cls) => (items && items.length ? h('ul', { class: cls || 'plain' }, items.map((x) => h('li', {}, x))) : null);

  // What is stored for one submission. Text files are also read as text so the work can be shown and searched. Throws an Error with a plain message.
  async function prepare(d, fileOnly) {
    const f = d.file, L = S.FILE_LIMITS;
    if (!f) {
      if (fileOnly) throw new Error('This assignment needs a table, chart, or similar layout, so choose a PDF, Excel file, or image to submit.');
      const t = d.text.trim();
      if (!t) throw new Error('Write your answer or choose a file first.');
      if (t.length > L.text) throw new Error('That is longer than one typed entry can hold (about ' + L.text.toLocaleString() + ' characters). Save it as a file and submit the file instead.');
      return { stored: { text: t } };
    }
    const chk = S.files.check(f, fileOnly);
    if (!chk.ok) throw new Error(chk.msg);
    if (f.size > L.attach) throw new Error('That file is over 25 MB, which is more than this browser can keep.');
    const kind = S.files.classify(f);
    let text = '';
    if (kind === 'text') {
      text = (await S.files.readText(f)).trim();
      if (!text) throw new Error('That file is empty.');
      if (text.length > L.text) text = ''; // a long text file is kept as a file only
    }
    return { blob: f, stored: { text, fileName: f.name, fileType: f.type || '', fileSize: f.size } };
  }

  async function submit(c, m, a) {
    const d = dr(a.id), fileOnly = a.format === 'file';
    d.err = '';
    const gate = S.assess.canAdd(a);
    if (gate) { d.err = gate; S.render(false); return; }
    d.busy = true; S.render(false);
    let fileId = '';
    try {
      const p = await prepare(d, fileOnly);
      const at = new Date();
      if (p.blob) { fileId = S.uid(); await S.files.put(fileId, p.blob); }
      const sub = { text: '', fileId, fileName: '', fileType: '', fileSize: 0, ...p.stored, at: at.toISOString(), late: S.isLate(a, at.getTime()), feedback: null };
      const old = a.work;
      // An AI review imported from the full app is kept as a short record (when, score, criteria, findings) when new work replaces it.
      const kept = old && old.first && old.first.feedback ? S.summarizeReview(old.first) : old && old.firstSummary ? old.firstSummary : old && old.final && old.final.feedback ? S.summarizeReview(old.final) : null;
      const n = S.assess.addVersion(a, sub, d.note); // before a.work changes, so older work becomes version 1 first
      a.work = { phase: 'final', deadline: '', first: null, final: sub, ...(kept ? { firstSummary: kept } : {}) };
      a.done = true;
      if (a.kind === 'demonstrate') a.portfolio = true; // demonstrate work is saved to the course portfolio (the learner can remove it)
      // Earlier versions and their files are kept: they are the assessment history.
      dropDraft(a.id);
      S.save(); toast(n > 1 ? 'Version ' + n + ' submitted. Earlier versions are kept in History.' : 'Submitted. Your work is saved on this device. Next, assess it yourself.');
    } catch (e) {
      if (fileId) S.files.del(fileId);
      d.err = e && e.message ? e.message : 'Something went wrong. Please try again.';
    }
    if (drafts[a.id]) drafts[a.id].busy = false;
    S.render(false);
  }

  function inputForm(c, m, a, o) {
    const d = dr(a.id), fileOnly = a.format === 'file';
    const fc = S.files.check(d.file, fileOnly);
    const go = h('button', { class: 'btn', type: 'button', disabled: d.busy || !fc.ok, onclick: () => submit(c, m, a) }, d.busy ? 'Saving…' : o.label);
    const fileIn = h('input', { type: 'file', disabled: d.busy, onchange: (e) => { d.file = e.target.files[0] || null; d.err = ''; S.render(false); } });
    return h('div', { class: 'submit-box' },
      d.err ? h('p', { class: 'banner error', role: 'alert' }, d.err) : null,
      !fc.ok ? h('p', { class: 'banner error', role: 'alert' }, fc.msg) : null,
      fileOnly
        ? h('p', { class: 'small muted' }, 'This assignment needs a table, chart, or similar layout, so it can’t be typed in a text box. Submit a PDF, an Excel (.xlsx) file, or an image.')
        : h('label', { class: 'field' }, h('span', {}, o.textLabel || 'Your work'),
          h('textarea', { rows: 6, placeholder: 'Type or paste your answer here, or choose a file below.', disabled: d.busy || !!d.file, value: d.text, oninput: (e) => { d.text = e.target.value; writeDraft(a.id, d.text); } })),
      o.note ? h('label', { class: 'field' }, h('span', {}, 'What did you change in this version? (optional)'),
        h('textarea', { rows: 2, maxlength: '1000', disabled: d.busy, value: d.note, oninput: (e) => { d.note = e.target.value; } })) : null,
      h('label', { class: 'field' }, h('span', {}, fileOnly ? 'Your file (PDF, Excel, or image)' : 'Or a file (TXT, MD, CSV, PDF, PNG, JPG, WEBP, GIF, or XLSX)'), fileIn,
        h('small', {}, d.file ? 'Selected: ' + d.file.name + (fileOnly ? '.' : '. It will be used instead of the text above.') : 'Files up to 25 MB. They are kept in this browser only and are not part of backups.')),
      h('div', { class: 'btn-row' }, go,
        d.file ? h('button', { class: 'btn ghost', type: 'button', disabled: d.busy, onclick: () => { d.file = null; S.render(false); } }, 'Clear file') : null));
  }

  /* ----- reviews imported from the full app (read-only) ----- */

  // The full app's reviewer used to cut a criterion name at 120 characters, though assignment criteria run to 200. Show the full rubric wording when a saved name is a cut-off start of it.
  let curRubric = [];
  const fullName = (k, rubric) => { const r = (rubric || curRubric).find((x) => x.name === k.name || (k.name.length >= 100 && x.name.startsWith(k.name))); return r ? r.name : k.name; };
  function legacyFeedback(f, showScore, office, a) {
    const rub = a && a.rubric && a.rubric.length ? a.rubric : curRubric;
    return h('div', { class: 'feedback' },
      f.legacyWorker ? h('p', { class: 'banner' }, 'This review was made by an older version of the full app’s reviewer, which did not receive the full assignment context or give evidence for each point.') : null,
      f.summary ? h('p', {}, f.summary) : null,
      f.strengths.length ? h('div', {}, h('h4', { class: 'minor' }, 'What’s working'), list(f.strengths)) : null,
      f.improvements.length ? h('div', {}, h('h4', { class: 'minor' }, 'What to change'), list(f.improvements)) : null,
      f.nextSteps.length ? h('div', {}, h('h4', { class: 'minor' }, 'Next steps'), list(f.nextSteps)) : null,
      f.criteria.length ? h('div', {}, h('h4', { class: 'minor' }, showScore ? 'By criterion' : 'Criteria this was reviewed against'),
        h('ul', { class: 'plain' }, f.criteria.map((k) => h('li', {}, h('b', {}, fullName(k, rub)), showScore ? ' · ' + k.score + ' / ' + k.max : '', k.comment ? ' — ' + k.comment : '')))) : null,
      h('p', { class: 'small muted' }, 'Reviewed by AI in the full app on ' + when(f.at) + (f.cost ? ' · about ' + money(f.cost) : '') + (office ? '. Practice feedback only: nothing here is graded.' : '. An automated assessment, not a human grade. Imported with a backup; this copy cannot make reviews.')));
  }

  const FTYPE = {
    strength: ['Working well', 'ok', 'Correct or well done.'],
    error: ['Verified error', 'warn', 'A mistake the AI checked and quoted from your work.'],
    missing: ['Missing', 'warn', 'A required element the AI could not find anywhere in your work.'],
    partial: ['Partly supported', 'warn', 'Present, but only partly correct or not fully supported.'],
    clarity: ['Clarity', 'soft', 'Correct, but could be clearer. Not an error, and never a reason to lose points.'],
    optional: ['Optional', 'soft', 'Enrichment beyond what is required. Never a reason to lose points.'],
    unverified: ['Could not verify', 'soft', 'The AI could not check this (for example a claim about a reading), so nothing is concluded from it.'],
  };
  const GROUPS = [['strength', 'What’s working'], ['error', 'Verified errors'], ['missing', 'Missing required elements'], ['partial', 'Partly supported'], ['clarity', 'Clarity and presentation'], ['optional', 'Optional ideas'], ['unverified', 'Could not be verified']];
  const FOLLOW = { addressed: 'Addressed', partly: 'Partly addressed', 'not-addressed': 'Not yet addressed', 'cannot-tell': 'Could not tell' };
  const CSTATUS = { met: 'Met', partly: 'Partly met', 'not-met': 'Not met', 'not-assessed': 'Not assessed' };

  function findingView(f) {
    const t = FTYPE[f.type] || FTYPE.optional;
    return h('li', { class: 'finding f-' + f.type },
      h('div', { class: 'f-head' }, h('span', { class: 'badge ' + t[1], title: t[2] }, t[0]), f.criterion ? h('span', { class: 'small muted' }, 'Criterion: ' + f.criterion) : null),
      h('p', { class: 'f-claim' }, f.claim),
      f.quote ? h('blockquote', { class: 'f-quote' }, '“' + f.quote + '”', h('span', { class: 'small muted' }, f.located === true ? ' Found in your text' + (f.where ? ' (' + f.where + ')' : '') + '.' : f.located === false ? ' Not found exactly in your text.' : ' Quoted by the AI from your file. This app could not check where it is.')) : null,
      S.exhibitsView.refLine(f),
      f.note ? h('p', { class: 'small muted' }, f.note) : null,
      f.caution ? h('p', { class: 'small' }, f.caution) : null,
      f.fix ? h('p', { class: 'f-fix' }, h('b', {}, 'Suggested change: '), f.fix) : null,
      f.example ? h('p', { class: 'f-example' }, h('b', {}, f.illustrative ? 'Illustration (not from your assignment materials): ' : 'Example: '), f.example) : null);
  }

  function feedbackView(f, showScore, office, a) {
    if (!f.findings || !f.context) return legacyFeedback(f, showScore, office, a);
    const rub = a && a.rubric && a.rubric.length ? a.rubric : curRubric, ins = f.inspection || {}, c = f.context;
    const assessed = f.criteria.filter((k) => k.assessed !== false);
    return h('div', { class: 'feedback' },
      h('details', { class: 'inspect' }, h('summary', {}, 'What the reviewer could see' + (ins.limited ? ' · review limitation' : '')),
        ins.received ? h('p', { class: 'small' }, ins.received) : null,
        list(ins.facts, 'plain small'),
        ins.couldNotInspect && ins.couldNotInspect.length ? h('div', {}, h('p', { class: 'small' }, h('b', {}, 'Could not read or see:')), list(ins.couldNotInspect, 'plain small')) : null),
      ins.limited ? h('p', { class: 'banner', role: 'status' }, 'Review limitation: ' + (f.criteria.length - assessed.length) + ' of ' + f.criteria.length + ' grading criteria could not be assessed because the AI could not read the evidence. They were left out, not scored low.') : null,
      f.summary ? h('p', {}, f.summary) : null,
      GROUPS.map(([ty, title]) => { const items = f.findings.filter((x) => x.type === ty); return items.length ? h('div', {}, h('h4', { class: 'minor' }, title), h('ul', { class: 'findings' }, items.map(findingView))) : null; }),
      !f.findings.length ? h('p', { class: 'small muted' }, 'The AI found nothing to flag.') : null,
      f.followUp && f.followUp.length ? h('div', {}, h('h4', { class: 'minor' }, 'Earlier points'), h('ul', { class: 'plain' }, f.followUp.map((x) => h('li', {}, h('b', {}, FOLLOW[x.status] || ''), ': ', x.claim, x.note ? ' — ' + x.note : '')))) : null,
      f.nextSteps.length ? h('div', {}, h('h4', { class: 'minor' }, 'Next steps (optional)'), list(f.nextSteps)) : null,
      f.criteria.length ? h('div', {}, h('h4', { class: 'minor' }, showScore ? 'By criterion' : 'Criteria this was reviewed against'),
        h('ul', { class: 'plain' }, f.criteria.map((k) => h('li', {}, h('b', {}, fullName(k, rub)), ' · ', CSTATUS[k.status] || '', showScore && k.assessed !== false ? ' · ' + k.score + ' / ' + k.max : '', k.comment ? ' — ' + k.comment : '')))) : null,
      h('p', { class: 'small muted' }, 'Reviewed by AI in the full app on ' + when(f.at) + (f.cost ? ' · about ' + money(f.cost) : '') + (office ? '. Practice feedback only: nothing here is graded.' : '. An automated assessment, not a human grade.') + ' Imported with a backup; this copy cannot make reviews.' + (c.mode === 'practice' || c.mode === 'own' ? ' Ungraded practice.' : '')));
  }

  function fileLine(sub) {
    if (!sub || !sub.fileId) return sub && sub.fileName ? h('p', { class: 'small muted' }, 'File: ' + sub.fileName) : null;
    const slot = h('span', { class: 'small muted' }, sub.fileName + ' · checking this device…');
    S.files.get(sub.fileId).then((blob) => {
      slot.textContent = '';
      if (!blob) { slot.textContent = sub.fileName + ' · the file is not on this device (files are not part of backups).'; return; }
      const url = URL.createObjectURL(blob);
      slot.append(h('a', { href: url, download: sub.fileName || 'file', target: '_blank', rel: 'noopener' }, sub.fileName), ' · ' + Math.max(1, Math.round(sub.fileSize / 1024)) + ' KB · kept on this device only');
    }).catch(() => { slot.textContent = sub.fileName + ' · could not be read from this device.'; });
    return h('p', {}, slot);
  }

  // Review Studio (js/review-studio.js): imported work beside its imported review. Read-only; it never changes a grade or record.
  function studioButton(c, m, a, sub, o) {
    if (!sub || !sub.feedback || !S.reviewStudio) return null;
    return S.reviewStudio.button({ c, m, a, sub, feedback: sub.feedback, showScore: !!o.showScore, office: !!o.office, title: a.title, meta: o.meta || '', scoreLine: o.scoreLine || '', rubric: a.rubric || [], legacy: () => legacyFeedback(sub.feedback, !!o.showScore, !!o.office, a) });
  }

  // Save a finished piece to this course's Portfolio (or take it out). Demonstrate work is saved by default when it is submitted.
  S.portfolioToggle = function (a) {
    return h('div', { class: 'callout' },
      h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: a.portfolio, onchange: (e) => { a.portfolio = e.target.checked; commit(); toast(a.portfolio ? 'Saved to this course’s Portfolio.' : 'Removed from the Portfolio.'); } }),
        h('span', {}, 'Show this piece in this course’s Portfolio.' + (a.kind === 'demonstrate' ? ' (Saved by default for demonstrate work.)' : ''))),
      h('p', { class: 'small muted' }, 'Portfolios stay in this browser. Files are kept on this device only and aren’t included in backups.'));
  };

  // How a saved piece appears in the Portfolio: what it shows and the work itself. A review imported from the full app is labelled as such.
  S.portfolioPiece = function (c, m, a) {
    const f = a.work && a.work.final, fb = f && f.feedback, pct = fb ? S.pctOf(a) : null;
    return h('li', { class: 'plate' },
      h('div', { class: 'plate-top' }, a.kind ? S.kindMark(a.kind) : badge('Assignment', 'soft')),
      h('h3', { class: 'plate-title' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title)),
      a.portfolioNote ? h('p', { class: 'plate-dek' }, a.portfolioNote) : null,
      fb ? h('div', { class: 'plate-score' }, h('strong', {}, pct + '%'), h('span', {}, a.score + ' / ' + a.points + ' pts · ' + S.letter(pct))) : null,
      h('div', { class: 'item-meta' }, h('span', { class: 'code' }, c.code), h('span', { class: 'due' }, 'Module: ' + m.title),
        fb ? h('span', { class: 'badge soft' }, 'AI review, imported') : null, f && f.late ? h('span', { class: 'badge warn' }, 'Late') : null),
      h('details', { class: 'work-panel' }, h('summary', {}, 'The work' + (fb ? ' and the imported review' : '')),
        h('div', { class: 'wp-body' }, f && f.text ? h('p', { class: 'pre' }, f.text) : null, fileLine(f), fb ? feedbackView(fb, true) : null)));
  };

  S.fileLine = fileLine;
  // An Office Hours practice review imported from the full app, shown read-only on the Practice & reflection tab (js/practice.js).
  S.officeFeedback = (fb, a) => feedbackView(fb, false, true, a);
  // The form for the next version (Revise tab, js/assess.js).
  S.revisionForm = (c, m, a, n) => inputForm(c, m, a, { label: 'Submit version ' + n, textLabel: 'Your revised work', note: true });
  S.finalFeedbackOnly = (a) => feedbackView(a.work.final.feedback, true, false, a);
  S.finalFeedback = (a) => h('div', {}, feedbackView(a.work.final.feedback, true, false, a), fileLine(a.work.final));

  // The submission experience, split in two so the Assignment Workbench can put them on separate tabs:
  // submit: what to do now; feedback: an AI review imported from the full app, if there is one (null otherwise).
  S.workParts = function (c, m, a) {
    curRubric = a.rubric || [];
    const w = a.work;
    let submitPart, feedbackPart = null, state;
    if (!w) {
      state = 'none';
      submitPart = [
        h('p', { class: 'small muted' }, 'Submitting saves your work on this device. Then you assess it yourself, revise it as often as you like, and finalize it when you are done.'),
        a.due ? h('p', { class: 'small muted' }, 'Due ' + S.fmtDate(a.due) + '. Late work is accepted and marked late.') : null,
        inputForm(c, m, a, { label: 'Submit' })];
    } else if (w.phase === 'reviewed') {
      // Imported from the full app: a first AI review whose resubmission window belonged to that app. Here you simply submit your revised work.
      state = 'reviewed';
      submitPart = [
        h('p', {}, badge('Imported first version', 'soft'), ' ', w.first.late ? badge('Late', 'warn') : null, ' ', h('span', { class: 'small muted' }, 'Submitted ' + when(w.first.at))),
        fileLine(w.first),
        h('h4', { class: 'minor' }, 'Submit your revised work'),
        inputForm(c, m, a, { label: 'Submit revised work', textLabel: 'Your revised work', note: true })];
      feedbackPart = [
        h('p', {}, badge('First review, imported', 'soft'), ' ', h('span', { class: 'small muted' }, 'Submitted ' + when(w.first.at))),
        studioButton(c, m, a, w.first, { meta: 'First review, submitted ' + when(w.first.at) }),
        feedbackView(w.first.feedback, false), fileLine(w.first)];
    } else {
      const f = w.final, fb = f.feedback, pct = fb ? S.pctOf(a) : null;
      state = fb ? 'graded' : 'attached';
      const theWork = f.text ? h('details', { class: 'work-panel', open: !fb }, h('summary', {}, 'The work you submitted'), h('div', { class: 'wp-body' }, h('p', { class: 'pre' }, f.text))) : null;
      const st = S.assess.ensure(a), vn = st.versions.length, fin = !!st.finalizedAt, href = (t) => S.href(c, 'assignments', a.id + '/' + t);
      submitPart = [
        h('p', {}, badge(fin ? 'Final' : 'Submitted', 'solid'), ' ', badge('Version ' + (fin ? st.finalV : vn), 'soft'), ' ', f.late ? badge('Late', 'warn') : null, ' ', h('span', { class: 'small muted' }, when(f.at))),
        theWork, fileLine(f),
        fb ? h('p', { class: 'small muted' }, 'This work came with a backup from the full app, where the AI reviewed it.') : null,
        h('p', { class: 'small' }, fin ? ['This is your final version. Earlier versions are in ', h('a', { href: href('history') }, 'History'), '.']
          : ['Next: ', h('a', { href: href('assess') }, 'assess this version yourself'), ', then ', h('a', { href: href('revise') }, 'revise it or finalize it'), '.'])];
      feedbackPart = fb ? [
        h('div', { class: 'grade-line' }, badge('Imported', 'solid'), ' ', h('b', {}, a.score + ' / ' + a.points + ' pts'), ' · ', pct + '%', ' · ', h('b', {}, S.letter(pct))),
        h('p', { class: 'small muted' }, 'Submitted ' + when(f.at) + ' in the full app, where the AI reviewed it. An automated assessment, not a human grade.'),
        studioButton(c, m, a, f, { showScore: true, meta: 'Imported review, submitted ' + when(f.at), scoreLine: a.score + ' / ' + a.points + ' pts · ' + pct + '% · ' + S.letter(pct) }),
        h('p', {}, h('button', { class: 'btn ghost', type: 'button', onclick: () => S.publish.open('feedback', c, { assignmentId: a.id }) }, 'Save report as PDF')),
        feedbackView(fb, true), fileLine(f)] : null;
    }
    return { submit: submitPart, feedback: feedbackPart, state, busy: !!(drafts[a.id] && drafts[a.id].busy) };
  };

  // The single collapsible panel, kept for any caller that wants everything in one place.
  S.workPanel = function (c, m, a, forceOpen) {
    const w = a.work, key = 'wp:' + a.id, d0 = dr(a.id), p = S.workParts(c, m, a);
    const label = !w ? 'Submit work' : 'Submitted';
    const det = h('details', { class: 'work-panel', open: forceOpen || S.ui.open.has(key) || d0.busy || !!d0.err }, h('summary', {}, label), h('div', { class: 'wp-body' }, p.feedback ? [p.feedback, p.submit] : p.submit));
    det.addEventListener('toggle', () => { if (det.open) S.ui.open.add(key); else S.ui.open.delete(key); });
    return det;
  };
})(window.Sovereign);
