/* sovereign. — Academic Experience (build 20): the course Syllabus as a course sheet, Grades as a transcript, and the Portfolio as an exhibition.
   Reads the existing data only; nothing here changes the saved format. Routes are unchanged: #/course/<id>/<syllabus|grades|portfolio> */
(function (S) {
  'use strict';
  const { h, field, plural, badge, toast, commit } = S;
  const ui = S.ui;
  const X = () => S.vc;
  const STAGE_KEYS = ['learn', 'apply', 'demonstrate'];
  const STAGE_NAME = { learn: 'Learn', apply: 'Apply', demonstrate: 'Demonstrate' };
  const pctText = (n) => (n == null ? '—' : n + '%');
  const money1 = (n) => String(Math.round(n * 10) / 10);

  /* ----- numbers (pure; read-only) ----- */
  function numbers(c) {
    const stages = {}; STAGE_KEYS.forEach((k) => { stages[k] = { count: 0, points: 0, earned: 0, possible: 0, graded: 0 }; });
    let count = 0, points = 0;
    const mods = c.modules.map((m) => {
      const mm = { m, count: 0, points: 0, earned: 0, possible: 0, by: { learn: 0, apply: 0, demonstrate: 0 }, firstDue: '', lastDue: '' };
      m.assignments.forEach((a) => {
        const k = S.stageOf(a), st = stages[k], pts = a.points > 0 ? a.points : 0;
        st.count++; st.points += pts; mm.count++; mm.points += pts; mm.by[k]++; count++; points += pts;
        if (a.due) { if (!mm.firstDue || a.due < mm.firstDue) mm.firstDue = a.due; if (!mm.lastDue || a.due > mm.lastDue) mm.lastDue = a.due; }
        if (a.points > 0 && a.score != null) { st.earned += a.score; st.possible += a.points; st.graded++; mm.earned += a.score; mm.possible += a.points; }
      });
      return mm;
    });
    return { stages, mods, count, points };
  }
  const pctOfSum = (e, p) => (p > 0 ? Math.round((e / p) * 1000) / 10 : null);
  const bar = (pct, label) => h('div', { class: 'ac-bar', role: 'img', 'aria-label': label + ': ' + (pct == null ? 'no scores yet' : pct + ' percent') }, h('i', { style: 'width:' + (pct == null ? 0 : Math.min(100, pct)) + '%' }));
  const wrapper = (c, cls, ...kids) => h('div', { class: 'acad ' + cls, 'data-theme': c.designTheme }, ...kids);

  /* =============================== SYLLABUS =============================== */

  S.academic = {};
  S.academic.syllabus = function (c) {
    const vc = X();
    if (ui.edit === 'course') return h('div', {}, h('div', { class: 'page-head' }, h('h2', {}, 'Edit course details')), S.courseForm(c));
    const n = numbers(c);
    const fact = (k, v) => h('div', {}, h('dt', {}, k), h('dd', {}, v));
    const totalPts = n.points;
    const seg = STAGE_KEYS.map((k) => n.stages[k]).map((s, i) => ({ k: STAGE_KEYS[i], s }));
    return wrapper(c, 'ac-syllabus',
      h('header', { class: 'ac-head' },
        h('p', { class: 'eyebrow' }, 'Syllabus · ' + c.code),
        h('h2', { class: 'ac-title' }, 'Syllabus'),
        c.description ? h('p', { class: 'ac-stand pre' }, c.description) : h('p', { class: 'empty' }, 'No description yet. Use Edit course details to add one.'),
        h('div', { class: 'ac-tools' }, vc.editBtn('course', 'Edit course details'), h('button', { class: 'btn', type: 'button', onclick: () => S.publish.open('syllabus', c) }, 'Save as PDF'))),
      c.ai && c.ai.generated ? h('p', { class: 'banner' + (c.ai.status === 'partial' ? ' error' : '') }, 'Drafted by AI: review and change anything. ', c.ai.note || '') : null,
      h('dl', { class: 'ac-facts' },
        fact('Length', c.duration || '—'), fact('Modules', String(c.modules.length)), fact('Assignments', String(n.count)), fact('Points', String(totalPts)),
        fact('Final deliverable', c.deliverable ? h('span', {}, c.deliverable, ' ', h('a', { class: 'small', href: '#/work' }, 'Track in My Work')) : '—')),
      (c.objective || c.outcomes.length || c.pathway) ? h('section', { class: 'ac-sec' }, h('h3', { class: 'ac-h' }, 'What you will be able to do'),
        c.objective ? h('p', { class: 'ac-lead' }, c.objective) : null,
        c.outcomes.length ? h('ol', { class: 'ac-outcomes' }, c.outcomes.map((x) => h('li', {}, x))) : null,
        c.pathway ? h('p', { class: 'muted' }, h('b', {}, 'Where this leads: '), c.pathway) : null) : null,
      c.licensureNote ? h('p', { class: 'callout' }, h('b', {}, 'About licenses and credentials: '), c.licensureNote) : null,

      h('section', { class: 'ac-sec' }, h('h3', { class: 'ac-h' }, 'Course map'),
        n.mods.length ? h('ol', { class: 'ac-map' }, n.mods.map((mm, i) => h('li', { class: 'ac-row' },
          h('span', { class: 'ac-no', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
          h('div', { class: 'ac-row-main' },
            h('a', { class: 'ac-row-title', href: S.href(c, 'modules', mm.m.id) }, mm.m.title),
            h('div', { class: 'ac-row-meta' }, [mm.m.duration, mm.firstDue ? 'Due ' + S.fmtDate(mm.firstDue) + (mm.lastDue !== mm.firstDue ? ' to ' + S.fmtDate(mm.lastDue) : '') : ''].filter(Boolean).join(' · ') || 'No dates set'),
            h('ul', { class: 'ac-stages' }, STAGE_KEYS.filter((k) => mm.by[k]).map((k) => h('li', {}, S.kindMark(k), h('a', { href: S.href(c, 'modules', mm.m.id + '/' + k) }, ' ' + plural(mm.by[k], 'assignment')))))),
          h('span', { class: 'ac-pts' }, mm.points ? h('b', {}, String(mm.points)) : '—', mm.points ? ' pts' : '')))) : h('p', { class: 'empty' }, 'No modules yet.')),

      h('section', { class: 'ac-sec' }, h('h3', { class: 'ac-h' }, 'How you are assessed'),
        totalPts > 0 ? h('div', {},
          h('div', { class: 'ac-split', role: 'img', 'aria-label': 'Points by stage: ' + seg.map((x) => STAGE_NAME[x.k] + ' ' + x.s.points).join(', ') },
            seg.filter((x) => x.s.points > 0).map((x) => h('i', { class: 'sp-' + x.k, style: 'flex:' + x.s.points }))),
          h('ul', { class: 'ac-legend' }, seg.map((x) => h('li', {}, S.kindMark(x.k), ' ', h('b', {}, String(x.s.points)), ' pts · ' + plural(x.s.count, 'assignment'))))) : h('p', { class: 'muted' }, 'Points have not been set on any assignment yet.'),
        h('ul', { class: 'plain ac-rules' },
          h('li', {}, 'Each graded assignment has a weighted rubric. The criteria and their points are on its Rubric tab.'),
          h('li', {}, 'If you send work for AI review, you get detailed feedback first with no grade. You then have ' + S.REVIEW_HOURS + ' hours to improve and resubmit for your final grade; if you don’t, the first review becomes your grade.'),
          h('li', {}, 'Late work is accepted and marked late. AI reviews are automated assessments, not human grades.'),
          h('li', {}, 'Your Current Grade is your points earned divided by points possible across the assignments that have a score.'))),

      (c.work.title || c.work.criteria.length) ? h('section', { class: 'ac-sec' }, h('h3', { class: 'ac-h' }, 'Final project' + (c.work.title ? ': ' + c.work.title : '')),
        c.work.criteria.length ? h('ul', { class: 'plain' }, c.work.criteria.map((x) => h('li', {}, x))) : null) : null,
      h('section', { class: 'ac-sec' }, h('h3', { class: 'ac-h' }, 'Syllabus notes'), c.syllabus ? h('p', { class: 'pre' }, c.syllabus) : h('p', { class: 'empty' }, 'Add your schedule, expectations, and how you will grade yourself.')),
      S.usageBlock(c),
      h('details', { class: 'ac-danger' }, h('summary', {}, 'Delete this course'),
        h('p', { class: 'small muted' }, 'This removes the course with all its modules, assignments, grades and credentials from this browser.'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          if (!confirm('Delete “' + c.title + '” with all its modules, assignments, grades and credentials? This cannot be undone unless you exported a backup.')) return;
          S.state.courses = S.state.courses.filter((x) => x !== c); S.save(); S.go('#/'); toast('Course deleted.');
        } }, 'Delete this course')));
  };

  /* ================================ GRADES ================================ */

  function statusOf(a) {
    const w = a.work, f = w && w.final;
    if (f && f.feedback) return { key: 'ai', label: 'AI-graded' };
    if (w && w.phase === 'reviewed') {
      const hrs = S.hoursLeft(a);
      return { key: 'wait', label: 'Feedback ready', note: hrs != null ? (hrs > 0 ? 'Final grade in ' + (hrs >= 24 ? Math.ceil(hrs / 24) + ' days at most' : Math.max(1, Math.ceil(hrs)) + ' hours at most') + ', or when you resubmit' : 'Final grade is being recorded') : '' };
    }
    if (w) return { key: 'attached', label: 'Attached as evidence' };
    if (a.score != null) return { key: 'self', label: 'Self-scored' };
    return { key: 'none', label: 'Not graded' };
  }

  S.academic.grades = function (c) {
    const vc = X(), g = S.grade(c), n = numbers(c);
    const all = c.modules.flatMap((m) => m.assignments);
    const waiting = all.filter((a) => statusOf(a).key === 'wait');
    const cg = S.courseGrade(c), cap = cg.hasCapstone && cg.weight > 0;
    const rows = [];
    c.modules.forEach((m, i) => {
      if (!m.assignments.length) return;
      const mm = n.mods[i], mp = pctOfSum(mm.earned, mm.possible);
      rows.push(h('tr', { class: 'grp' }, h('th', { colspan: 5, scope: 'colgroup' }, h('span', {}, 'Module ' + (i + 1) + ' · ' + m.title), h('span', { class: 'grp-pct' }, mp == null ? 'No scores yet' : mp + '% · ' + money1(mm.earned) + ' / ' + money1(mm.possible) + ' pts'))));
      m.assignments.forEach((a) => {
        const pct = S.pctOf(a), st = statusOf(a), ai = st.key === 'ai';
        const numIn = (key, label) => h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: a[key] == null ? '' : String(a[key]), 'aria-label': label + ': ' + a.title, onchange: (e) => { a[key] = vc.num(e.target.value); commit(); } });
        rows.push(h('tr', {},
          h('td', { 'data-label': 'Assignment', class: 'gr-name' }, h('a', { href: S.href(c, 'assignments', a.id + (st.key === 'wait' ? '/feedback' : '')) }, a.title), ' ', S.kindMark(S.stageOf(a))),
          h('td', { 'data-label': 'Status', class: 'gr-status' }, h('span', { class: 'gr-chip gr-' + st.key }, st.label), st.note ? h('small', { class: 'muted' }, st.note) : null),
          h('td', { 'data-label': 'Points' }, ai ? String(a.points) : numIn('points', 'Points')),
          h('td', { 'data-label': 'Score' }, ai ? String(a.score) : numIn('score', 'Score')),
          h('td', { 'data-label': 'Result', class: 'pct' }, pct != null ? h('span', {}, h('b', {}, pct + '%'), ' ' + S.letter(pct)) : '—')));
      });
    });
    if (cap) { // the capstone's own group, below the modules (it is not part of any module)
      const a = S.capstoneOf(c), pct = S.pctOf(a), st = statusOf(a);
      rows.push(h('tr', { class: 'grp' }, h('th', { colspan: 5, scope: 'colgroup' }, h('span', {}, 'Course capstone'), h('span', { class: 'grp-pct' }, cg.weight + '% of the course grade'))));
      rows.push(h('tr', {},
        h('td', { 'data-label': 'Assignment', class: 'gr-name' }, h('a', { href: S.href(c, 'assignments', a.id + (st.key === 'wait' ? '/feedback' : '')) }, a.title), ' ', h('span', { class: 'gr-chip' }, 'Capstone')),
        h('td', { 'data-label': 'Status', class: 'gr-status' }, h('span', { class: 'gr-chip gr-' + st.key }, st.label), st.note ? h('small', { class: 'muted' }, st.note) : null),
        h('td', { 'data-label': 'Points' }, String(a.points)), h('td', { 'data-label': 'Score' }, a.score != null ? String(a.score) : '—'),
        h('td', { 'data-label': 'Result', class: 'pct' }, pct != null ? h('span', {}, h('b', {}, pct + '%'), ' ' + S.letter(pct)) : '—')));
    }
    const gp = g ? g.pct : null;
    const calc = !cap ? null : h('section', { class: 'gr-calc', 'aria-label': 'How your course grade is calculated' },
      h('h3', { class: 'ac-h' }, 'How your course grade is calculated'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'grades ac-table' },
        h('caption', { class: 'sr-only' }, 'Module average, capstone grade and the combined course grade'),
        h('thead', {}, h('tr', {}, ['Part', 'Weight', 'Result', 'Points'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {},
          h('tr', {}, h('td', { 'data-label': 'Part' }, 'Module assignments (average)'), h('td', { 'data-label': 'Weight' }, (100 - cg.weight) + '%'), h('td', { 'data-label': 'Result', class: 'pct' }, cg.module ? h('span', {}, h('b', {}, cg.module.pct + '%'), ' ' + S.letter(cg.module.pct)) : 'No scores yet'), h('td', { 'data-label': 'Points' }, cg.module ? money1(cg.module.earned) + ' / ' + money1(cg.module.possible) : '—')),
          h('tr', {}, h('td', { 'data-label': 'Part' }, 'Course capstone'), h('td', { 'data-label': 'Weight' }, cg.weight + '%'), h('td', { 'data-label': 'Result', class: 'pct' }, cg.capstone ? h('span', {}, h('b', {}, cg.capstone.pct + '%'), ' ' + S.letter(cg.capstone.pct)) : 'Not graded yet'), h('td', { 'data-label': 'Points' }, cg.capstone ? money1(cg.capstone.score) + ' / ' + money1(cg.capstone.points) : '—')),
          h('tr', { class: 'gr-total' }, h('td', { 'data-label': 'Part' }, h('b', {}, cg.provisional ? 'Course grade (provisional)' : 'Course grade')), h('td', { 'data-label': 'Weight' }, '100%'), h('td', { 'data-label': 'Result', class: 'pct' }, cg.pct != null ? h('span', {}, h('b', {}, cg.pct + '%'), ' ' + S.letter(cg.pct)) : '—'), h('td', { 'data-label': 'Points' }, '')))),
      h('p', { class: 'small muted' }, cg.basis === 'combined' ? 'Course grade = ' + (100 - cg.weight) + '% × module average + ' + cg.weight + '% × capstone grade.'
        : cg.basis === 'modules' ? 'The capstone has not been graded yet, so it is not counted (and never counts as zero). Until it is graded, your course grade is your module average, shown as provisional.'
        : cg.basis === 'capstone-only' ? 'Your capstone is graded, but no module assignment has a score yet, so a combined grade cannot be calculated.'
        : 'Nothing is graded yet.')));

    return wrapper(c, 'ac-grades',
      h('header', { class: 'ac-head' }, h('p', { class: 'eyebrow' }, 'Grades · ' + c.code), h('h2', { class: 'ac-title' }, 'Transcript')),
      h('section', { class: 'gr-hero' },
        h('div', { class: 'gr-main' }, h('p', { class: 'eyebrow' }, cap && cg.provisional ? 'Current Grade (provisional)' : 'Current Grade'),
          h('div', { class: 'grade-big' }, (cap ? cg.pct : gp) != null ? (cap ? cg.pct : gp) + '%' : '—', (cap ? cg.pct : gp) != null ? h('span', { class: 'gr-letter' }, ' ' + S.letter(cap ? cg.pct : gp)) : null),
          cap ? h('p', { class: 'muted small' }, cg.basis === 'combined' ? 'Module average and capstone combined, as shown below.' : 'Provisional: this is your module average until the capstone is graded.') : null,
          h('p', { class: 'muted small' }, g ? money1(g.earned) + ' of ' + money1(g.possible) + ' points, across ' + plural(g.n, 'scored assignment') + ' of ' + all.length + '.' : 'Enter points and your score on an assignment, or get one AI-graded, to see your average.')),
        h('div', { class: 'gr-stages' }, h('h3', { class: 'ac-h' }, 'By stage'), STAGE_KEYS.map((k) => {
          const s = n.stages[k], p = pctOfSum(s.earned, s.possible);
          return h('div', { class: 'gr-line' }, h('span', { class: 'gr-lbl' }, S.kindMark(k)), bar(p, STAGE_NAME[k]), h('span', { class: 'gr-val' }, pctText(p)));
        }))),
      calc,
      waiting.length ? h('section', { class: 'callout gr-wait', role: 'status' },
        h('b', {}, plural(waiting.length, 'assignment') + ' with feedback, not graded yet: '),
        waiting.map((a, i) => [i ? ', ' : '', h('a', { href: S.href(c, 'assignments', a.id + '/feedback') }, a.title)]).flat(),
        '. The first review becomes the grade after ' + S.REVIEW_HOURS + ' hours unless you resubmit.') : null,
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grades ac-table' },
        h('caption', { class: 'sr-only' }, 'Assignments with points, score and result, grouped by module'),
        h('thead', {}, h('tr', {}, ['Assignment', 'Status', 'Points', 'Score', 'Result'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, rows)))
        : h('p', { class: 'empty' }, 'No assignments yet. Add assignments inside a module, then grade yourself here.'),
      h('p', { class: 'small muted' }, 'AI-graded scores are automated assessments and cannot be edited here. For your own assignments you can enter points and a score yourself. Letters are a common scale shown beside the points, not an official grade.'));
  };

  /* =============================== PORTFOLIO =============================== */

  function fileLink(f) { return S.fileLine ? S.fileLine(f) : (f && f.fileName ? h('p', { class: 'small muted' }, 'File: ' + f.fileName) : null); }
  const excerpt = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; };

  function exhibit(c, m, a, i) {
    const f = a.work && a.work.final, fb = f && f.feedback, pct = fb ? S.pctOf(a) : null;
    const when = f && f.at ? new Date(f.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return h('li', { class: 'ex' },
      h('div', { class: 'ex-top' }, h('span', { class: 'ex-no' }, 'No. ' + String(i + 1).padStart(2, '0')), a.kind ? S.kindMark(a.kind) : badge('Assignment', 'soft')),
      h('h3', { class: 'ex-title' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title)),
      a.portfolioNote ? h('div', { class: 'ex-shows' }, h('span', { class: 'ex-k' }, 'What it shows'), h('p', {}, a.portfolioNote)) : null,
      h('div', { class: 'ex-meta' }, h('span', {}, m.title), when ? h('span', {}, when) : null, fb ? badge('AI-reviewed', 'soft') : null, f && f.late ? badge('Late', 'warn') : null),
      fb ? h('div', { class: 'ex-score' }, h('strong', {}, pct + '%'), h('span', {}, a.score + ' / ' + a.points + ' pts · ' + S.letter(pct))) : null,
      f && f.text ? h('p', { class: 'ex-excerpt' }, excerpt(f.text, 260)) : (f && f.fileName ? h('p', { class: 'ex-excerpt muted' }, 'File: ' + f.fileName) : null),
      h('details', { class: 'work-panel' }, h('summary', {}, 'Read the work' + (fb ? ' and the feedback' : '')),
        h('div', { class: 'wp-body' }, f && f.text ? h('p', { class: 'pre' }, f.text) : null, fileLink(f), fb ? S.finalFeedbackOnly(a) : null)),
      h('p', { class: 'small ex-manage' }, h('a', { href: S.href(c, 'assignments', a.id + '/feedback') }, 'Open this assignment to remove it from the Portfolio')));
  }

  S.academic.portfolio = function (c) {
    const graded = [], pieces = [];
    c.modules.forEach((m) => m.assignments.forEach((a) => {
      if (a.points > 0 && a.score != null) graded.push({ m, a });
      if (a.portfolio && a.work && a.work.final) pieces.push({ m, a });
    }));
    const finalProj = (c.work.status === 'completed' || c.work.description || c.work.reflection) ? c.work : null;
    const earned = c.credentials.filter((k) => k.status === 'earned'), open = c.credentials.filter((k) => k.status !== 'earned' && k.status !== 'not-applicable');
    const credRow = (k) => h('li', { class: 'item' }, h('div', { class: 'item-body' },
      h('div', { class: 'item-title' }, k.url ? h('a', { href: k.url, target: '_blank', rel: 'noopener noreferrer' }, k.name) : k.name, ' ', badge(S.label(S.CRED_STATUS, k.status), k.status === 'earned' ? 'solid' : ''),
        k.requirement ? ' ' : null, k.requirement ? badge(k.requirement === 'required' ? 'Required for your goal' : 'Suggested', 'soft') : null),
      h('div', { class: 'item-note' }, [k.issuer, c.code].filter(Boolean).join(' · ')),
      h('div', { class: 'item-actions no-print' }, h('a', { class: 'small', href: S.href(c, 'modules') }, 'Manage'))));
    const sec = (title, count, ...kids) => h('section', { class: 'ac-sec' }, h('div', { class: 'section-head' }, h('h3', { class: 'ac-h' }, title), count ? h('span', { class: 'count' }, count) : null), ...kids);
    const print = () => {
      const ds = [...document.querySelectorAll('.ac-portfolio details')], was = ds.map((d) => d.open);
      ds.forEach((d) => { d.open = true; });
      try { window.print(); } finally { ds.forEach((d, i) => { d.open = was[i]; }); }
    };
    // Legacy, self-reported final project (My Work). Kept exactly as before; when a real capstone exists it gets its own, clearly different heading.
    const legacyBody = () => (
      finalProj ? h('article', { class: 'cap' },
          h('h4', { class: 'cap-title' }, c.work.title || c.deliverable || c.title, ' ', badge(S.label(S.WORK_STATUS, finalProj.status), finalProj.status === 'completed' ? 'solid' : '')),
          finalProj.description ? h('div', {}, h('p', { class: 'ex-k' }, 'What I made'), h('p', { class: 'pre' }, finalProj.description)) : null,
          finalProj.reflection ? h('div', {}, h('p', { class: 'ex-k' }, 'Reflection'), h('p', { class: 'pre' }, finalProj.reflection)) : null,
          finalProj.url ? h('p', {}, h('a', { href: finalProj.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open the linked work')) : null,
          h('p', { class: 'small no-print' }, h('a', { href: '#/work' }, 'Edit in My Work'))) : h('p', { class: 'empty' }, 'Your final project appears here once you describe it or mark it completed in My Work.'));
    const capA = S.capstoneOf(c), capFinal = capA && capA.work && capA.work.final;
    const capCard = () => {
      const fb = capFinal.feedback, pct = fb ? S.pctOf(capA) : null, when = capFinal.at ? new Date(capFinal.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return h('article', { class: 'cap cap-major' },
        h('p', { class: 'ex-k' }, 'Culminating project · counts ' + c.capstone.weight + '% of the course grade'),
        h('h4', { class: 'cap-title' }, h('a', { href: S.href(c, 'assignments', capA.id) }, capA.title)),
        capA.portfolioNote ? h('div', { class: 'ex-shows' }, h('span', { class: 'ex-k' }, 'What it shows'), h('p', {}, capA.portfolioNote)) : null,
        h('div', { class: 'ex-meta' }, when ? h('span', {}, when) : null, fb ? badge('AI-reviewed', 'soft') : null, capFinal.late ? badge('Late', 'warn') : null),
        fb ? h('div', { class: 'ex-score' }, h('strong', {}, pct + '%'), h('span', {}, capA.score + ' / ' + capA.points + ' pts · ' + S.letter(pct))) : null,
        capFinal.text ? h('p', { class: 'ex-excerpt' }, excerpt(capFinal.text, 400)) : (capFinal.fileName ? h('p', { class: 'ex-excerpt muted' }, 'File: ' + capFinal.fileName) : null),
        h('details', { class: 'work-panel' }, h('summary', {}, 'Read the work' + (fb ? ' and the feedback' : '')),
          h('div', { class: 'wp-body' }, capFinal.text ? h('p', { class: 'pre' }, capFinal.text) : null, fileLink(capFinal), fb ? S.finalFeedbackOnly(capA) : null)));
    };
    const capSections = () => (capA ? [
      sec('Course capstone', '', capFinal ? capCard() : h('p', { class: 'empty' }, 'Your capstone appears here once it has a final version. ', h('a', { class: 'no-print', href: S.href(c, 'assignments', capA.id) }, 'Open the capstone'), '.')),
      (c.work.status === 'completed' || c.work.description || c.work.reflection) ? sec('Self-reported final project', '', legacyBody()) : null,
    ] : [sec('Course capstone', '', legacyBody())]);
    return wrapper(c, 'ac-portfolio',
      h('header', { class: 'pf-head', 'data-theme': c.designTheme },
        h('p', { class: 'eyebrow' }, 'Portfolio · ' + c.title),
        h('h2', { class: 'display' }, 'Selected work'),
        h('p', { class: 'lede' }, 'The work and credentials you can point to for this course.'),
        h('p', { class: 'small muted' }, 'Only final versions appear here. AI-reviewed scores are automated assessments, and credentials are self-reported; none of it is verified by anyone else.'),
        h('dl', { class: 'stats' },
          h('div', {}, h('dt', {}, 'Pieces'), h('dd', {}, String(pieces.length))),
          h('div', {}, h('dt', {}, 'Graded'), h('dd', {}, String(graded.length))),
          h('div', {}, h('dt', {}, 'Credentials'), h('dd', {}, String(earned.length)))),
        h('div', { class: 'btn-row no-print' }, h('button', { class: 'btn', type: 'button', onclick: () => S.publish.open('publication', c) }, 'Export as PDF'), h('button', { class: 'btn ghost', type: 'button', onclick: print }, 'Print this page'))),
      sec('Selected work', plural(pieces.length, 'piece'),
        pieces.length ? h('ul', { class: 'exhibits' }, pieces.map(({ m, a }, i) => exhibit(c, m, a, i))) : h('p', { class: 'empty' }, 'Finished Demonstrate assignments are saved here as you complete them. You can add or remove any finished assignment from its own page.')),
      ...capSections(),
      sec('Graded record', plural(graded.length, 'assignment'),
        graded.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grades ac-table ac-record' },
          h('thead', {}, h('tr', {}, ['Assignment', 'Stage', 'Score', 'Result'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, graded.map(({ m, a }) => { const p = S.pctOf(a), ai = !!(a.work && a.work.final && a.work.final.feedback); return h('tr', {},
            h('td', { 'data-label': 'Assignment' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title), ai ? h('small', { class: 'muted' }, ' · AI-reviewed') : null, a.work && a.work.final && a.work.final.late ? h('small', { class: 'muted' }, ' · late') : null),
            h('td', { 'data-label': 'Stage' }, S.kindMark(S.stageOf(a))), h('td', { 'data-label': 'Score' }, a.score + ' / ' + a.points),
            h('td', { 'data-label': 'Result', class: 'pct' }, h('b', {}, p + '%'), ' ' + S.letter(p))); })))) : h('p', { class: 'empty' }, 'Assignments you have scored will appear here.')),
      sec('Certificates, licenses, and credentials', earned.length + ' earned',
        earned.length ? h('ul', { class: 'items' }, earned.map(credRow)) : h('p', { class: 'empty' }, 'Credentials you mark as earned will appear here.'),
        open.length ? h('div', { class: 'no-print' }, h('h4', { class: 'minor' }, 'Working toward'), h('ul', { class: 'items' }, open.map(credRow))) : null));
  };
})(window.Sovereign = window.Sovereign || {});
