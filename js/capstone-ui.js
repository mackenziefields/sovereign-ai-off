/* sovereign. (AI-off copy) — the course capstone on the Modules page: open it, see what prepares you, remove it.
   Data lives in store.js (course.capstone, S.courseGrade). In this copy you write a capstone yourself (no AI step): it counts 20% of the course grade once you assess it. */
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

  const workText = (a) => { const w = a.work; return !w ? 'Not started' : w.phase === 'reviewed' ? 'Imported first version: submit your revised work' : S.assess.status(a); };

  // What the course grade is now and what changes. Plain words; nothing is hidden.
  U.gradeNote = function (c, weight) {
    const g = S.courseGrade(c), mod = g.module, w = weight == null ? 20 : weight;
    return h('div', { class: 'cap-grade' },
      h('p', { class: 'cap-k' }, 'How it affects your course grade'),
      h('p', {}, 'With a capstone, your course grade is ' + (100 - w) + '% your module-assignment average plus ' + w + '% your capstone grade. Until the capstone has a final grade, your course grade stays your module average and is labelled provisional. The capstone never counts as zero.'),
      h('p', { class: 'small muted' }, mod ? 'Right now your module average is ' + pct(mod.pct) + '. Adding a capstone changes nothing you have already earned; it only adds the capstone as a part of the final result.' : 'No module assignments are graded yet, so there is nothing to change yet.'));
  };

  function remove(c) {
    const a = c.capstone && c.capstone.assignments[0];
    if (a && a.work) return toast('A capstone with submitted work cannot be removed.');
    if (!confirm('Remove this capstone from the course? Your course grade goes back to the module average only. Nothing else is changed.')) return;
    delete c.capstone; run[c.id] = null; commit(); toast('Capstone removed.');
  }

  // AI-off copy: write a capstone yourself. One assignment, kept outside the modules, counting 20% of the course grade once you assess it.
  function addSection(c) {
    return h('section', { class: 'home-sec cap-sec', 'aria-label': 'Course capstone' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Course capstone'), h('span', { class: 'count' }, 'Optional')),
      h('details', { class: 'cap-card' }, h('summary', {}, 'Add a course capstone'),
        h('p', { class: 'small muted' }, 'A culminating project you write yourself. Once you have assessed it, it counts 20% of your course grade and your module average counts 80%. Until then your course grade is your module average, labelled provisional.'),
        h('form', { onsubmit: (e) => { e.preventDefault(); create(c, new FormData(e.target)); } },
          S.field('Title', 'title', { required: true, placeholder: 'e.g. A public-facing case study' }),
          S.field('What to make', 'description', { multiline: true, rows: 4, required: true }),
          S.field('Rubric (optional)', 'rubric', { multiline: true, rows: 4, hint: 'One criterion per line, with its points after a vertical bar, for example “Uses evidence from the readings | 30”. Without a rubric you give one overall score.' }),
          S.field('Points', 'points', { type: 'number', value: '100', hint: 'With a rubric, leave this empty to use the rubric total.' }),
          h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'submit' }, 'Add the capstone')))));
  }
  function create(c, f) {
    const lines = String(f.get('rubric') || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10);
    const rubric = lines.map((l) => { const m = l.match(/^(.+?)\s*\|\s*(\d+(?:\.\d+)?)$/); return m && Number(m[2]) > 0 ? { name: m[1].slice(0, 200), max: Number(m[2]) } : null; });
    if (rubric.some((x) => !x)) return toast('Each rubric line needs a criterion, a vertical bar and its points, like “Clear argument | 25”.');
    const total = rubric.reduce((t, k) => t + k.max, 0), p = Number(f.get('points')), pts = p > 0 ? p : total || 100;
    c.capstone = S.makeCapstone({ title: 'Course capstone', status: 'ready', weight: 20, createdAt: new Date().toISOString(), note: 'Written by the learner.',
      assignments: [{ id: S.uid(), title: String(f.get('title') || '').trim() || 'Course capstone', description: String(f.get('description') || '').trim(), points: pts, rubric, kind: 'demonstrate', capstone: true, origin: 'user', format: 'any', basis: 'portfolio' }] });
    commit(); toast('Capstone added. It counts 20% of your course grade once you assess it.');
  }

  U.section = function (c) {
    const r = get(c), cap = c.capstone, a = cap && cap.assignments[0];
    const sec = (...k) => h('section', { class: 'home-sec cap-sec', 'aria-label': 'Course capstone' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Course capstone'), cap && cap.status === 'ready' ? h('span', { class: 'count' }, 'Counts ' + cap.weight + '% of the course grade') : h('span', { class: 'count' }, 'Culminating project')), ...k);
    const err = r.error ? h('p', { class: 'small cap-err', role: 'alert' }, r.error) : null;
    if (!cap) return addSection(c);
    if (cap.status !== 'ready') {
      return sec(
        h('div', { class: 'cap-card cap-incomplete' }, h('p', {}, badge('Incomplete', ''), ' ', h('b', {}, a ? a.title : 'Course capstone')),
          h('p', { class: 'small' }, cap.note || 'The capstone was not finished.'),
          h('p', { class: 'small muted' }, 'It is not available to submit to and does not affect your course grade until it is finished.')),
        err,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => remove(c) }, 'Remove it')));
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
