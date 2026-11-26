/* sovereign. (AI-off copy) — Practice & Reflection. This file exists only in the AI-off copy; it takes the place of the full app's Office Hours.
   Ungraded and separate: practice work, an optional focus (a rubric criterion or one of your revision goals), a checklist and a reflection.
   Nothing here touches your submissions, your self-assessments or your score. Saved as a.practice (normalised in js/store.js).
   Office Hours sessions imported from the full app (a.office) are shown read-only. */
(function (S) {
  'use strict';
  const { h, toast, commit, badge } = S;
  const P = (S.practice = {});
  const MAXE = 30;
  const ui = {}; // per assignment, this visit only: { open: entry id, del: entry id }
  const u = (a) => ui[a.id] || (ui[a.id] = {});
  const now = () => new Date().toISOString();
  const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const entries = (a) => (a.practice ? a.practice.entries : []);
  const touch = (e) => { e.updatedAt = now(); S.save(); };

  // Focus choices: only what already exists — the assignment's rubric criteria and the revision goals you wrote.
  function focusOptions(a) {
    const out = [['', '', 'General practice']];
    a.rubric.forEach((k) => out.push(['criterion', k.name, 'Criterion: ' + k.name]));
    if (!a.rubric.length) a.criteria.forEach((x) => out.push(['criterion', x, 'Criterion: ' + x]));
    const seen = new Set();
    ((a.studio && a.studio.versions) || []).forEach((v) => v.goals.forEach((g) => { const t = g.text.trim(); if (t && !seen.has(t)) { seen.add(t); out.push(['goal', t, 'Goal (after version ' + v.n + '): ' + t]); } }));
    return out;
  }
  const focusText = (e) => (!e.focus.label ? 'General practice' : (e.focus.kind === 'goal' ? 'Goal: ' : 'Criterion: ') + e.focus.label);
  // Checklist starters from what the assignment itself lists: its step titles or steps, and its criteria.
  const stepItems = (a) => (a.parts.length ? a.parts.map((p) => p.title || p.questions[0] || '') : a.steps).map((x) => String(x).trim()).filter(Boolean);
  const critItems = (a) => (a.rubric.length ? a.rubric.map((k) => k.name) : a.criteria);

  function newEntry(a) {
    if (entries(a).length >= MAXE) { toast('An assignment can hold ' + MAXE + ' practice entries. Delete an older one first.'); return; }
    a.practice = a.practice || { entries: [] };
    const e = { id: S.uid(), at: now(), updatedAt: '', focus: { kind: '', label: '' }, work: '', fileId: '', fileName: '', fileType: '', fileSize: 0, reflection: '', checklist: [] };
    a.practice.entries.push(e);
    u(a).open = e.id;
    commit();
  }
  function deleteEntry(a, e) {
    if (e.fileId) S.files.del(e.fileId);
    a.practice.entries = a.practice.entries.filter((x) => x !== e);
    if (!a.practice.entries.length) a.practice = null;
    u(a).open = ''; u(a).del = '';
    toast('Practice entry deleted.');
    commit();
  }
  async function attach(a, e, f) {
    if (!f) return;
    if (f.size > S.FILE_LIMITS.attach) { toast('That file is over 25 MB, which is more than this browser can keep.'); return; }
    const id = S.uid();
    try { await S.files.put(id, f); } catch (err) { toast('That file could not be saved on this device.'); return; }
    if (e.fileId) S.files.del(e.fileId);
    Object.assign(e, { fileId: id, fileName: f.name, fileType: f.type || '', fileSize: f.size });
    touch(e); S.render(false);
  }

  function checklistView(a, e) {
    const add = (texts) => { const room = 20 - e.checklist.length; texts.slice(0, room).forEach((t) => e.checklist.push({ id: S.uid(), text: t.slice(0, 300), done: false })); touch(e); S.render(false); };
    const have = new Set(e.checklist.map((k) => k.text));
    const steps = stepItems(a).filter((x) => !have.has(x)), crit = critItems(a).filter((x) => !have.has(x));
    const done = e.checklist.filter((k) => k.done).length;
    return h('section', { class: 'pr-check' },
      h('h4', { class: 'minor' }, 'Checklist', e.checklist.length ? h('span', { class: 'small muted' }, ' · ' + done + ' of ' + e.checklist.length + ' done') : null),
      e.checklist.length ? h('ul', { class: 'pr-items' }, e.checklist.map((k) => h('li', {},
        h('input', { type: 'checkbox', checked: k.done, 'aria-label': 'Done', onchange: (ev) => { k.done = ev.target.checked; touch(e); S.render(false); } }),
        h('textarea', { rows: Math.min(4, Math.max(1, Math.ceil(k.text.length / 38))), maxlength: '300', value: k.text, 'aria-label': 'Checklist item', placeholder: 'Something to do or check', oninput: (ev) => { k.text = ev.target.value; touch(e); } }),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { e.checklist = e.checklist.filter((x) => x !== k); touch(e); S.render(false); } }, 'Remove')))) : h('p', { class: 'small muted' }, 'No items yet.'),
      e.checklist.length < 20 ? h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => add(['']) }, 'Add an item'),
        steps.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => add(steps) }, 'Add the assignment’s steps (' + steps.length + ')') : null,
        crit.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => add(crit) }, 'Add the criteria (' + crit.length + ')') : null) : null);
  }

  function editor(a, e) {
    const x = u(a), opts = focusOptions(a), cur = opts.findIndex((o) => o[0] === e.focus.kind && o[1] === e.focus.label);
    return h('article', { class: 'pr-entry', 'aria-label': 'Practice entry' },
      h('div', { class: 'pr-head' }, h('b', {}, 'Practice entry · ' + when(e.at)), h('span', { class: 'small muted' }, e.updatedAt ? 'Saved on this device · ' + when(e.updatedAt) : 'Saved on this device')),
      h('label', { class: 'field' }, h('span', {}, 'Focus'),
        h('select', { onchange: (ev) => { const o = opts[Number(ev.target.value)]; e.focus = { kind: o[0], label: o[1] }; touch(e); } },
          opts.map((o, i) => h('option', { value: String(i), selected: i === (cur < 0 ? 0 : cur) }, o[2]))),
        cur < 0 && e.focus.label ? h('small', {}, 'Earlier focus: ' + focusText(e) + ' (no longer in the list).') : null),
      h('label', { class: 'field' }, h('span', {}, 'Practice work'),
        h('textarea', { rows: 6, maxlength: '10000', value: e.work, placeholder: 'A draft paragraph, worked problem, outline, notes — anything you want to try out.', oninput: (ev) => { e.work = ev.target.value; touch(e); } })),
      h('label', { class: 'field' }, h('span', {}, 'Or attach a file (optional)'),
        h('input', { type: 'file', onchange: (ev) => attach(a, e, ev.target.files[0]) }),
        h('small', {}, 'Kept on this device only and not part of backups.')),
      e.fileId || e.fileName ? S.fileLine(e) : null,
      checklistView(a, e),
      h('label', { class: 'field' }, h('span', {}, 'Reflection'),
        h('textarea', { rows: 4, maxlength: '5000', value: e.reflection, placeholder: 'What did you try? What worked, what didn’t, and what will you do next?', oninput: (ev) => { e.reflection = ev.target.value; touch(e); } })),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { x.open = ''; touch(e); S.render(false); toast('Practice entry saved.'); } }, 'Done'),
        x.del === e.id
          ? [h('span', { class: 'small' }, 'Delete this entry for good?'), h('button', { class: 'btn ghost danger', type: 'button', onclick: () => deleteEntry(a, e) }, 'Yes, delete'), h('button', { class: 'linkbtn', type: 'button', onclick: () => { x.del = ''; S.render(false); } }, 'Keep it')]
          : h('button', { class: 'linkbtn', type: 'button', onclick: () => { x.del = e.id; S.render(false); } }, 'Delete entry')));
  }

  function earlier(a, e) {
    const done = e.checklist.filter((k) => k.done).length;
    return h('details', { class: 'pr-past' },
      h('summary', {}, when(e.at) + ' · ' + focusText(e) + (e.checklist.length ? ' · ' + done + ' of ' + e.checklist.length + ' checked' : '')),
      h('div', { class: 'wp-body' },
        e.work ? h('p', { class: 'pre' }, e.work) : null,
        e.fileId || e.fileName ? S.fileLine(e) : null,
        e.checklist.length ? h('ul', { class: 'plain small' }, e.checklist.map((k) => h('li', {}, (k.done ? '☑ ' : '☐ ') + (k.text || '(empty)')))) : null,
        e.reflection ? h('p', {}, h('b', {}, 'Reflection: '), e.reflection) : null,
        !e.work && !e.fileName && !e.reflection && !e.checklist.length ? h('p', { class: 'small muted' }, 'This entry is empty.') : null,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { u(a).open = e.id; S.render(false); } }, 'Open'))));
  }

  // Office Hours sessions from the full app: kept exactly as imported, never changed here.
  function imported(a) {
    const o = a.office; if (!o || !o.rounds || !o.rounds.length) return null;
    return h('section', { class: 'pr-imported' },
      h('h4', { class: 'minor' }, 'Office Hours, imported'),
      h('p', { class: 'small muted' }, 'This practice session came with a backup from the full app' + (o.material ? ' (material: ' + o.material + ')' : '') + '. It is shown exactly as it was, was never graded, and cannot be continued here.'),
      o.rounds.map((r, i) => h('details', { class: 'pr-past' }, h('summary', {}, 'Round ' + (i + 1) + ' · ' + when(r.at)),
        h('div', { class: 'wp-body' }, r.text ? h('p', { class: 'pre' }, r.text) : null, S.fileLine(r), r.feedback && S.officeFeedback ? S.officeFeedback(r.feedback, a) : null))));
  }

  // The workbench tab. Available before and after submitting.
  P.tab = function (c, m, a) {
    const es = entries(a), x = u(a), open = es.find((e) => e.id === x.open) || null;
    const past = es.filter((e) => e !== open).slice().reverse();
    return [
      h('p', { class: 'pr-note', role: 'note' }, badge('Ungraded', 'soft'), ' Practice here is just for you. It never changes your submissions, your self-assessments or your score.'),
      open ? editor(a, open) : h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => newEntry(a) }, 'New practice entry')),
      past.length ? h('section', { class: 'pr-list' }, h('h4', { class: 'minor' }, open ? 'Other entries' : 'Earlier entries'), past.map((e) => earlier(a, e))) : !open ? h('p', { class: 'small muted' }, 'No practice entries yet. Try a passage, a problem or an outline here before or after you submit.') : null,
      imported(a)];
  };
  P.count = (a) => entries(a).length;
})(window.Sovereign = window.Sovereign || {});
