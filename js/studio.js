/* sovereign. — Module Studio: a module as three working rooms (Learn · Apply · Demonstrate) plus a wrap-up.
   Reads the existing data only; nothing here changes the saved format. Route: #/course/<id>/modules/<moduleId>/<learn|apply|demonstrate|wrap> */
(function (S) {
  'use strict';
  const { h, field, progressBar, checkbox, plural, trunc, toast, go, commit } = S;
  const ui = S.ui;
  const X = () => S.vc; // helpers exported by views-course.js

  const STAGES = [
    { key: 'learn', name: 'Learn', room: 'Reading Room', blurb: 'Take in the ideas. Read, listen, and test your grasp before you apply anything.' },
    { key: 'apply', name: 'Apply', room: 'Case Lab', blurb: 'Work a case or exercise. Use what you learned to make a judgment.' },
    { key: 'demonstrate', name: 'Demonstrate', room: 'Portfolio Studio', blurb: 'Make something you could show a professor, employer, or client.' },
    { key: 'wrap', name: 'Wrap-up', room: 'Reflection', blurb: 'Say what you learned, then close the module.' },
  ];
  S.STAGES = STAGES;

  /* ----- stage logic (pure) ----- */
  // An assignment with no kind is "Practice", listed under Apply. Nothing is rewritten.
  S.stageOf = (a) => (a.kind === 'learn' || a.kind === 'demonstrate' ? a.kind : 'apply');
  S.assignState = function (a) {
    if (a.work && a.work.phase === 'reviewed') return { key: 'feedback', label: 'Feedback ready' };
    if (a.done || (a.work && a.work.final)) return { key: 'done', label: 'Complete' };
    if (a.work) return { key: 'submitted', label: 'Submitted' };
    return { key: 'todo', label: 'Not started' };
  };
  const inStage = (m, key) => m.assignments.filter((a) => S.stageOf(a) === key);

  S.stageProgress = function (m, key) {
    if (key === 'learn') {
      const as = inStage(m, 'learn');
      return { done: m.readings.filter((r) => r.done).length + as.filter((a) => a.done).length, total: m.readings.length + as.length };
    }
    if (key === 'apply' || key === 'demonstrate') { const as = inStage(m, key); return { done: as.filter((a) => a.done).length, total: as.length }; }
    return { done: (m.reflection ? 1 : 0) + (m.complete ? 1 : 0), total: 2 };
  };

  // The one next thing to do in this module, with the stage it lives in.
  S.nextActivity = function (c, m) {
    const sh = (key, sub) => S.href(c, 'modules', m.id + '/' + key);
    const r = m.readings.find((x) => !x.done);
    if (r) return { stage: 'learn', verb: 'Read', title: r.title, href: sh('learn') };
    for (const key of ['learn', 'apply', 'demonstrate']) {
      const a = inStage(m, key).find((x) => !x.done);
      if (a) return { stage: key, verb: S.assignState(a).key === 'feedback' ? 'Review feedback on' : (S.assignState(a).key === 'todo' ? 'Start' : 'Finish'), title: a.title, href: S.href(c, 'assignments', a.id) };
    }
    if (!m.reflection) return { stage: 'wrap', verb: 'Write', title: 'your reflection', href: sh('wrap') };
    if (!m.complete) return { stage: 'wrap', verb: 'Close', title: 'this module', href: sh('wrap') };
    return null;
  };

  /* ----- shared pieces ----- */
  const sessionChecks = (ui.checks = ui.checks || new Set()); // self-check ticks last for this visit only; they are not saved

  function stageRail(c, m, current) {
    const links = [];
    const rail = h('nav', { class: 'rail-stages', 'aria-label': 'Module stages' },
      h('ol', {}, STAGES.map((s, i) => {
        const p = S.stageProgress(m, s.key), full = p.total > 0 && p.done >= p.total;
        const a = h('a', { href: S.href(c, 'modules', m.id + '/' + s.key), class: 'rs rs-' + s.key + (full ? ' is-full' : ''), 'aria-current': s.key === current ? 'page' : null },
          h('span', { class: 'rs-mark', 'aria-hidden': 'true' }), h('span', { class: 'rs-text' },
            h('span', { class: 'rs-name' }, s.name), h('span', { class: 'rs-room' }, s.room),
            h('span', { class: 'rs-count' }, p.total ? p.done + ' of ' + p.total + (full ? ' ✓' : '') : 'Nothing yet')));
        links.push(a);
        return h('li', {}, a);
      })));
    // Left/Right (and Home/End) move between stages; Enter opens one. Tab still works as normal.
    rail.addEventListener('keydown', (e) => {
      const i = links.indexOf(document.activeElement);
      if (i < 0) return;
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : null;
      if (to == null || !links[to]) return;
      e.preventDefault(); links[to].focus();
    });
    return rail;
  }

  function nextUpBar(c, m, current) {
    const n = S.nextActivity(c, m), idx = c.modules.indexOf(m), nextMod = c.modules[idx + 1];
    if (!n) return h('aside', { class: 'nextup is-clear', 'aria-label': 'Next up' },
      h('span', { class: 'nu-k' }, 'Module complete'), h('span', { class: 'nu-t' }, 'Everything in this module is done.'),
      nextMod ? h('a', { class: 'btn', href: S.href(c, 'modules', nextMod.id) }, 'Next module →') : null);
    const st = STAGES.find((s) => s.key === n.stage);
    return h('aside', { class: 'nextup', 'aria-label': 'Next up' },
      h('span', { class: 'nu-k' }, 'Next up · ' + st.room),
      h('span', { class: 'nu-t' }, n.verb + ' ', h('b', {}, trunc(n.title, 90))),
      h('a', { class: 'btn' + (n.stage === current ? ' ghost' : ''), href: n.href }, n.stage === current && n.href.indexOf('/assignments/') < 0 ? 'You’re here' : 'Go →'));
  }

  function stageIntro(s, p, extra) {
    return h('header', { class: 'room-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, S.kindMark(s.key) || s.name), h('h3', { class: 'room-title' }, s.room), h('p', { class: 'room-blurb' }, s.blurb)),
      p && p.total ? h('div', { class: 'room-prog' }, progressBar(Math.round(p.done / p.total * 100), s.room + ' progress'), h('span', { class: 'small muted' }, p.done + ' of ' + p.total + ' done')) : null,
      extra || null);
  }

  function stageFoot(c, m, key) {
    const i = STAGES.findIndex((s) => s.key === key), prev = STAGES[i - 1], next = STAGES[i + 1];
    return h('nav', { class: 'stage-foot', 'aria-label': 'Move between stages' },
      prev ? h('a', { href: S.href(c, 'modules', m.id + '/' + prev.key) }, '← ' + prev.room) : h('span', {}),
      next ? h('a', { class: 'btn ghost', href: S.href(c, 'modules', m.id + '/' + next.key) }, next.room + ' →') : h('span', {}));
  }

  /* ----- Learn: Reading Room ----- */
  const KIND_LABEL = { article: 'Article', book: 'Book', video: 'Video', course: 'Course', tool: 'Tool', document: 'Document', podcast: 'Podcast' };

  function resourceCard(m, r, i) {
    const vc = X();
    if (ui.edit === r.id) return vc.readingItem(m, r);
    const kind = KIND_LABEL[r.kind] || 'Reading', host = (() => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
    return h('li', { class: 'rcard' + (r.done ? ' is-done' : '') },
      h('div', { class: 'rc-plate', 'aria-hidden': 'true' }, h('span', { class: 'rc-no' }, String(i + 1).padStart(2, '0')), h('span', { class: 'rc-kind' }, kind)),
      h('div', { class: 'rc-body' },
        h('div', { class: 'rc-title' }, r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title) : r.title),
        h('div', { class: 'rc-by' }, [r.creator, host].filter(Boolean).join(' · ') || null),
        r.note ? h('p', { class: 'rc-note' }, r.note) : null,
        S.readingLabels(r),
        h('div', { class: 'rc-foot' },
          checkbox(r.done, 'Mark read: ' + r.title, (v) => { r.done = v; commit(); toast(v ? 'Marked as read.' : 'Marked as unread.'); }),
          h('span', { class: 'rc-state' }, r.done ? 'Read' : 'To read'),
          h('span', { class: 'item-actions' }, vc.editBtn(r.id), vc.moveBtns(m.readings, r), vc.removeBtn('reading', m.readings, r)))));
  }

  function selfCheck(m) {
    const vc = X(), k = 'selfCheck:' + m.id;
    if (ui.edit === k || !m.selfCheck.length) {
      if (ui.edit !== k) return h('section', { class: 'msec room-sec' }, h('div', { class: 'sec-head' }, h('h3', {}, 'Check your understanding')), vc.empty('Add a few questions you should be able to answer after the readings.'), vc.editBtn(k, 'Add questions'));
      return vc.listSection(m, 'selfCheck', 'Check your understanding', 'One question per line.');
    }
    const n = m.selfCheck.filter((_, i) => sessionChecks.has(m.id + ':' + i)).length;
    return h('section', { class: 'msec room-sec' },
      h('div', { class: 'sec-head' }, h('h3', {}, 'Check your understanding'), h('span', { class: 'count' }, n + ' of ' + m.selfCheck.length + ' answered'), vc.editBtn(k)),
      h('p', { class: 'small muted' }, 'Answer each one without looking, then tick it. Ticks last for this visit only. Anything you miss tells you what to reread.'),
      h('ol', { class: 'selfcheck' }, m.selfCheck.map((q, i) => {
        const key = m.id + ':' + i;
        return h('li', {}, h('label', { class: 'checkline' },
          h('span', { class: 'check' }, h('input', { type: 'checkbox', checked: sessionChecks.has(key), onchange: (e) => { e.target.checked ? sessionChecks.add(key) : sessionChecks.delete(key); S.render(false); } }), h('span', { class: 'box', 'aria-hidden': 'true' })),
          h('span', {}, q)));
      })));
  }

  function newActivity(c, m, kind, label) {
    return h('details', { class: 'add' }, h('summary', {}, label), h('div', { class: 'panel' }, X().assignmentForm(c, m, null, kind)));
  }

  function learnRoom(c, m) {
    const vc = X(), tasks = inStage(m, 'learn'), done = m.readings.filter((r) => r.done).length;
    return h('div', { class: 'room room-learn' },
      stageIntro(STAGES[0], S.stageProgress(m, 'learn')),
      h('div', { class: 'room-cols' }, h('div', { class: 'room-main' },
      h('section', { class: 'msec room-sec' },
        h('div', { class: 'sec-head' }, h('h3', {}, 'Resources'), h('span', { class: 'count' }, done + ' of ' + m.readings.length + ' read')),
        m.readings.length ? h('ul', { class: 'rcards' }, m.readings.map((r, i) => resourceCard(m, r, i))) : vc.empty('Add readings, videos, links, or notes to study.'),
        vc.findMaterialsBtn(c, m),
        h('details', { class: 'add' }, h('summary', {}, 'Add a resource'),
          h('form', { onsubmit: (e) => {
            e.preventDefault(); const f = new FormData(e.target), u = S.cleanUrl(f.get('url'));
            if (u === null) return toast(vc.BAD_LINK);
            m.readings.push({ id: S.uid(), title: f.get('title').trim(), url: u, note: f.get('note').trim(), done: false }); commit(); toast('Resource added.');
          } },
            field('Title', 'title', { required: true, placeholder: 'e.g. Chapter 1, or a link title' }), field('Link (optional)', 'url', { placeholder: 'https://' }),
            field('Note (optional)', 'note', { multiline: true, rows: 2 }), h('button', { class: 'btn', type: 'submit' }, 'Add resource')))),
      h('section', { class: 'msec room-sec' },
        h('div', { class: 'sec-head' }, h('h3', {}, 'Study tasks'), h('span', { class: 'count' }, tasks.filter((a) => a.done).length + ' of ' + tasks.length + ' done')),
        tasks.length ? h('ul', { class: 'items' }, tasks.map((a) => vc.assignmentItem(c, m, a, { actions: true, reorder: true }))) : vc.empty('No study tasks. These are short assignments that stay with the reading, such as a summary or a set of notes.'),
        newActivity(c, m, 'learn', 'New study task'))),
      h('aside', { class: 'room-aside' },
        vc.textSection(m, 'keyIdeas', 'Key ideas', 'Capture the main ideas, terms, and arguments worth remembering.'),
        vc.syllabiSection(c, m),
        selfCheck(m))),
      stageFoot(c, m, 'learn'));
  }

  /* ----- Apply: Case Lab ----- */
  function statusChip(a) { const s = S.assignState(a); return h('span', { class: 'status status-' + s.key }, s.label); }
  function facts(c, a) {
    const pct = S.pctOf(a), late = !a.done && a.due && a.due < S.todayISO();
    return [
      a.due ? h('span', { class: 'fact' + (late ? ' late' : '') }, (late ? 'Overdue · ' : 'Due ') + S.fmtDate(a.due)) : null,
      a.estimate ? h('span', { class: 'fact' }, a.estimate) : null,
      a.points != null ? h('span', { class: 'fact' }, a.score != null ? a.score + ' / ' + a.points + ' pts' + (pct != null ? ' · ' + pct + '%' : '') : a.points + ' pts') : null,
    ].filter(Boolean);
  }
  function cardActions(m, a) {
    const vc = X();
    return h('span', { class: 'item-actions' }, vc.editBtn(a.id), vc.moveBtns(m.assignments, a), vc.removeBtn('assignment', m.assignments, a));
  }
  function cta(c, a) {
    const k = S.assignState(a).key;
    return h('a', { class: 'btn' + (k === 'done' ? ' ghost' : ''), href: S.href(c, 'assignments', a.id) }, k === 'todo' ? 'Open' : k === 'feedback' ? 'Review feedback' : k === 'submitted' ? 'View submission' : 'Review');
  }

  function caseCard(c, m, a, i, list) {
    const vc = X();
    if (ui.edit === a.id) return h('li', { class: 'item' }, vc.assignmentForm(c, m, a));
    const lead = a.materials || a.description || a.purpose || '';
    return h('li', { class: 'case' + (a.done ? ' is-done' : '') },
      h('div', { class: 'case-no', 'aria-hidden': 'true' }, h('span', {}, a.kind ? 'Case' : 'Practice'), h('b', {}, String(i + 1).padStart(2, '0'))),
      h('div', { class: 'case-body' },
        h('div', { class: 'case-top' }, statusChip(a), facts(c, a)),
        h('h4', { class: 'case-title' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title)),
        lead ? h('p', { class: 'case-lead' }, trunc(lead.replace(/\s+/g, ' '), 260)) : h('p', { class: 'case-lead muted' }, 'No scenario written yet. Open it to add one.'),
        a.parts.length ? h('p', { class: 'small muted' }, plural(a.parts.length, 'step') + ' · ' + plural(a.parts.reduce((n, p) => n + p.questions.length, 0), 'guiding question')) : null,
        h('div', { class: 'case-foot' }, cta(c, a),
          checkbox(a.done, 'Mark completed: ' + a.title, (v) => { a.done = v; commit(); toast(v ? 'Marked complete.' : 'Marked not complete.'); }), h('span', { class: 'rc-state' }, a.done ? 'Done' : 'Mark done'),
          cardActions(m, a))));
  }

  function applyRoom(c, m) {
    const list = inStage(m, 'apply');
    return h('div', { class: 'room room-apply' },
      stageIntro(STAGES[1], S.stageProgress(m, 'apply')),
      h('section', { class: 'room-sec' },
        list.length ? h('ul', { class: 'cases' }, list.map((a, i) => caseCard(c, m, a, i, list))) : X().empty('No cases or exercises yet in this module.'),
        newActivity(c, m, 'apply', 'New case or exercise'),
        list.some((a) => !a.kind) ? h('p', { class: 'small muted' }, 'Practice means the assignment has no stage set. Edit it and choose a Stage to move it.') : null),
      stageFoot(c, m, 'apply'));
  }

  /* ----- Demonstrate: Portfolio Studio ----- */
  const FORMAT = { text: 'A written piece', pdf: 'A PDF', image: 'An image', file: 'A PDF, spreadsheet, or image', any: 'A written piece, PDF, or image' };
  function projectCard(c, m, a, i) {
    const vc = X();
    if (ui.edit === a.id) return h('li', { class: 'item' }, vc.assignmentForm(c, m, a));
    const skills = (a.rubric.length ? a.rubric.map((k) => k.name) : a.criteria).slice(0, 5);
    const st = S.assignState(a), fin = !!(a.work && a.work.final);
    const portfolio = a.portfolio ? 'In your Portfolio' : (fin || a.done) ? 'Finished · not in your Portfolio' : 'Joins your Portfolio when you finish it';
    return h('li', { class: 'project' + (a.done ? ' is-done' : '') },
      h('div', { class: 'pj-top' }, S.kindMark('demonstrate'), statusChip(a), facts(c, a)),
      h('h4', { class: 'pj-title' }, h('a', { href: S.href(c, 'assignments', a.id) }, a.title)),
      (a.portfolioNote || a.description) ? h('p', { class: 'pj-lead' }, trunc((a.portfolioNote || a.description).replace(/\s+/g, ' '), 300)) : null,
      h('dl', { class: 'pj-spec' },
        h('div', {}, h('dt', {}, 'Deliverable'), h('dd', {}, a.submit ? trunc(a.submit.replace(/\s+/g, ' '), 200) : (FORMAT[a.format] || 'A piece you can show someone'))),
        skills.length ? h('div', {}, h('dt', {}, 'Skills it shows'), h('dd', {}, h('ul', { class: 'skills' }, skills.map((s) => h('li', {}, trunc(s, 60)))))) : null,
        h('div', {}, h('dt', {}, 'Portfolio'), h('dd', {}, h('a', { href: S.href(c, 'portfolio') }, portfolio)))),
      h('div', { class: 'case-foot' }, cta(c, a),
        checkbox(a.done, 'Mark completed: ' + a.title, (v) => { a.done = v; commit(); toast(v ? 'Marked complete.' : 'Marked not complete.'); }), h('span', { class: 'rc-state' }, a.done ? 'Done' : 'Mark done'),
        cardActions(m, a)));
  }

  function demonstrateRoom(c, m) {
    const list = inStage(m, 'demonstrate');
    return h('div', { class: 'room room-demonstrate' },
      stageIntro(STAGES[2], S.stageProgress(m, 'demonstrate')),
      h('section', { class: 'room-sec' },
        list.length ? h('ul', { class: 'projects' }, list.map((a, i) => projectCard(c, m, a, i))) : X().empty('No portfolio piece in this module yet. Add one when you are ready to make something worth showing.'),
        newActivity(c, m, 'demonstrate', 'New portfolio piece')),
      stageFoot(c, m, 'demonstrate'));
  }

  /* ----- Wrap-up ----- */
  function wrapRoom(c, m) {
    const vc = X(), idx = c.modules.indexOf(m), nextMod = c.modules[idx + 1];
    return h('div', { class: 'room room-wrap' },
      stageIntro(STAGES[3], S.stageProgress(m, 'wrap')),
      h('section', { class: 'msec room-sec' }, h('div', { class: 'sec-head' }, h('h3', {}, 'This module so far')),
        h('ul', { class: 'recap' }, STAGES.slice(0, 3).map((s) => { const p = S.stageProgress(m, s.key); return h('li', {}, S.kindMark(s.key), h('span', {}, p.total ? p.done + ' of ' + p.total + ' done' : 'Nothing set up'), h('a', { href: S.href(c, 'modules', m.id + '/' + s.key) }, s.room + ' →')); }))),
      vc.textSection(m, 'reflection', 'Reflection', 'After finishing, write what you learned, what was hard, and what you would do differently.'),
      m.extras.map((x) => vc.extraSection(m, x)),
      h('details', { class: 'add' }, h('summary', {}, 'Add a custom section'),
        h('form', { onsubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); m.extras.push({ id: S.uid(), title: f.get('title').trim(), body: f.get('body').trim() }); commit(); } },
          field('Section title', 'title', { required: true, placeholder: 'e.g. Discussion questions' }), field('Content (optional)', 'body', { multiline: true, rows: 3 }), h('button', { class: 'btn', type: 'submit' }, 'Add section'))),
      h('div', { class: 'complete-row' },
        h('label', { class: 'checkline' }, h('span', { class: 'check' }, h('input', { type: 'checkbox', checked: m.complete, onchange: (e) => { m.complete = e.target.checked; commit(); toast(m.complete ? 'Module marked complete.' : 'Module reopened.'); } }), h('span', { class: 'box', 'aria-hidden': 'true' })), h('span', {}, 'Mark this module complete'))),
      nextMod ? h('p', {}, h('a', { class: 'btn ghost', href: S.href(c, 'modules', nextMod.id) }, 'Next module: ' + trunc(nextMod.title, 50) + ' →')) : null);
  }

  /* ----- the page ----- */
  S.studio = {
    page(c, m, stage) {
      const vc = X(), idx = c.modules.indexOf(m), prev = c.modules[idx - 1], next = c.modules[idx + 1];
      const na = S.nextActivity(c, m);
      const current = STAGES.some((s) => s.key === stage) ? stage : (na ? na.stage : 'learn'); // no stage in the link: open where the work is
      const ms = S.moduleStats(m), edit = ui.edit === 'title:' + m.id;
      const room = { learn: learnRoom, apply: applyRoom, demonstrate: demonstrateRoom, wrap: wrapRoom }[current](c, m);
      const title = edit
        ? h('form', { class: 'inline-edit', onsubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); m.title = f.get('title').trim(); m.duration = String(f.get('duration') || '').trim().slice(0, 60); m.edited = true; ui.edit = null; commit(); } },
            field('Module title', 'title', { value: m.title, required: true }), field('Timing (optional)', 'duration', { value: m.duration, placeholder: 'e.g. Week 1' }), h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'submit' }, 'Save'), vc.cancelBtn()))
        : h('h2', { class: 'mod-h studio-title' }, m.title);
      return h('div', { class: 'studio', 'data-theme': c.designTheme, 'data-stage': current },
        h('p', { class: 'crumbs' }, h('a', { href: S.href(c, 'modules') }, '← All modules')),
        h('header', { class: 'studio-open' },
          h('div', { class: 'chap', 'aria-hidden': 'true' }, h('span', { class: 'chap-no' }, String(idx + 1).padStart(2, '0')), h('span', { class: 'chap-of' }, 'of ' + String(c.modules.length).padStart(2, '0'))),
          h('div', { class: 'so-main' },
            h('p', { class: 'eyebrow' }, 'Module ' + (idx + 1) + ' of ' + c.modules.length + (m.duration ? ' · ' + m.duration : '')),
            m.origin === 'ai' && !m.edited ? h('p', { class: 'small muted' }, h('span', { class: 'badge soft' }, 'AI draft'), ' Check it over and change whatever doesn’t fit.') : null,
            title,
            h('div', { class: 'so-brief' }, vc.textSection(m, 'overview', 'Overview', 'Add a short overview: what this module covers and what you want to get from it.'), vc.listSection(m, 'objectives', 'You will be able to', 'One objective per line.')),
            h('div', { class: 'so-meta' }, progressBar(ms.pct, 'Module progress'),
              h('details', { class: 'so-settings' }, h('summary', {}, 'Module settings'),
                h('div', { class: 'tools' }, vc.editBtn('title:' + m.id, 'Rename or set timing'),
                  h('button', { class: 'linkbtn danger', type: 'button', onclick: () => {
                    if (!confirm('Delete “' + m.title + '” with its readings and assignments? This cannot be undone.')) return;
                    c.modules.splice(idx, 1); S.save(); go(S.href(c, 'modules')); toast('Module deleted.');
                  } }, 'Delete module')))))),
        stageRail(c, m, current),
        nextUpBar(c, m, current),
        h('div', { class: 'stage-panel', id: 'stage-panel', role: 'region', 'aria-label': STAGES.find((s) => s.key === current).room }, room),
        h('nav', { class: 'pager', 'aria-label': 'Module navigation' },
          prev ? h('a', { href: S.href(c, 'modules', prev.id) }, '← ' + prev.title) : h('span', {}),
          next ? h('a', { href: S.href(c, 'modules', next.id) }, next.title + ' →') : h('span', {})));
    },
  };
})(window.Sovereign = window.Sovereign || {});
