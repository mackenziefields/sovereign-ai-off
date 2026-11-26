/* sovereign. — first run, Dashboard (course tiles, To Do, Calendar, Learning progress), My Work, Data & Backup. */
(function (S) {
  'use strict';
  const { h, field, select, progressBar, checkbox, badge, plural, toast, go, commit, tile } = S;
  const V = (S.views = S.views || {});
  const ui = S.ui;
  const BAD_LINK = 'That link doesn’t look valid. Use an http(s) address.';
  const banner = (text, kind) => h('p', { class: 'banner ' + (kind || ''), role: kind === 'error' ? 'alert' : 'status' }, text);

  /* ---------- first run ---------- */

  function start(courses, msg) { S.state = { version: 3, setup: true, courses, name: S.state.name || '' }; S.save(); go('#/'); toast(msg); }

  V.firstRun = function () {
    return h('div', { class: 'narrow' },
      h('p', { class: 'eyebrow' }, 'Self-directed learning'),
      h('h1', {}, 'Learn it. Apply it. Prove it.'),
      h('p', { class: 'lede' }, 'Sovereign turns books, articles, and courses into practical skills and tangible work you can point to. Run your own courses, practice what you learn, and finish each with something real.'),
      h('div', { class: 'trio' },
        h('div', {}, h('b', {}, 'Learn'), h('p', {}, 'Gather readings, videos, and links into modules.')),
        h('div', {}, h('b', {}, 'Apply'), h('p', {}, 'Complete practical assignments that make you use it.')),
        h('div', {}, h('b', {}, 'Demonstrate'), h('p', {}, 'Document a final project as proof of what you can do.'))),
      ui.dataMsg ? banner(ui.dataMsg.text, ui.dataMsg.type) : null,
      h('div', { class: 'choices' },
        h('div', { class: 'choice' },
          h('h2', {}, 'Start with the five starter courses'),
          h('p', {}, 'Cultural Anthropology, Financial Freedom, Entrepreneurship, Feminism, and Literature & Writing, set up and ready to fill in. Rename or delete anything.'),
          h('button', { class: 'btn', type: 'button', onclick: () => start(S.starterCourses(), 'Starter courses added. Open one to begin.') }, 'Use the starter courses')),
        h('div', { class: 'choice' },
          h('h2', {}, 'Start with an empty dashboard'),
          h('p', {}, 'Add your own courses one at a time. Every new course gets the same layout.'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => start([], 'Dashboard ready. Add your first course.') }, 'Start blank'))),
      h('p', { class: 'small muted' }, 'Or explore a complete worked example: ',
        h('button', { class: 'linkbtn', type: 'button', onclick: () => start([S.exampleCourse()], 'Example loaded. Edit anything to make it yours.') }, 'Independent Journalism (one course).')),
      h('p', { class: 'small muted' }, 'Your progress is stored only in this browser. It does not sync between devices. Use Export backup to keep a copy or move it. ',
        h('button', { class: 'linkbtn', type: 'button', onclick: pickImport }, 'Have a backup? Import it.')));
  };

  /* ---------- dashboard ---------- */

  function dueLabel(a) {
    if (!a.due) return h('span', { class: 'due' }, 'No due date');
    const late = a.due < S.todayISO();
    return h('span', { class: 'due' + (late ? ' late' : '') }, (late ? 'Overdue · ' : 'Due ') + S.fmtDate(a.due));
  }

  function upNextPanel() {
    const list = S.upNext(), shown = list.slice(0, 10);
    if (!list.length) return h('p', { class: 'empty' }, S.allAssignments().length ? 'All caught up. Every assignment is done.' : 'No assignments yet. Add them inside a module.');
    return h('div', {},
      h('ul', { class: 'items todo' }, shown.map(({ c, m, a }) => h('li', { class: 'item' },
        checkbox(a.done, 'Mark completed: ' + a.title, (v) => { a.done = v; commit(); }),
        h('div', { class: 'item-body' },
          h('div', { class: 'item-title' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title)),
          h('div', { class: 'item-meta' }, h('span', { class: 'code' }, c.code), dueLabel(a)))))),
      list.length > shown.length ? h('p', { class: 'small muted' }, '+ ' + (list.length - shown.length) + ' more. See each course’s Assignments page.') : null);
  }

  function calendarPanel() {
    const today = S.todayISO();
    const ym = /^\d{4}-\d{2}$/.test(ui.cal) ? ui.cal : today.slice(0, 7);
    const [Y, Mo] = ym.split('-').map(Number);
    const shift = (d) => { const n = new Date(Y, Mo - 1 + d, 1); ui.cal = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); S.render(false); };
    const items = S.allAssignments().filter((x) => x.a.due.startsWith(ym)).sort((p, q) => p.a.due.localeCompare(q.a.due));
    const byDay = {}; items.forEach((x) => { const d = +x.a.due.slice(8); (byDay[d] = byDay[d] || []).push(x); });
    const lead = new Date(Y, Mo - 1, 1).getDay(), days = new Date(Y, Mo, 0).getDate();
    const cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => h('div', { class: 'dow', 'aria-hidden': 'true' }, d));
    for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'blank', 'aria-hidden': 'true' }));
    for (let d = 1; d <= days; d++) {
      const iso = ym + '-' + String(d).padStart(2, '0'), n = (byDay[d] || []).length;
      cells.push(h('div', { class: 'day' + (iso === today ? ' today' : ''), title: n ? plural(n, 'assignment') + ' due' : null },
        h('span', {}, d), n ? h('span', { class: 'dots', 'aria-label': plural(n, 'assignment') + ' due' }, Array.from({ length: Math.min(n, 3) }, () => h('i', { class: 'dot' }))) : null));
    }
    return h('div', {},
      h('div', { class: 'cal-nav' },
        h('button', { class: 'linkbtn', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '←'),
        h('strong', { 'aria-live': 'polite' }, new Date(Y, Mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
        h('button', { class: 'linkbtn', type: 'button', 'aria-label': 'Next month', onclick: () => shift(1) }, '→')),
      h('div', { class: 'cal' }, cells),
      items.length
        ? h('ul', { class: 'items todo' }, items.map(({ c, m, a }) => h('li', { class: 'item' + (a.done ? ' is-done' : '') },
            h('div', { class: 'item-body' }, h('div', { class: 'item-title' }, h('a', { href: S.href(c, 'modules', m.id) }, a.title)),
              h('div', { class: 'item-meta' }, h('span', { class: 'code' }, c.code), h('span', { class: 'due' }, S.fmtDate(a.due) + (a.done ? ' · done' : '')))))))
        : h('p', { class: 'empty' }, 'Nothing due this month. Give an assignment a due date to see it here.'));
  }

  // Your name stays in this browser. It is never sent to the AI service.
  function nameForm() {
    return h('form', { class: 'panel name-form', onsubmit: (e) => {
      e.preventDefault(); S.state.name = String(new FormData(e.target).get('name') || '').trim().slice(0, 60); commit();
    } },
      h('label', { class: 'field' }, h('span', {}, 'What should we call you? (optional)'), h('input', { type: 'text', name: 'name', value: S.state.name || '', maxlength: '60', autocomplete: 'given-name' }),
        h('small', {}, 'Used only to greet you. Stays in this browser.')),
      h('button', { class: 'btn ghost', type: 'submit' }, 'Save name'));
  }

  /* ---------- learning progress (replaces the module library) ---------- */
  const STATE_LABEL = { complete: 'Complete', progress: 'In progress', todo: 'Not started' };
  const WORK_LABEL = { todo: 'Not started', submitted: 'Submitted', feedback: 'Imported review: revise it', done: 'Complete', incomplete: 'Not finished' };
  const pctText = (g) => (g.pct == null ? 'Not graded yet' : g.pct + '% ' + S.letter(g.pct));
  function gradeNote(g) {
    if (g.pct == null) return 'Not graded yet';
    if (g.basis === 'combined') return pctText(g) + ' (modules ' + (100 - g.weight) + '%, capstone ' + g.weight + '%)';
    return pctText(g) + (g.provisional ? ' (provisional: capstone not graded yet)' : '');
  }
  function progressRow(c) {
    const p = S.progressOf(c), key = 'prog:' + c.id, cap = p.capstone, k = p.counts;
    const d = h('details', { class: 'prog-card', open: ui.open.has(key) });
    d.addEventListener('toggle', () => { if (d.open) ui.open.add(key); else ui.open.delete(key); });
    const segs = p.mods.map((x) => h('li', { class: 'seg ' + x.state, title: x.m.title + ': ' + STATE_LABEL[x.state] }));
    const summary = p.modsTotal ? p.modsDone + ' of ' + p.modsTotal + (p.modsTotal === 1 ? ' module' : ' modules') + ' complete' : 'No modules yet';
    d.append(
      h('summary', {},
        h('span', { class: 'code' }, c.code),
        h('span', { class: 'prog-title' }, h('b', {}, c.title), h('small', {}, summary + (cap && cap.status === 'ready' ? ' · capstone: ' + WORK_LABEL[cap.key].toLowerCase() : ''))),
        h('span', { class: 'mod-pct' }, p.pct + '%')),
      h('div', { class: 'prog-body' },
        p.modsTotal ? h('ol', { class: 'segs', role: 'img', 'aria-label': summary }, segs) : null,
        h('dl', { class: 'prog-facts' },
          h('div', {}, h('dt', {}, 'Where you are'), h('dd', {}, p.current
            ? h('a', { href: S.href(c, 'modules', p.current.m.id) }, p.current.m.title) : (p.modsTotal ? 'All modules complete' : '—'),
            p.current ? h('small', {}, ' ' + p.current.st.done + ' of ' + p.current.st.items + ' items done') : null)),
          h('div', {}, h('dt', {}, 'Assignments'), h('dd', {}, k.total
            ? k.done + ' complete · ' + (k.feedback ? k.feedback + ' imported, awaiting your revision · ' : '') + k.submitted + ' submitted · ' + k.todo + ' not started' : 'None yet')),
          h('div', {}, h('dt', {}, 'Course grade'), h('dd', {}, gradeNote(p.grade)))),
        cap ? h('div', { class: 'prog-cap' },
          h('b', {}, 'Course capstone'),
          h('span', {}, cap.status === 'incomplete' ? 'Not finished: open the course to finish it.'
            : WORK_LABEL[cap.key] + (cap.graded ? ' · ' + cap.score + ' / ' + cap.points + ' (' + cap.pct + '%)' : '') + (cap.weight ? ' · counts ' + cap.weight + '%' : '')),
          cap.a ? h('a', { href: S.href(c, 'assignments', cap.a.id) }, cap.key === 'todo' ? 'Start the capstone' : 'Open the capstone') : null) : null,
        p.modsTotal ? h('ul', { class: 'lib' }, p.mods.map((x) => h('li', {}, h('a', { href: S.href(c, 'modules', x.m.id) },
          h('span', { class: 'code' }, STATE_LABEL[x.state]), h('span', {}, h('b', {}, x.m.title)), h('span', { class: 'mod-pct' }, x.m.complete ? 'Complete' : x.st.pct + '%'))))) : null));
    return h('li', {}, d);
  }
  function progressSection() {
    const cs = S.state.courses;
    return h('section', { 'aria-label': 'Learning progress' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Learning progress'), h('span', { class: 'count' }, plural(S.allModules().length, 'module'))),
      cs.length ? h('ul', { class: 'prog-list' }, cs.map(progressRow)) : h('p', { class: 'empty' }, 'Your progress through each course will appear here.'));
  }

  V.dashboard = function () {
    const cs = S.state.courses;
    const tab = (key, label) => h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(ui.tab === key), onclick: () => { ui.tab = key; S.render(false); } }, label);

    const courses = h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'Courses'),
        ui.edit === 'newCourse' || ui.edit === 'newCourseForm' ? null : h('button', { class: 'btn', type: 'button', onclick: () => { ui.edit = 'newCourse'; S.render(false); } }, 'New course')),
      ui.edit === 'newCourse' ? S.newCourseChooser() : null,
      ui.edit === 'newCourseForm' ? S.courseForm(null) : null,
      cs.length
        ? h('ul', { class: 'covers' }, cs.map((c) => {
            const st = S.courseStats(c);
            return h('li', { class: 'tile-wrap' }, S.cover({ href: S.href(c), theme: c.designTheme, code: c.code, title: c.title,
              meta: st.mods ? st.done + ' of ' + st.mods + (st.mods === 1 ? ' module' : ' modules') : 'No modules yet', pct: st.pct }));
          }))
        : h('p', { class: 'empty' }, 'No courses yet. Use New course to add your first.'));

    const library = progressSection();

    const rail = h('aside', { class: 'rail', 'aria-label': 'To Do' },
      h('div', { class: 'rail-box' },
        h('h2', { class: 'rail-h' }, 'To Do'),
        h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'To Do views' }, tab('next', 'Up next'), tab('cal', 'Calendar')),
        h('div', { role: 'tabpanel', class: 'tabpanel' }, ui.tab === 'cal' ? calendarPanel() : upNextPanel())));

    return h('div', { class: 'dash' },
      h('div', {},
        h('header', { class: 'masthead' },
          h('p', { class: 'eyebrow' }, new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })),
          h('h1', { class: 'display' }, S.state.name ? 'Welcome, ' + S.state.name + '.' : 'Dashboard'),
          h('p', { class: 'lede' }, 'Your courses, and what to do next.'),
          h('dl', { class: 'stats' },
            h('div', {}, h('dt', {}, 'Courses'), h('dd', {}, String(cs.length))),
            h('div', {}, h('dt', {}, 'Modules complete'), h('dd', {}, String(S.allModules().filter((x) => x.m.complete).length), h('small', {}, ' / ' + S.allModules().length))),
            h('div', {}, h('dt', {}, 'Assignments open'), h('dd', {}, String(S.upNext().length))),
            cs.some((c) => S.capstoneOf(c)) ? h('div', {}, h('dt', {}, 'Capstones finished'), h('dd', {}, String(cs.filter((c) => { const a = S.capstoneOf(c); return a && (a.done || (a.work && a.work.final)); }).length), h('small', {}, ' / ' + cs.filter((c) => S.capstoneOf(c)).length))) : null)),
        S.state.name ? null : nameForm(), courses, library),
      rail);
  };

  /* ---------- Portfolio ---------- */

  V.portfolio = function (course) {
    const cs = [course];
    const pieces = S.allAssignments().filter((x) => x.c === course && x.a.portfolio && x.a.work && x.a.work.final);
    const graded = S.allAssignments().filter(({ a }) => a.points > 0 && a.score != null);
    const finals = cs.filter((c) => c.work.status === 'completed' || c.work.description);
    const creds = cs.flatMap((c) => c.credentials.map((k) => ({ c, k })));
    const earned = creds.filter(({ k }) => k.status === 'earned'), open = creds.filter(({ k }) => k.status !== 'earned' && k.status !== 'not-applicable');
    const credRow = ({ c, k }) => h('li', { class: 'item' }, h('div', { class: 'item-body' },
      h('div', { class: 'item-title' }, k.url ? h('a', { href: k.url, target: '_blank', rel: 'noopener noreferrer' }, k.name) : k.name, ' ', badge(S.label(S.CRED_STATUS, k.status), k.status === 'earned' ? 'solid' : ''),
        k.requirement ? ' ' : null, k.requirement ? badge(k.requirement === 'required' ? 'Required for your goal' : 'Suggested', 'soft') : null),
      h('div', { class: 'item-note' }, [k.issuer, c.code].filter(Boolean).join(' · ')),
      h('div', { class: 'item-actions' }, h('a', { class: 'small', href: S.href(c, 'modules') }, 'Manage'))));
    const empty = (t) => h('p', { class: 'empty' }, t);
    return h('div', { class: 'portfolio', 'data-theme': course.designTheme },
      h('header', { class: 'pf-head', 'data-theme': course.designTheme },
        h('p', { class: 'eyebrow' }, 'Portfolio · ' + course.title),
        h('h2', { class: 'display' }, 'Selected work'),
        h('p', { class: 'lede' }, 'The work and credentials you can point to for this course.'),
        h('p', { class: 'small muted' }, 'Only final versions appear here. Scores are your own self-assessments unless labelled as imported AI reviews, and credentials are self-reported; none of it is verified by anyone else.'),
        h('dl', { class: 'stats' },
          h('div', {}, h('dt', {}, 'Pieces'), h('dd', {}, String(pieces.length))),
          h('div', {}, h('dt', {}, 'Graded'), h('dd', {}, String(graded.length))),
          h('div', {}, h('dt', {}, 'Credentials'), h('dd', {}, String(earned.length))))),
      h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Portfolio pieces'), h('span', { class: 'count' }, plural(pieces.length, 'piece'))),
        pieces.length ? h('ul', { class: 'plates' }, pieces.map(({ c, m, a }) => S.portfolioPiece(c, m, a))) : empty('Finished demonstrate assignments are saved here as you complete them. You can add or remove any finished assignment from its own page.')),
      h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Graded work'), h('span', { class: 'count' }, plural(graded.length, 'assignment'))),
        graded.length ? h('ul', { class: 'items' }, graded.map(({ c, m, a }) => h('li', { class: 'item' }, h('div', { class: 'item-body' },
          h('div', { class: 'item-title' }, h('a', { href: S.href(c, 'modules', m.id) }, a.title)),
          h('div', { class: 'item-meta' }, h('span', { class: 'code' }, c.code), h('span', { class: 'due' }, S.assess.scoreLine(a))),
          a.work && a.work.final && a.work.final.feedback ? h('div', { class: 'item-meta' }, h('span', { class: 'badge soft' }, 'AI review, imported'), a.work.final.late ? h('span', { class: 'badge warn' }, 'Late') : null) : null,
          a.work && a.work.final && a.work.final.feedback ? h('details', { class: 'work-panel' }, h('summary', {}, 'Imported review'), h('div', { class: 'wp-body' }, S.finalFeedback(a))) : null)))) : empty('Assignments you have scored will appear here.')),
      h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Final projects')),
        finals.length ? h('ul', { class: 'items' }, finals.map((c) => h('li', { class: 'item' }, h('div', { class: 'item-body' },
          h('div', { class: 'item-title' }, c.work.title || c.deliverable || c.title, ' ', badge(S.label(S.WORK_STATUS, c.work.status), c.work.status === 'completed' ? 'solid' : '')),
          h('div', { class: 'item-note' }, c.title), h('div', { class: 'item-actions' }, h('a', { class: 'small', href: '#/work' }, 'Open in My Work')))))) : empty('Final projects you have started or finished will appear here.')),
      h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Certificates, licenses, and credentials'), h('span', { class: 'count' }, earned.length + ' earned')),
        earned.length ? h('ul', { class: 'items' }, earned.map(credRow)) : empty('Credentials you mark as earned will appear here.'),
        open.length ? h('div', {}, h('h3', { class: 'minor' }, 'Working toward'), h('ul', { class: 'items' }, open.map(credRow))) : null));
  };

  /* ---------- My Work (proof of practice, per course) ---------- */

  V.work = function () {
    const cs = S.state.courses;
    const earned = cs.flatMap((c) => c.credentials.filter((k) => k.status === 'earned').map((k) => ({ c, k })));
    return h('div', { class: 'narrow' },
      h('p', { class: 'eyebrow' }, 'Demonstrate'),
      h('h1', {}, 'My Work'),
      h('p', { class: 'lede muted' }, 'Proof of practice: the tangible thing you made in each course, and what it taught you.'),
      cs.length ? cs.map((c) => workCard(c)) : h('p', { class: 'empty' }, 'Add a course on the Dashboard to start tracking its final project.'),
      h('section', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Credentials earned')),
        earned.length
          ? h('ul', { class: 'items' }, earned.map(({ c, k }) => h('li', { class: 'item' }, h('div', { class: 'item-body' },
              h('div', { class: 'item-title' }, k.url ? h('a', { href: k.url, target: '_blank', rel: 'noopener noreferrer' }, k.name) : k.name),
              h('div', { class: 'item-note' }, [k.issuer, c.code].filter(Boolean).join(' · '))))))
          : h('p', { class: 'empty' }, 'No credentials marked earned yet. Track optional licenses and certifications at the bottom of a course’s Modules page.')));
  };

  function workCard(c) {
    const w = c.work, key = 'work:' + c.id;
    const d = h('details', { class: 'work-card' + (w.status === 'completed' ? ' complete' : ''), open: ui.open.has(key) });
    d.addEventListener('toggle', () => { if (d.open) ui.open.add(key); else ui.open.delete(key); });
    d.append(
      h('summary', {},
        h('span', { class: 'code' }, c.code),
        h('span', { class: 'wc-title' }, h('b', {}, c.title), h('small', {}, c.deliverable || 'No final deliverable defined yet')),
        badge(S.label(S.WORK_STATUS, w.status), w.status === 'completed' ? 'solid' : '')),
      h('div', { class: 'wc-body' },
        h('div', { class: 'brief-card' },
          h('p', { class: 'eyebrow' }, 'Intended deliverable'),
          c.deliverable ? h('p', { class: 'deliverable' }, c.deliverable)
            : h('p', { class: 'muted' }, 'Not set yet. Add one under ', h('a', { href: S.href(c, 'syllabus') }, 'Syllabus → Edit course details'), '.'),
          w.criteria.length ? h('div', {}, h('p', { class: 'eyebrow' }, 'It is done when'), h('ul', { class: 'plain' }, w.criteria.map((x) => h('li', {}, x)))) : null),
        h('form', { onsubmit: (e) => {
          e.preventDefault(); const f = new FormData(e.target), u = S.cleanUrl(f.get('url'));
          if (u === null) return toast(BAD_LINK);
          Object.assign(w, { status: f.get('status'), description: f.get('description').trim(), reflection: f.get('reflection').trim(), url: u });
          commit(); toast('Saved.');
        } },
          select('Status', 'status', S.WORK_STATUS, w.status),
          field('What you made', 'description', { multiline: true, rows: 6, value: w.description, hint: 'Describe the finished work: what it is, who it is for, how it came together.' }),
          field('Reflection', 'reflection', { multiline: true, rows: 6, value: w.reflection, hint: 'What did you learn, what was hard, and what would you do differently?' }),
          field('Link to the work (optional)', 'url', { value: w.url, placeholder: 'https://', hint: 'A published piece, portfolio page, or shared document.' }),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn', type: 'submit' }, 'Save my work'),
            w.url ? h('a', { class: 'btn ghost', href: w.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open linked work') : null))));
    return d;
  }

  /* ---------- data & backup ---------- */

  function exportData() {
    const blob = new Blob([S.exportText()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'sovereign-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded.');
  }

  function importFail(text) { ui.dataMsg = { type: 'error', text }; S.render(false); }

  function pickImport() {
    const input = h('input', { type: 'file', accept: 'application/json,.json', onchange: () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > S.MAX_IMPORT_BYTES) return importFail('That file is too large to be a Sovereign backup.');
      const reader = new FileReader();
      reader.onerror = () => importFail('That file could not be read.');
      reader.onload = () => {
        let next;
        try { next = S.parseImport(reader.result); } catch (e) { return importFail(e.message); }
        const n = S.state.courses.length;
        if (n && !confirm('Replace your current work (' + plural(n, 'course') + ') with ' + plural(next.courses.length, 'course') + ' from this backup? Your current work will be overwritten and cannot be recovered unless you exported it first.')) return;
        next.name = next.name || S.state.name; // older backups have no name: keep yours
        S.state = next; ui.open.clear(); ui.dataMsg = null; S.save(); go('#/'); toast('Backup imported.');
      };
      reader.readAsText(file);
    } });
    input.click();
  }

  // Readings taken from a syllabus that have no online link (an earlier version kept them as "citations"). Placeholders and your own readings are never counted.
  const unlinkedSyllabusReadings = () => { const out = []; S.state.courses.forEach((c) => c.modules.forEach((m) => m.readings.forEach((r) => { if (r.source === 'ai' && !r.url && r.derivedFrom) out.push({ c, m, r }); }))); return out; };

  function tidySection() {
    const list = unlinkedSyllabusReadings();
    if (!list.length) return null;
    return h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'Readings without a link')),
      h('p', { class: 'small' }, 'Earlier versions kept some readings from a syllabus that have no online link (' + plural(list.length, 'reading') + ' in this browser). Readings now need a link. Your own readings and “Source needed” placeholders are not included.'),
      h('details', {}, h('summary', {}, 'Show them'), h('ul', { class: 'plain' }, list.map(({ c, m, r }) => h('li', { class: 'small' }, h('b', {}, r.title), ' · ' + c.title + ' · ' + m.title)))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', type: 'button', onclick: () => {
        if (!confirm('Remove ' + plural(list.length, 'reading') + ' that have no online link? Your own readings, placeholders, assignments, work and grades are not touched. This cannot be undone unless you exported a backup.')) return;
        list.forEach(({ m, r }) => { m.readings = m.readings.filter((x) => x !== r); });
        S.save(); toast('Removed ' + plural(list.length, 'reading') + '.'); S.render(false);
      } }, 'Remove ' + plural(list.length, 'reading') + ' without a link')));
  }

  V.data = function () {
    return h('div', { class: 'narrow' },
      h('p', { class: 'eyebrow' }, 'Your data'),
      h('h1', {}, 'Data & Backup'),
      !S.storageOK ? banner('Your browser is blocking local storage, so nothing can be saved. Export a backup to keep your work.', 'error') : null,
      ui.dataMsg ? banner(ui.dataMsg.text, ui.dataMsg.type) : null,
      h('p', { class: 'small muted' }, 'App version: build ' + S.BUILD + '. If this is lower than the latest announced, reload with Ctrl+Shift+R.'),
      h('p', { class: 'lede' }, 'Sovereign has no accounts and no server. Your work is stored only in this browser on this device, and it does not sync to your other devices.'),
      h('p', { class: 'muted' }, 'Clearing your browser’s site data would erase it. To keep a copy or move to another device, export a backup file and import it there.'),
      h('section', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Backup')),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onclick: exportData }, 'Export backup'),
          h('button', { class: 'btn ghost', type: 'button', onclick: pickImport }, 'Import backup')),
        h('p', { class: 'small muted' }, 'Importing replaces your current work, and asks you to confirm first. Files are checked before anything is changed. Backups from earlier versions of Sovereign still import.')),
      h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Your name')), nameForm(), S.state.name ? h('p', { class: 'small muted' }, 'Currently: ' + S.state.name + '. Save an empty box to remove it.') : null),
      S.aiDataSection(),
      tidySection(),
      h('section', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Remove data')),
        h('p', { class: 'muted small' }, 'To remove a single course, open it and choose Syllabus → Delete this course.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', type: 'button', onclick: () => {
            if (!confirm('Clear ALL Sovereign data saved in this browser? This removes every course, module, assignment and grade, and cannot be undone unless you exported a backup.')) return;
            S.clearAll(); go('#/'); toast('All saved data cleared.');
          } }, 'Clear all saved data'))));
  };
})(window.Sovereign = window.Sovereign || {});
