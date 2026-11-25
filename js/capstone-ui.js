/* sovereign. — the course capstone on the Modules page (Phase 3-3): create with a preview, finish if incomplete, open, remove.
   Data and AI calls live in store.js (course.capstone, S.courseGrade) and ai-client.js (ai.draftCapstone / adoptCapstone / finishCapstone / createCapstone). */
(function (S) {
  'use strict';
  const { h, badge, toast, commit } = S;
  const U = (S.capstoneUi = {});
  const run = {}; // course id -> { state: 'idle' | 'working' | 'preview' | 'finishing', draft, msg, error }
  const get = (c) => (run[c.id] = run[c.id] || { state: 'idle', draft: null, msg: '', error: '' });
  const pct = (n) => (n == null ? '–' : n + '%');
  const alive = (c) => S.state.courses.includes(c);

  // The modules, objectives and skills that prepare for the capstone. Recommendations only: nothing is locked.
  U.prep = function (c, cap) {
    const p = cap.prepares || { modules: [], objectives: [], skills: [] };
    const mods = p.modules.map((x) => ({ m: c.modules.find((m) => m.id === x.id), why: x.why })).filter((x) => x.m);
    if (!mods.length && !p.objectives.length && !p.skills.length) return null;
    return h('div', { class: 'cap-prep' },
      mods.length ? h('div', {}, h('p', { class: 'cap-k' }, 'Modules that prepare you'), h('ul', { class: 'plain' }, mods.map(({ m, why }) => h('li', {}, h('a', { href: S.href(c, 'modules', m.id) }, 'Module ' + (c.modules.indexOf(m) + 1) + ': ' + m.title), why ? ' — ' + why : '')))) : null,
      p.objectives.length ? h('div', {}, h('p', { class: 'cap-k' }, 'Learning objectives it draws on'), h('ul', { class: 'plain' }, p.objectives.map((x) => h('li', {}, x)))) : null,
      p.skills.length ? h('div', {}, h('p', { class: 'cap-k' }, 'Skills you will use'), h('p', {}, p.skills.join(' · '))) : null,
      h('p', { class: 'small muted' }, 'These are recommendations, not requirements. You can open and start the capstone at any time.'));
  };

  const workText = (a) => { const w = a.work; return !w ? 'Not started' : w.phase === 'reviewed' ? 'Feedback ready: you can resubmit for your final grade' : w.final && w.final.feedback ? 'Graded: ' + a.score + ' / ' + a.points : 'Submitted'; };

  // What the course grade is now and what changes. Plain words; nothing is hidden.
  U.gradeNote = function (c, weight) {
    const g = S.courseGrade(c), mod = g.module, w = weight == null ? 20 : weight;
    return h('div', { class: 'cap-grade' },
      h('p', { class: 'cap-k' }, 'How it affects your course grade'),
      h('p', {}, 'With a capstone, your course grade is ' + (100 - w) + '% your module-assignment average plus ' + w + '% your capstone grade. Until the capstone has a final grade, your course grade stays your module average and is labelled provisional. The capstone never counts as zero.'),
      h('p', { class: 'small muted' }, mod ? 'Right now your module average is ' + pct(mod.pct) + '. Adding a capstone changes nothing you have already earned; it only adds the capstone as a part of the final result.' : 'No module assignments are graded yet, so there is nothing to change yet.'));
  };

  function preview(c, r) {
    const cap = r.draft.cap, a = cap.assignments[0];
    return h('div', { class: 'cap-preview panel', role: 'region', 'aria-label': 'Capstone preview' },
      h('p', { class: 'eyebrow' }, 'Preview: not saved yet'),
      h('h3', { class: 'cap-title' }, a.title),
      a.portfolioNote ? h('p', { class: 'lede' }, a.portfolioNote) : null,
      h('p', { class: 'pre' }, a.description),
      h('p', { class: 'cap-k' }, 'What you will submit'), h('p', {}, a.submit || 'See the instructions.'),
      a.parts.length ? h('div', {}, h('p', { class: 'cap-k' }, 'Phases of the work'), h('ol', { class: 'plain' }, a.parts.map((p) => h('li', {}, p.title)))) : null,
      h('p', { class: 'cap-k' }, 'Weighted rubric (' + a.points + ' points)'),
      h('ul', { class: 'plain' }, a.rubric.map((k) => h('li', {}, k.name + ' — ' + k.max + ' pts'))),
      a.packet && a.packet.plan.length ? h('div', {}, h('p', { class: 'cap-k' }, 'Supplied exhibits (written after you accept)'), h('ul', { class: 'plain' }, a.packet.plan.map((x) => h('li', {}, x.title + ' (' + x.type + ')')))) : null,
      U.prep(c, cap),
      U.gradeNote(c, cap.weight),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => accept(c) }, 'Add this capstone to the course'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => draft(c) }, 'Write a different one'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { run[c.id] = null; S.render(false); } }, 'Discard')));
  }

  async function draft(c) {
    const r = get(c); Object.assign(r, { state: 'working', draft: null, msg: 'Writing a capstone from your modules…', error: '' }); S.render(false);
    try { const d = await S.ai.draftCapstone(c, {}); if (!alive(c)) return; Object.assign(r, { state: 'preview', draft: d, msg: '' }); }
    catch (e) { Object.assign(r, { state: 'idle', draft: null, msg: '', error: e.message || 'The capstone could not be written.' }); }
    S.render(false);
  }
  async function accept(c) {
    const r = get(c);
    try { S.ai.adoptCapstone(c, r.draft); } catch (e) { r.error = e.message; r.state = 'idle'; S.render(false); return; }
    Object.assign(r, { state: 'finishing', msg: 'Building the capstone’s exhibits…', error: '' }); S.render(false);
    try { const f = await S.ai.finishCapstone(c, { onStep: (t) => { r.msg = t; S.render(false); } }); toast(f.ok ? 'Capstone added.' : 'Capstone saved, but it is not finished yet.'); }
    catch (e) { r.error = e.message; }
    Object.assign(r, { state: 'idle', draft: null, msg: '' }); S.render(false);
  }
  async function finish(c) {
    const r = get(c); Object.assign(r, { state: 'finishing', msg: 'Finishing the capstone…', error: '' }); S.render(false);
    try { const f = await S.ai.createCapstone(c, { onStep: (t) => { r.msg = t; S.render(false); } }); toast(f.ok ? 'Capstone finished.' : 'Still not finished: see the note.'); }
    catch (e) { r.error = e.message; }
    Object.assign(r, { state: 'idle', msg: '' }); S.render(false);
  }
  function remove(c) {
    const a = c.capstone && c.capstone.assignments[0];
    if (a && a.work) return toast('A capstone with submitted work cannot be removed.');
    if (!confirm('Remove this capstone from the course? Your course grade goes back to the module average only. Nothing else is changed.')) return;
    delete c.capstone; run[c.id] = null; commit(); toast('Capstone removed.');
  }

  U.section = function (c) {
    const r = get(c), cap = c.capstone, a = cap && cap.assignments[0], ready = S.ai && S.ai.ready && S.ai.ready();
    const sec = (...k) => h('section', { class: 'home-sec cap-sec', 'aria-label': 'Course capstone' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Course capstone'), cap && cap.status === 'ready' ? h('span', { class: 'count' }, 'Counts ' + cap.weight + '% of the course grade') : h('span', { class: 'count' }, 'Culminating project')), ...k);
    const busy = r.state === 'working' || r.state === 'finishing';
    const status = busy ? h('p', { class: 'small', role: 'status' }, r.msg) : null;
    const err = r.error ? h('p', { class: 'small cap-err', role: 'alert' }, r.error) : null;
    if (busy && !cap) return sec(status);
    if (r.state === 'preview') return sec(preview(c, r));
    if (!cap) {
      if (!c.modules.length) return null;
      return sec(
        h('p', { class: 'muted' }, 'A capstone is one substantial, portfolio-worthy project that brings together ideas from across this course. The AI writes it from your modules, with full instructions, supplied exhibits, a weighted rubric and a place to submit. You see a preview first, and nothing is added until you accept.'),
        ready ? null : h('p', { class: 'small' }, 'Connect the AI service first (', h('a', { href: '#/data' }, 'Data & Backup'), ').'),
        err,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', disabled: !ready, onclick: () => draft(c) }, 'Create a capstone')));
    }
    if (cap.status !== 'ready') {
      return sec(
        h('div', { class: 'cap-card cap-incomplete' }, h('p', {}, badge('Incomplete', ''), ' ', h('b', {}, a ? a.title : 'Course capstone')),
          h('p', { class: 'small' }, cap.note || 'The capstone was not finished.'),
          h('p', { class: 'small muted' }, 'It is not available to submit to and does not affect your course grade until it is finished.')),
        status, err,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', disabled: busy || !ready, onclick: () => finish(c) }, 'Finish the capstone'),
          h('button', { class: 'btn ghost', type: 'button', disabled: busy, onclick: () => remove(c) }, 'Remove it')),
        ready ? null : h('p', { class: 'small' }, 'Connect the AI service first (', h('a', { href: '#/data' }, 'Data & Backup'), ').'));
    }
    const g = S.courseGrade(c);
    return sec(
      h('article', { class: 'cap-card' },
        h('h3', { class: 'cap-title' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title)),
        a.portfolioNote ? h('p', { class: 'lede' }, a.portfolioNote) : null,
        h('p', { class: 'small' }, h('b', {}, 'Status: '), workText(a), ' · ', a.points + ' points', a.estimate ? ' · about ' + a.estimate : ''),
        h('p', { class: 'small' }, h('b', {}, 'Course grade now: '), g.pct == null ? 'not available yet' : pct(g.pct) + (g.provisional ? ' (provisional until the capstone is graded)' : '')),
        U.prep(c, cap),
        h('div', { class: 'btn-row' },
          h('a', { class: 'btn', href: S.href(c, 'assignments', a.id) }, a.work ? 'Open the capstone' : 'Start the capstone'),
          a.work ? null : h('button', { class: 'linkbtn danger', type: 'button', onclick: () => remove(c) }, 'Remove the capstone'))),
      err);
  };
})(window.Sovereign = window.Sovereign || {});
