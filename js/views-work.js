/* sovereign. — submitting work, AI feedback, the 72-hour resubmission window, the final grade, and ungraded office hours. */
(function (S) {
  'use strict';
  const { h, toast, commit, badge } = S;
  const drafts = {}; // draft key -> { text, file, agree, busy, err, material }  (nothing is sent until the person agrees)
  // Typed text is kept in this browser (not in backups, never sent) so a refresh or a tab switch can't lose it. Consent and files are never kept.
  const DKEY = 'sovereign.aioff.drafts.v1';
  const readDrafts = () => { try { return JSON.parse(localStorage.getItem(DKEY)) || {}; } catch (e) { return {}; } };
  const writeDraft = (key, text) => { try { const all = readDrafts(); if (text) all[key] = text; else delete all[key]; localStorage.setItem(DKEY, JSON.stringify(all)); } catch (e) { /* storage blocked: the in-memory draft still works */ } };
  const dr = (key) => drafts[key] || (drafts[key] = { text: String(readDrafts()[key] || ''), file: null, agree: false, busy: false, err: '', material: '' });
  const dropDraft = (key) => { drafts[key] = null; writeDraft(key, ''); };
  S.hasDraft = (key) => !!((drafts[key] && drafts[key].text) || readDrafts()[key]);

  const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const money = (n) => (S.ai && S.ai.money ? S.ai.money(n) : '$' + n.toFixed(2));
  const list = (items, cls) => (items && items.length ? h('ul', { class: cls || 'plain' }, items.map((x) => h('li', {}, x))) : null);

  // What the AI is told, and what is stored. Returns { payload, stored, blob? } or throws an Error with a plain message.
  async function prepare(d, fileOnly) {
    const f = d.file, L = S.FILE_LIMITS;
    if (!f) {
      if (fileOnly) throw new Error('This assignment needs a table, chart, or similar layout, so choose a PDF, Excel file, or image to submit.');
      const t = d.text.trim();
      if (!t) throw new Error('Write your answer or choose a file first.');
      if (t.length > L.text) throw new Error('That is longer than the AI can review (about ' + L.text.toLocaleString() + ' characters). Shorten it or attach a PDF.');
      return { payload: { text: t, kind: 'text' }, stored: { text: t } };
    }
    const chk = S.files.check(f, fileOnly);
    if (!chk.ok) throw new Error(chk.msg);
    const kind = S.files.classify(f);
    if (kind === 'text') {
      if (fileOnly) throw new Error('This assignment needs a PDF, Excel file, or image, not a text file.');
      const t = (await S.files.readText(f)).trim();
      if (!t) throw new Error('That file is empty.');
      if (t.length > L.text) throw new Error('That file is longer than the AI can review (about ' + L.text.toLocaleString() + ' characters).');
      return { payload: { text: t, kind: 'textfile' }, stored: { text: t, fileName: f.name, fileType: f.type || 'text/plain', fileSize: f.size } };
    }
    if (kind === 'pdf') {
      if (f.size > L.pdf) throw new Error('That PDF is over the 2 MB the AI can review. Compress it, or attach it as evidence without AI feedback.');
      return { payload: { file: { mime: 'application/pdf', base64: await S.files.base64(f) }, kind: 'pdf' }, blob: f, stored: { fileName: f.name, fileType: 'application/pdf', fileSize: f.size } };
    }
    if (kind === 'image') {
      const r = await S.files.downscale(f);
      return { payload: { file: { mime: r.mime, base64: await S.files.base64(r.blob) }, kind: 'image' }, blob: r.blob, stored: { fileName: f.name, fileType: r.mime, fileSize: r.blob.size } };
    }
    if (kind === 'xlsx') {
      if (f.size > L.xlsx) throw new Error('That Excel file is over 5 MB. Save a smaller copy and try again.');
      const t = await S.files.xlsxToText(f); // cell values only; charts and formatting are not read
      return { payload: { text: t, kind: 'xlsx' }, blob: f, stored: { fileName: f.name, fileType: f.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileSize: f.size } };
    }
    throw new Error('The AI can review text, PDF, image, and Excel (.xlsx) files. Attach this one as evidence without AI feedback instead.');
  }

  // The first version, rebuilt from this device so it can be sent again ONLY if the learner agreed. Returns { prev } or { why } (never silently skipped).
  async function preparePrior(sub, current) {
    if (!sub) return { why: 'The first version is not available.' };
    try {
      if (!sub.fileId) return sub.text ? { prev: { text: sub.text } } : { why: 'The first version had no text saved.' };
      const blob = await S.files.get(sub.fileId);
      if (!blob) return { why: 'The first version’s file is not on this device (files are not part of backups), so it cannot be compared.' };
      const t = String(sub.fileType || '');
      if (t === 'application/pdf' || t.startsWith('image/')) {
        const b64 = await S.files.base64(blob);
        if (b64.length + ((current && current.file && current.file.base64) || '').length > 3.2 * 1024 * 1024) return { why: 'The first and revised files together are too large to send for a comparison.' };
        return { prev: { file: { mime: t, base64: b64 } } };
      }
      if (sub.text) return { prev: { text: sub.text } };
      if (/spreadsheet|excel|xlsx/i.test(t) || /\.xlsx$/i.test(sub.fileName || '')) return { prev: { text: await S.files.xlsxToText(blob) } };
      return { why: 'That kind of file cannot be re-sent for a comparison.' };
    } catch (e) { return { why: 'The first version could not be read from this device.' }; }
  }

  async function submit(c, m, a, round) {
    const d = dr(a.id), fileOnly = a.format === 'file';
    d.err = ''; d.busy = true; S.render(false);
    let fileId = '';
    try {
      const p = await prepare(d, fileOnly);
      const at = new Date();
      if (p.blob) { fileId = S.uid(); await S.files.put(fileId, p.blob); }
      if (round === 2 && d.prior) {
        const pr = await preparePrior(a.work && a.work.first, p.payload);
        if (!pr.prev) throw new Error(pr.why + ' Untick “Also send my first version” to continue with the earlier findings only.');
        p.payload.previous = pr.prev;
      }
      const learner = d.sendData && S.myData && S.myData.eligible(a, 'assignment') ? await S.myData.forReview(a, 'assignment', d.sendVer) : null; // only if they ticked it for THIS review
      const fb = await S.ai.review(c, m, a, p.payload, round, learner ? { learner } : undefined);
      if (learner) fb.data = learner.ref; // remember exactly which dataset version this review was given
      d.sendData = false; d.sendVer = ''; // never carried over to a later review
      // keep the rubric the AI wrote at the first review so a second review grades the same criteria
      if (round === 1 && !(a.rubric && a.rubric.length)) a.rubric = fb.criteria.map((k) => ({ name: k.name, max: k.max }));
      const sub = { text: '', fileId, fileName: '', fileType: '', fileSize: 0, ...p.stored, at: at.toISOString(), late: round === 1 ? S.isLate(a, at.getTime()) : !!(a.work && a.work.first && a.work.first.late), feedback: fb };
      if (round === 1) a.work = { phase: 'reviewed', deadline: new Date(at.getTime() + S.REVIEW_HOURS * 3600000).toISOString(), first: sub, final: null };
      else S.finalizeWork(a, sub);
      dropDraft(a.id); // the draft is gone once it is saved
      S.save(); toast(round === 1 ? 'Feedback is ready. Your grade comes after you resubmit or the 72 hours end.' : 'Your final grade is in.');
    } catch (e) {
      if (fileId) S.files.del(fileId);
      d.err = e && e.message ? e.message : 'Something went wrong. Please try again.';
    }
    if (drafts[a.id]) drafts[a.id].busy = false;
    S.render(false);
  }

  // Office hours: the same flow, but for material the learner chose, with no grade and no record in the Grades page or Portfolio.
  async function officeSubmit(c, m, a, round) {
    const key = 'oh:' + a.id, d = dr(key);
    d.err = ''; d.busy = true; S.render(false);
    let fileId = '';
    try {
      const mode = round === 1 ? (d.mode === 'own' ? 'own' : 'practice') : (a.office && a.office.mode) || 'own';
      const material = mode === 'practice' ? '' : round === 1 ? d.material.trim() : (a.office && a.office.material) || '';
      if (round === 1 && mode === 'own' && !material) throw new Error('Tell the AI which article, reading, or example you are working from.');
      const p = await prepare(d, false);
      if (round === 2 && d.prior) {
        const pr = await preparePrior(a.office && a.office.rounds[0], p.payload);
        if (!pr.prev) throw new Error(pr.why + ' Untick “Also send my first version” to continue with the earlier findings only.');
        p.payload.previous = pr.prev;
      }
      const at = new Date();
      if (p.blob) { fileId = S.uid(); await S.files.put(fileId, p.blob); }
      const learner = d.sendData && S.myData && S.myData.eligible(a, 'office') ? await S.myData.forReview(a, 'office', d.sendVer) : null;
      const fb = await S.ai.office(c, m, a, p.payload, round, material, mode, learner ? { learner } : undefined);
      if (learner) fb.data = learner.ref;
      d.sendData = false; d.sendVer = '';
      const sub = { text: '', fileId, fileName: '', fileType: '', fileSize: 0, ...p.stored, at: at.toISOString(), late: false, feedback: fb };
      a.office = { ...(a.office || {}), material, mode, rounds: ((a.office && a.office.rounds) || []).concat([sub]) };
      dropDraft(key); S.save(); toast(round === 1 ? 'Office-hours feedback is ready. It isn’t graded.' : 'Second round of feedback is ready. Nothing here is graded.');
    } catch (e) {
      if (fileId) S.files.del(fileId);
      d.err = e && e.message ? e.message : 'Something went wrong. Please try again.';
    }
    if (drafts[key]) drafts[key].busy = false;
    S.render(false);
  }

  // Attach a file as evidence only (any type, no AI review, no grade).
  async function attachOnly(c, m, a) {
    const d = dr(a.id);
    if (!d.file) { d.err = 'Choose a file first.'; return S.render(false); }
    if (d.file.size > S.FILE_LIMITS.attach) { d.err = 'That file is over 25 MB, which is more than this browser can keep.'; return S.render(false); }
    d.busy = true; d.err = ''; S.render(false);
    const id = S.uid();
    try {
      await S.files.put(id, d.file);
      const at = new Date();
      a.work = { phase: 'final', deadline: '', first: null, final: { text: '', fileId: id, fileName: d.file.name, fileType: d.file.type || '', fileSize: d.file.size, at: at.toISOString(), late: S.isLate(a, at.getTime()), feedback: null } };
      a.done = true; dropDraft(a.id); S.save(); toast('Attached. This is kept on this device only.');
    } catch (e) { S.files.del(id); d.err = 'This browser couldn’t store that file (it may be out of space or in private mode).'; d.busy = false; }
    S.render(false);
  }

  // o: { key, label, fileOnly, onSend, attach (offer "attach without feedback"), material (ask which material) }
  function inputForm(c, m, a, o) {
    const d = dr(o.key);
    const agree = h('input', { type: 'checkbox', checked: d.agree, disabled: d.busy, onchange: (e) => { d.agree = e.target.checked; go.disabled = !d.agree || d.busy || !fc.ok; } });
    const fc = S.files.check(d.file, o.fileOnly); // an unsupported or oversize file can't be sent for AI review (it can still be attached as evidence)
    const go = h('button', { class: 'btn', type: 'button', disabled: !d.agree || d.busy || !fc.ok, onclick: o.onSend }, d.busy ? 'Reviewing…' : o.label);
    const fileIn = h('input', { type: 'file', disabled: d.busy, onchange: (e) => { d.file = e.target.files[0] || null; d.err = ''; S.render(false); } });
    const sending = d.file ? (S.files.classify(d.file) === 'xlsx' ? 'The cell values (as text) from “' + d.file.name + '”' : 'The file “' + d.file.name + '”') : 'The text you typed';
    return h('div', { class: 'submit-box' },
      d.err ? h('p', { class: 'banner error', role: 'alert' }, d.err) : null,
      !fc.ok ? h('p', { class: 'banner error', role: 'alert' }, fc.msg) : null,
      o.modePick ? h('fieldset', { class: 'mode-pick' }, h('legend', {}, 'What should the AI evaluate?'),
        [['practice', 'Practice this assignment', 'Your draft is reviewed against this assignment’s instructions, supplied materials and grading criteria. No grade, and nothing changes in your record.'],
          ['own', 'Explore with my own materials', 'Use a different article, document, case or dataset you chose. The AI judges your work within that material. No grade.']].map(([v, t, d2]) =>
          h('label', { class: 'consent' }, h('input', { type: 'radio', name: 'oh-mode', checked: (d.mode || 'practice') === v, disabled: d.busy, onchange: () => { d.mode = v; S.render(false); } }), h('span', {}, h('b', {}, t), ' ', h('span', { class: 'small muted' }, d2))))) : null,
      o.material && (!o.modePick || d.mode === 'own') ? h('label', { class: 'field' }, h('span', {}, 'What are you working from?'),
        h('input', { type: 'text', maxlength: '300', disabled: d.busy, value: d.material, placeholder: 'e.g. the title and link of the article you chose', oninput: (e) => { d.material = e.target.value; } })) : null,
      o.fileOnly
        ? h('p', { class: 'small muted' }, 'This assignment needs a table, chart, or similar layout, so it can’t be typed in a text box. Submit a PDF, an Excel (.xlsx) file, or an image.')
        : h('label', { class: 'field' }, h('span', {}, o.textLabel || 'Your work'),
          h('textarea', { rows: 6, placeholder: 'Type or paste your answer here, or choose a file below.', disabled: d.busy || !!d.file, value: d.text, oninput: (e) => { d.text = e.target.value; writeDraft(o.key, d.text); } })),
      h('label', { class: 'field' }, h('span', {}, o.fileOnly ? 'Your file (PDF, Excel, or image)' : 'Or a file (TXT, MD, CSV, PDF, PNG, JPG, WEBP, GIF, or XLSX)'), fileIn,
        h('small', {}, d.file ? 'Selected: ' + d.file.name + (o.fileOnly ? '.' : '. It will be used instead of the text above.') + (S.files.classify(d.file) === 'xlsx' ? ' Only cell values are read. Charts, images and formatting in Excel are not, so use a PDF or image if the AI needs to see them.' : '') : 'PDFs up to 2 MB. Excel files up to 5 MB (cell values only). Photos are shrunk automatically.')),
      o.prior ? h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: !!d.prior, disabled: d.busy, onchange: (e) => { d.prior = e.target.checked; S.render(false); } }),
        h('span', {}, 'Also send my first version (saved on this device) so the AI can compare it with this revision. If unticked, the AI sees only this revision and the earlier findings, and will say it could not compare the two.')) : null,
      o.dataScope && S.myData ? S.myData.authBox(a, o.dataScope, d) : null,
      h('label', { class: 'consent' }, agree, h('span', {}, sending + ' will be sent to the AI service to review. It is used for this review only and is not kept by the service. Send it?')),
      h('div', { class: 'btn-row' }, go,
        o.attach && d.file ? h('button', { class: 'btn ghost', type: 'button', disabled: d.busy, onclick: () => attachOnly(c, m, a) }, 'Attach without AI feedback') : null,
        d.file ? h('button', { class: 'btn ghost', type: 'button', disabled: d.busy, onclick: () => { d.file = null; S.render(false); } }, 'Clear file') : null));
  }

  // The Worker used to cut a criterion name at 120 characters, though assignment criteria run to 200. Show the full rubric wording when a saved name is a cut-off start of it.
  let curRubric = [];
  const fullName = (k, rubric) => { const r = (rubric || curRubric).find((x) => x.name === k.name || (k.name.length >= 100 && x.name.startsWith(k.name))); return r ? r.name : k.name; };
  // Reviews made before Worker v14 (and any saved feedback) show exactly as they always have.
  function legacyFeedback(f, showScore, office, a) {
    const rub = a && a.rubric && a.rubric.length ? a.rubric : curRubric;
    return h('div', { class: 'feedback' },
      f.legacyWorker ? h('p', { class: 'banner' }, 'This review used the AI service’s older method (it did not receive the full assignment context or give evidence for each point). Update the AI service to version 14 for evidence-based reviews.') : null,
      f.summary ? h('p', {}, f.summary) : null,
      f.strengths.length ? h('div', {}, h('h4', { class: 'minor' }, 'What’s working'), list(f.strengths)) : null,
      f.improvements.length ? h('div', {}, h('h4', { class: 'minor' }, 'What to change'), list(f.improvements)) : null,
      f.nextSteps.length ? h('div', {}, h('h4', { class: 'minor' }, 'Next steps'), list(f.nextSteps)) : null,
      f.criteria.length ? h('div', {}, h('h4', { class: 'minor' }, showScore ? 'By criterion' : 'Criteria this was reviewed against'),
        h('ul', { class: 'plain' }, f.criteria.map((k) => h('li', {}, h("b", {}, fullName(k, rub)), showScore ? ' · ' + k.score + ' / ' + k.max : '', k.comment ? ' — ' + k.comment : '')))) : null,
      h('p', { class: 'small muted' }, 'Reviewed by AI on ' + when(f.at) + (f.cost ? ' · about ' + money(f.cost) : '') + (office ? '. Practice feedback only: nothing here is graded.' : '. This is an automated assessment, not a human grade.')));
  }

  // Evidence-based reviews (Worker v14): what the reviewer could see, correct work first, then findings sorted by what kind of point they are.
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
    const ctxLine = [c.steps ? 'assignment steps' : '', c.materials ? 'supplied materials' : '', c.keyIdeas ? 'module key ideas' : ''].filter(Boolean).join(', ');
    const modeNote = c.mode === 'practice' ? 'Practice on this assignment: reviewed against its real instructions, materials and criteria. Ungraded.' : c.mode === 'own' ? 'Explore with your own material: reviewed against the material you named. Ungraded.' : '';
    const compNote = c.compared === 'both-versions' ? 'Compared with your first version (you agreed to send it).' : c.compared === 'findings-only' ? 'Your first version was not available to the AI, so it could not compare the two versions. It only knew the earlier findings.' : '';
    const assessed = f.criteria.filter((k) => k.assessed !== false);
    return h('div', { class: 'feedback' },
      modeNote ? h('p', { class: 'small muted' }, modeNote) : null,
      h('details', { class: 'inspect', open: !!(ins.limited || (ins.couldNotInspect && ins.couldNotInspect.length)) }, h('summary', {}, 'What the reviewer could see' + (ins.limited ? ' · review limitation' : '')),
        ins.received ? h('p', { class: 'small' }, ins.received) : null,
        list(ins.facts, 'plain small'),
        ins.couldNotInspect && ins.couldNotInspect.length ? h('div', {}, h('p', { class: 'small' }, h('b', {}, 'Could not read or see:')), list(ins.couldNotInspect, 'plain small')) : null,
        ctxLine ? h('p', { class: 'small muted' }, 'The reviewer was given: ' + ctxLine + (c.readings === 'titles-only' ? '; reading titles only (not their text)' : '') + '.') : null,
        compNote ? h('p', { class: 'small muted' }, compNote) : null),
      ins.limited ? h('p', { class: 'banner', role: 'status' }, 'Review limitation: ' + (f.criteria.length - assessed.length) + ' of ' + f.criteria.length + ' grading criteria could not be fairly assessed because the AI could not read the evidence. They were left out, not scored low. ' + (showScore ? 'The score below covers only the assessed criteria and is provisional. ' : '') + 'To have them assessed, resubmit in a supported format: typed text, a PDF with selectable text, or an Excel file with the values in cells.') : null,
      f.summary ? h('p', {}, f.summary) : null,
      GROUPS.map(([ty, title]) => { const items = f.findings.filter((x) => x.type === ty); return items.length ? h('div', {}, h('h4', { class: 'minor' }, title), h('ul', { class: 'findings' }, items.map(findingView))) : null; }),
      !f.findings.length ? h('p', { class: 'small muted' }, 'The AI found nothing to flag.') : null,
      f.followUp && f.followUp.length ? h('div', {}, h('h4', { class: 'minor' }, 'Earlier points'), h('ul', { class: 'plain' }, f.followUp.map((x) => h('li', {}, h('b', {}, FOLLOW[x.status] || ''), ': ', x.claim, x.note ? ' — ' + x.note : '')))) : null,
      f.nextSteps.length ? h('div', {}, h('h4', { class: 'minor' }, 'Next steps (optional)'), list(f.nextSteps)) : null,
      f.criteria.length ? h('div', {}, h('h4', { class: 'minor' }, showScore ? 'By criterion' : 'Criteria this was reviewed against'),
        h('ul', { class: 'plain' }, f.criteria.map((k) => h('li', {}, h('b', {}, fullName(k, rub)), ' · ', CSTATUS[k.status] || '', showScore && k.assessed !== false ? ' · ' + k.score + ' / ' + k.max : '', k.comment ? ' — ' + k.comment : '', k.adjusted ? h('span', { class: 'small muted' }, ' (Adjusted: ' + k.adjusted + ')') : null)))) : null,
      showScore && ins.limited ? h('p', { class: 'small' }, 'Provisional score: ' + f.score + ' of ' + f.max + ' points on the assessed criteria.') : null,
      h('p', { class: 'small muted' }, 'Reviewed by AI on ' + when(f.at) + (f.cost ? ' · about ' + money(f.cost) : '') + (office ? '. Practice feedback only: nothing here is graded.' : '. This is an automated assessment, not a human grade.') + ' Quotes are shown as found only where the app could check them.'));
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

  // Review Studio (js/review-studio.js): the submitted work beside its feedback. Read-only; it never changes a grade, record or deadline.
  function studioButton(c, m, a, sub, o) {
    if (!sub || !sub.feedback || !S.reviewStudio) return null;
    return S.reviewStudio.button({ c, m, a, sub, feedback: sub.feedback, showScore: !!o.showScore, office: !!o.office, title: a.title, meta: o.meta || '', scoreLine: o.scoreLine || '', rubric: a.rubric || [], legacy: () => legacyFeedback(sub.feedback, !!o.showScore, !!o.office, a) });
  }

  // Save a finished piece to this course's Portfolio (or take it out). Demonstrate work is saved by default when it is finalized.
  S.portfolioToggle = function (a) {
    return h('div', { class: 'callout' },
      h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: a.portfolio, onchange: (e) => { a.portfolio = e.target.checked; commit(); toast(a.portfolio ? 'Saved to this course’s Portfolio.' : 'Removed from the Portfolio.'); } }),
        h('span', {}, 'Show this piece in this course’s Portfolio.' + (a.kind === 'demonstrate' ? ' (Saved by default for demonstrate work.)' : ''))),
      h('p', { class: 'small muted' }, 'Portfolios stay in this browser. Files are kept on this device only and aren’t included in backups.'));
  };

  // How a saved piece appears in the Portfolio: what it shows, the work itself, and its AI-reviewed result.
  S.portfolioPiece = function (c, m, a) {
    const f = a.work && a.work.final, fb = f && f.feedback, pct = fb ? S.pctOf(a) : null;
    return h('li', { class: 'plate' },
      h('div', { class: 'plate-top' }, a.kind ? S.kindMark(a.kind) : badge('Assignment', 'soft')),
      h('h3', { class: 'plate-title' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title)),
      a.portfolioNote ? h('p', { class: 'plate-dek' }, a.portfolioNote) : null,
      fb ? h('div', { class: 'plate-score' }, h('strong', {}, pct + '%'), h('span', {}, a.score + ' / ' + a.points + ' pts · ' + S.letter(pct))) : null,
      h('div', { class: 'item-meta' }, h('span', { class: 'code' }, c.code), h('span', { class: 'due' }, 'Module: ' + m.title),
        fb ? h('span', { class: 'badge soft' }, 'AI-reviewed') : null, f && f.late ? h('span', { class: 'badge warn' }, 'Late') : null),
      h('details', { class: 'work-panel' }, h('summary', {}, 'The work' + (fb ? ' and feedback' : '')),
        h('div', { class: 'wp-body' }, f && f.text ? h('p', { class: 'pre' }, f.text) : null, fileLine(f), fb ? feedbackView(fb, true) : null)));
  };

  S.fileLine = fileLine;
  S.finalFeedbackOnly = (a) => feedbackView(a.work.final.feedback, true, false, a);
  S.finalFeedback = (a) => h("div", {}, feedbackView(a.work.final.feedback, true, false, a), fileLine(a.work.final));

  // Optional, ungraded: practice on a real article, reading, or example the learner chose.
  S.officePanel = function (c, m, a, bare) {
    const ready = S.ai && S.ai.ready && S.ai.ready(), o = a.office, n = o ? o.rounds.length : 0, key = 'oh:' + a.id, d = dr(key);
    const body = [
      h('p', { class: 'small muted' }, 'Practice here in up to two rounds. Choose to practise this assignment as written, or to work from material you chose yourself. Office hours are never graded and never change your grade, submissions or Portfolio.'),
      o && o.mode === 'practice' ? h('p', { class: 'small' }, h('b', {}, 'Practising: '), 'this assignment, with its own instructions, materials and criteria.') : null,
      o && o.mode !== 'practice' && o.material ? h('p', { class: 'small' }, h('b', {}, 'Working from: '), o.material) : null,
      o ? o.rounds.map((r, i) => h('div', { class: 'oh-round' }, h('h4', { class: 'minor' }, 'Round ' + (i + 1) + ' · ' + when(r.at)), r.feedback ? [studioButton(c, m, a, r, { office: true, meta: 'Office hours, round ' + (i + 1) }), feedbackView(r.feedback, false, true)] : null, fileLine(r))) : null,
      S.myData && ((a.kind === 'demonstrate' && !a.realEvidence) || (n ? o.mode : d.mode) === 'own' || (o && o.data)) ? S.myData.panel(c, m, a, 'office') : null,
      n < 2 ? (ready ? inputForm(c, m, a, { key, dataScope: 'office', label: n ? 'Get second-round feedback' : 'Get office-hours feedback', material: n === 0, modePick: n === 0, prior: n === 1, textLabel: n ? 'Your revised work' : 'Your work', onSend: () => officeSubmit(c, m, a, n + 1) }) : h('p', { class: 'small' }, 'Office hours need the AI service. Add its address and access code under Data & Backup → AI.')) : h('p', { class: 'small muted' }, 'You’ve used both rounds. Start over to try different material.'),
      n ? h('div', { class: 'btn-row' }, h('button', { class: 'linkbtn danger', type: 'button', onclick: () => {
        if (!confirm('Clear this office-hours session, including its feedback? This cannot be undone.')) return;
        (a.office.rounds || []).forEach((r) => { if (r.fileId) S.files.del(r.fileId); });
        if (S.myData) S.myData.purgeData(a.office.data);
        a.office = null; dropDraft(key); commit();
      } }, 'Start over')) : null,
    ];
    if (bare) return h('div', { class: 'wp-bare' }, body);
    const k = 'oh-open:' + a.id;
    const det = h('details', { class: 'work-panel', open: S.ui.open.has(k) || d.busy || !!d.err }, h('summary', {}, 'Office hours (optional, not graded)' + (n ? ' · ' + n + ' of 2 rounds' : '')), h('div', { class: 'wp-body' }, body));
    det.addEventListener('toggle', () => { if (det.open) S.ui.open.add(k); else S.ui.open.delete(k); });
    return det;
  };

  // The submission experience, split in two so the Assignment Workbench can put them on separate tabs:
  // submit: what to do now (write, send, resubmit); feedback: what came back. Behaviour is unchanged from the single panel.
  S.workParts = function (c, m, a) {
    curRubric = a.rubric || [];
    const w = a.work, fileOnly = a.format === 'file';
    const ready = S.ai && S.ai.ready && S.ai.ready();
    const canReview = a.points > 0;
    const form = (round) => inputForm(c, m, a, { key: a.id, dataScope: a.kind === 'demonstrate' && !a.realEvidence ? 'assignment' : '', label: round === 1 ? 'Get AI feedback' : 'Submit for final review', fileOnly, attach: round === 1, onSend: () => submit(c, m, a, round), prior: round === 2 });
    let submitPart, feedbackPart, state;
    if (!w) {
      state = 'none';
      submitPart = !canReview ? h('p', { class: 'small muted' }, 'This assignment has no points yet, so AI feedback is off. Add points (Edit) to turn on submissions, or mark it completed yourself.')
        : [
          h('p', { class: 'small muted' }, 'Submit once to get detailed feedback (without a grade). You then have ' + S.REVIEW_HOURS + ' hours to resubmit for your final grade. If you don’t, the first review becomes your grade.'),
          a.due ? h('p', { class: 'small muted' }, 'Due ' + S.fmtDate(a.due) + '. Late work is accepted and marked late.') : null,
          !ready ? h('p', { class: 'small' }, 'AI feedback needs the AI service. Add its address and access code under Data & Backup → AI. You can still attach a file without feedback.') : null,
          form(1)];
      feedbackPart = h('p', { class: 'empty' }, canReview ? 'No feedback yet. Submit your work and the AI’s review will appear here.' : 'No feedback yet. This assignment isn’t set up for AI review.');
    } else if (w.phase === 'reviewed') {
      state = 'reviewed';
      const left = S.hoursLeft(a);
      submitPart = [
        h('p', {}, badge('First review done', 'soft'), ' ', w.first.late ? badge('Late', 'warn') : null, ' ', h('span', { class: 'small muted' }, 'Submitted ' + when(w.first.at))),
        h('p', { class: 'callout' }, 'Your grade is revealed after your final review. Resubmit by ' + when(w.deadline) + ' (' + (left > 1 ? Math.ceil(left) + ' hours left' : 'under an hour left') + '). If you don’t, this first review becomes your grade then.'),
        h('h4', { class: 'minor' }, 'Resubmit your revised work'),
        ready ? form(2) : h('p', { class: 'small' }, 'Reconnect the AI service under Data & Backup → AI to resubmit.'),
        h('div', { class: 'btn-row' }, h('button', { class: 'linkbtn', type: 'button', onclick: () => {
          if (!confirm('Skip resubmitting? Your first review becomes your final grade and the first submission’s feedback is replaced by the final record.')) return;
          S.finalizeWork(a); commit();
        } }, 'Skip resubmitting and see my grade')),
      ];
      feedbackPart = [
        h('p', {}, badge('First review', 'soft'), ' ', w.first.late ? badge('Late', 'warn') : null, ' ', h('span', { class: 'small muted' }, 'Submitted ' + when(w.first.at))),
        studioButton(c, m, a, w.first, { meta: 'First review, submitted ' + when(w.first.at) }),
        feedbackView(w.first.feedback, false), fileLine(w.first),
      ];
    } else {
      const f = w.final, fb = f.feedback, pct = fb ? S.pctOf(a) : null;
      state = fb ? 'graded' : 'attached';
      const theWork = f.text ? h('details', { class: 'work-panel' }, h('summary', {}, 'The work you submitted'), h('div', { class: 'wp-body' }, h('p', { class: 'pre' }, f.text))) : null;
      submitPart = fb ? [
        h('p', {}, badge('Final', 'solid'), ' ', f.late ? badge('Late', 'warn') : null, ' ', h('span', { class: 'small muted' }, 'Submitted ' + when(f.at))),
        h('p', { class: 'small muted' }, 'This assignment is complete and graded, so there is nothing more to send. The AI’s assessment is on the Feedback tab.'),
        theWork, fileLine(f),
      ] : [
        h('p', {}, badge('Attached', 'soft'), ' ', f.late ? badge('Late', 'warn') : null, ' ', h('span', { class: 'small muted' }, when(f.at))),
        h('p', { class: 'small muted' }, 'Kept as evidence without AI feedback or a grade.'), fileLine(f),
        h('button', { class: 'linkbtn danger', type: 'button', onclick: () => {
          if (!confirm('Remove this attachment? This cannot be undone.')) return;
          if (f.fileId) S.files.del(f.fileId); a.work = null; a.done = false; commit();
        } }, 'Remove attachment'),
      ];
      feedbackPart = fb ? [
        h('div', { class: 'grade-line' }, badge('Final', 'solid'), ' ', f.late ? badge('Late', 'warn') : null, ' ',
          h('b', {}, a.score + ' / ' + a.points + ' pts'), ' · ', pct + '%', ' · ', h('b', {}, S.letter(pct))),
        h('p', { class: 'small muted' }, 'Submitted ' + when(f.at) + '. An AI-generated assessment, not a human grade. It is also recorded on the Grades page and in your Portfolio.'),
        studioButton(c, m, a, f, { showScore: true, meta: 'Final review, submitted ' + when(f.at), scoreLine: 'Final: ' + a.score + ' / ' + a.points + ' pts · ' + pct + '% · ' + S.letter(pct) }),
        h('p', {}, h('button', { class: 'btn ghost', type: 'button', onclick: () => S.publish.open('feedback', c, { assignmentId: a.id }) }, 'Save report as PDF')),
        feedbackView(fb, true), fileLine(f),
      ] : h('p', { class: 'empty' }, 'This was attached as evidence, so there is no AI feedback.');
    }
    return { submit: submitPart, feedback: feedbackPart, state, busy: !!(drafts[a.id] && drafts[a.id].busy) };
  };

  // The original single collapsible panel, kept for any caller that wants everything in one place.
  S.workPanel = function (c, m, a, forceOpen) {
    const w = a.work, key = 'wp:' + a.id, d0 = dr(a.id), p = S.workParts(c, m, a);
    const label = !w ? 'Submit work' : w.phase === 'reviewed' ? 'Feedback ready' : (w.final.feedback ? 'Final grade' : 'Attached');
    const det = h('details', { class: 'work-panel', open: forceOpen || S.ui.open.has(key) || d0.busy || !!d0.err }, h('summary', {}, label), h('div', { class: 'wp-body' }, p.state !== 'none' ? [p.feedback, p.submit] : p.submit));
    det.addEventListener('toggle', () => { if (det.open) S.ui.open.add(key); else S.ui.open.delete(key); });
    return det;
  };
})(window.Sovereign);
