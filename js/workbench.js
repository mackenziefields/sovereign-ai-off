/* sovereign. — Assignment Workbench: one assignment as a two-pane workspace.
   Left: Brief · Materials · Rubric (what you work from). Right: Submission · Feedback · Office hours (what you hand in and get back).
   On phones one pane shows at a time, chosen from a six-way switcher. Reads existing data only; nothing here changes the saved format.
   Route: #/course/<id>/assignments/<assignmentId>[/<brief|materials|rubric|submit|feedback|office>] */
(function (S) {
  'use strict';
  const { h, checkbox, plural, toast, commit } = S;
  const ui = S.ui;
  const REF = [['brief', 'Brief'], ['materials', 'Materials'], ['steps', 'Steps'], ['rubric', 'Rubric']];
  const WORK = [['submit', 'Submission'], ['feedback', 'Feedback'], ['office', 'Office hours']];
  const REFK = REF.map((t) => t[0]), WORKK = WORK.map((t) => t[0]);
  const wbState = (ui.wb = ui.wb || {}); // which tab each pane last showed, per assignment (this visit only)

  const tabHref = (c, a, t) => S.href(c, 'assignments', a.id + '/' + t);
  const empty = (...k) => h('p', { class: 'empty' }, ...k);
  const realReadings = (m) => m.readings.filter((x) => x.source !== 'placeholder');

  // What an older or hand-made assignment is missing. Only reports what is absent; nothing is ever filled in for the person.
  function gaps(a) {
    const g = [];
    if (!a.description && !a.purpose) g.push('an overview');
    if (!a.parts.length && !a.steps.length) g.push('steps');
    if (!a.materials && !a.realEvidence && (S.stageOf(a) === 'apply' || (a.origin === 'ai' && a.basis === 'portfolio'))) g.push('a scenario or materials');
    if (!a.rubric.length && !a.criteria.length) g.push('grading criteria');
    if (!(a.points > 0)) g.push('points');
    if (!a.submit && !a.format) g.push('what to submit');
    return g;
  }

  function statusText(a) {
    const w = a.work;
    return !w ? (a.done ? 'Marked completed' : 'Not submitted') : w.phase === 'reviewed' ? 'Feedback ready' : w.final.feedback ? 'Final grade: ' + a.score + ' / ' + a.points + ' pts' : 'Attached as evidence';
  }

  /* ----- left pane ----- */
  const sec = (title, ...kids) => h('section', { class: 'wb-sec' }, h('h3', {}, title), ...kids);

  function briefTab(c, m, a) {
    const vc = S.vc, parts = [];
    const rv = a.revisions && a.revisions[a.revisions.length - 1];
    if (rv) parts.push(h('aside', { class: 'wb-notice', 'aria-label': 'Revised assignment' },
      h('p', { class: 'wb-notice-k' }, 'Revised on ' + S.fmtDate(rv.at.slice(0, 10))),
      h('p', {}, (rv.readings.length ? 'Updated to use: ' + rv.readings.join('; ') + '. ' : '') + (rv.note || '') + ' Points, grading criteria and any work you submitted are unchanged.'),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { if (S.ai.restoreRevision(a)) { toast('Earlier wording restored.'); commit(); } } }, 'Restore the earlier wording')));
    if (a.description || a.purpose) parts.push(sec('Overview', a.description ? h('p', { class: 'pre wb-lead' }, a.description) : null, a.purpose ? h('p', { class: 'pre' }, a.purpose) : null));
    if (a.basis === 'portfolio' && a.portfolioNote) parts.push(sec('The portfolio piece', h('p', { class: 'pre' }, a.portfolioNote),
      h('p', { class: 'small muted' }, 'Aim for something you could show a professor, employer, client, or collaborator. Finished pieces can be saved to this course’s Portfolio.')));
    if (a.capstone && S.capstoneUi) { const pr = S.capstoneUi.prep(c, m); if (pr) parts.push(sec('Recommended preparation', pr)); }
    else if (a.basis === 'readings' || a.basis === 'portfolio') {
      const rs = realReadings(m);
      parts.push(sec(a.basis === 'portfolio' ? 'Readings and key ideas to draw on' : 'Draw on this module’s readings',
        h('p', { class: 'small muted' }, a.basis === 'portfolio' ? 'Your work should draw on this module’s readings and key ideas. Name what you use.' : 'This assignment is graded on how well you understand the readings and key ideas of this module. Use them, and name what you draw on.'),
        rs.length ? h('ul', { class: 'plain' }, rs.map((x) => h('li', {}, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title) : x.title)))
          : h('p', { class: 'small' }, 'No readings have been added to this module yet. Add some in the ', h('a', { href: S.href(c, 'modules', m.id + '/learn') }, 'Reading Room'), '.')));
    }
    parts.push(sec('What to submit', h('p', { class: 'pre' }, (a.submit ? a.submit.replace(/\s*$/, '') + ' ' : '') + vc.FORMAT_SENTENCE[a.format || 'any']),
      a.due ? h('p', { class: 'small muted' }, 'Late work is accepted and marked late.') : null));
    return parts;
  }

  // The steps of the assignment: their own tab, between Materials and Rubric. Same content as before, moved out of the Brief.
  function stepsTab(c, m, a) {
    const out = [];
    if (a.parts.length) out.push(sec('Steps', h('ol', { class: 'wb-steps' }, a.parts.map((p, i) => h('li', {},
      h('span', { class: 'wb-stepno', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      h('div', {}, p.title ? h('h4', {}, p.title) : null, p.questions.length ? h('ul', { class: 'plain' }, p.questions.map((x) => h('li', {}, x))) : null))))));
    if (a.steps.length) out.push(sec('What to do', h('ol', { class: 'steps-list' }, a.steps.map((x) => h('li', {}, x)))));
    if (!out.length) out.push(empty('No steps have been written for this assignment. Use Edit to add your own.'));
    return out;
  }

  function materialsTab(c, m, a) {
    const rs = realReadings(m), out = [];
    if (a.realEvidence) {
      const src = (a.evidence && a.evidence.sources) || [];
      out.push(h('article', { class: 'wb-doc' },
        h('p', { class: 'wb-doc-k' }, 'Real evidence'),
        h('p', { class: 'wb-doc-note' }, 'This assignment is about authentic real-world material, so no scenario was invented for it.'),
        src.length ? h('div', { class: 'wb-doc-body' },
          h('p', {}, 'Work from these sources. Their links responded and the page title matched when the course was built. That does not mean anyone reviewed the content or that it says what the task assumes, so read them yourself.'),
          h('ul', { class: 'plain' }, src.map((x) => h('li', {}, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title) : x.title))))
          : h('div', { class: 'wb-doc-body' }, h('p', { role: 'status' }, h('b', {}, 'Source needed. '), 'No real source for this task could be verified, so none is supplied and nothing was made up. Find one yourself, add it to this module’s readings, or use “Find materials” in the Reading Room.'))));
    } else {
      // Evidence packet (Phase 2A): exhibits sit with the text materials. Older text-only assignments show exactly what they always did.
      // Presentation rule (Track B): context first, then the structured exhibits, then source notes. Record-shaped text that the exhibits
      // already contain is not shown a second time; it stays in the assignment and is available, collapsed, under "Original supplied text".
      const hasEx = (a.exhibits || []).length > 0;
      const split = a.materials ? S.exhibits.splitMaterials(a.materials, a.exhibits || []) : { parts: [], narrative: [], repeats: [] };
      const shown = hasEx ? split.narrative : split.parts;
      const proseBlock = (list, label, note) => h('article', { class: 'wb-doc' }, h('p', { class: 'wb-doc-k' }, label), note,
        h('div', { class: 'wb-doc-body' }, list.map((p) => h('p', {}, p.text))));
      const fictionNote = a.origin === 'ai' ? h('p', { class: 'wb-doc-note' }, h('b', {}, 'Fictional. '), 'Written by the AI for this assignment. The people, organizations, figures and sources in it are invented.') : null;
      const text = shown.length ? proseBlock(shown, hasEx ? 'The situation' : 'Supplied material', fictionNote) : null;
      const pan = S.exhibitsView ? S.exhibitsView.panel(c, m, a) : [];
      if (text) out.push(text);
      out.push(...pan);
      if (a.materials && hasEx && split.repeats.length) {
        out.push(h('details', { class: 'ex-orig' }, h('summary', {}, 'Original supplied text (kept, not shown twice)'),
          h('p', { class: 'small muted' }, split.repeats.length + (split.repeats.length === 1 ? ' block of the original text repeats' : ' blocks of the original text repeat') + ' data that the exhibits above already show, so it is collapsed here. Nothing was deleted; this is the text exactly as it was supplied.'),
          proseBlock(split.parts, 'Original supplied text', null)));
      }
      if (a.kind === 'demonstrate' && S.myData) out.push(S.myData.panel(c, m, a, 'assignment')); // optional, separate from the supplied exhibits (Phase 2D)
      if (!text && !pan.length) out.push(empty(a.basis === 'readings' || a.kind === 'learn' ? 'This assignment works from the module’s readings, listed below.' : 'No materials were supplied with this assignment. If it needs a case, document, or data, add it with Edit.'));
    }
    if (rs.length) out.push(sec('Module readings', h('ul', { class: 'plain' }, rs.map((x) => h('li', {}, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title) : x.title)))));
    return out;
  }

  function rubricTab(c, m, a) {
    if (a.rubric.length) return [
      h('p', { class: 'small muted' }, 'The AI reviews your work against these criteria, weighted as shown. You get detailed feedback first, then your final grade after you resubmit (or after ' + S.REVIEW_HOURS + ' hours).'),
      h('ul', { class: 'rubric' }, a.rubric.map((k) => h('li', {},
        h('span', { class: 'rb-name' }, k.name),
        h('span', { class: 'rb-pts' }, h('b', {}, String(k.max)), ' / ' + a.points + ' points'),
        h('span', { class: 'rb-bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.min(100, Math.round(k.max / (a.points || k.max || 1) * 100)) + '%' }))))),
      h('p', { class: 'wb-total' }, h('b', {}, String(a.points)), ' points in all'),
    ];
    if (a.criteria.length) return [
      h('p', { class: 'small muted' }, (a.points != null ? a.points + ' points. ' : '') + 'The AI reviews your work against these. You get detailed feedback first, then your final grade after you resubmit (or after ' + S.REVIEW_HOURS + ' hours).'),
      h('ul', { class: 'plain wb-criteria' }, a.criteria.map((x) => h('li', {}, x))),
    ];
    return [empty('No grading criteria have been written for this assignment.'), h('p', { class: 'small muted' }, 'Use Edit to add your own (one per line). AI feedback uses them, and if you leave them out the AI sets its own at the first review.')];
  }

  /* ----- right pane ----- */
  function submitTab(c, m, a, p) {
    const out = [];
    const draft = !a.work && S.hasDraft(a.id);
    out.push(h('div', { class: 'wb-status' }, h('span', { class: 'wb-status-k' }, 'Status'), h('b', {}, statusText(a)),
      draft ? h('span', { class: 'small muted' }, 'Your typed draft is saved on this device.') : null));
    out.push(p.submit);
    if (!(a.points > 0) && !a.work) out.push(h('div', { class: 'wb-manual' }, h('label', { class: 'checkline' },
      h('span', { class: 'check' }, h('input', { type: 'checkbox', checked: a.done, onchange: (e) => { a.done = e.target.checked; commit(); toast(a.done ? 'Marked completed.' : 'Marked not completed.'); } }), h('span', { class: 'box', 'aria-hidden': 'true' })),
      h('span', {}, 'Mark this assignment completed')), h('button', { class: 'linkbtn', type: 'button', onclick: () => { ui.edit = a.id; S.render(false); } }, 'Add points to turn on AI feedback')));
    if (a.work && a.work.final) out.push(S.portfolioToggle(a));
    return out;
  }

  function officeTab(c, m, a) {
    return a.points > 0 ? S.officePanel(c, m, a, true) : empty('Office hours are practice rounds for graded assignments. Add points to this assignment (Edit) to use them.');
  }

  /* ----- chrome ----- */
  function tabNav(c, a, list, current, label) {
    const links = [];
    const nav = h('nav', { class: 'wb-ptabs', 'aria-label': label }, h('ul', {}, list.map(([k, name]) => {
      const el = h('a', { href: tabHref(c, a, k), 'aria-current': k === current ? 'page' : null }, name);
      links.push(el); return h('li', {}, el);
    })));
    nav.addEventListener('keydown', (e) => {
      const i = links.indexOf(document.activeElement); if (i < 0) return;
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : null;
      if (to == null || !links[to]) return; e.preventDefault(); links[to].focus();
    });
    return nav;
  }

  function segmented(c, a, current, flags) {
    const mk = ([k, name]) => h('li', {}, h('a', { href: tabHref(c, a, k), 'aria-current': k === current ? 'page' : null, class: flags[k] ? 'has-dot' : null }, name, flags[k] ? h('i', { class: 'wb-dot', 'aria-label': flags[k] }) : null));
    return h('nav', { class: 'wb-seg', 'aria-label': 'Assignment views' }, h('ul', {}, REF.map(mk), WORK.map(mk)));
  }

  S.workbench = {
    page(c, m, a, tabIn) {
      const vc = S.vc, mi = c.modules.indexOf(m) + 1, st = S.STAGES.find((s) => s.key === S.stageOf(a));
      const p = S.workParts(c, m, a);
      const defaultTab = p.state === 'reviewed' || p.state === 'graded' ? 'feedback' : 'brief';
      const focus = REFK.includes(tabIn) || WORKK.includes(tabIn) ? tabIn : defaultTab;
      const rk = a.id + ':ref', wk = a.id + ':work';
      const refTab = REFK.includes(focus) ? focus : (wbState[rk] || 'brief');
      const workTab = WORKK.includes(focus) ? focus : (wbState[wk] || (p.state === 'reviewed' || p.state === 'graded' ? 'feedback' : 'submit'));
      wbState[rk] = refTab; wbState[wk] = workTab;
      const focusPane = REFK.includes(focus) ? 'ref' : 'work';
      const theme = c.designTheme;

      const isCap = a.capstone === true;
      const crumbs = isCap ? h('p', { class: 'crumbs wb-crumbs' }, h('a', { href: S.href(c, 'modules') }, '← Course capstone · Modules'), ' · ', h('a', { href: S.href(c, 'home') }, c.code))
        : h('p', { class: 'crumbs wb-crumbs' }, h('a', { href: S.href(c, 'modules', m.id + '/' + st.key) }, '← ' + m.title + ' · ' + st.room), ' · ', h('a', { href: S.href(c, 'home') }, c.code), ' · ', h('a', { href: S.href(c, 'assignments') }, 'All assignments'));
      if (ui.edit === a.id) return h('div', { class: 'course wb', 'data-theme': theme }, crumbs, h('div', { class: 'panel' }, h('h2', { class: 'mod-h' }, 'Edit assignment'), vc.assignmentForm(c, m, a)));

      const g = gaps(a), thin = !isCap && (g.length >= 3 || (!a.parts.length && !a.materials && !a.rubric.length));
      const canWrite = !isCap && a.points > 0 && !a.work && (!a.parts.length && !a.materials || a.kind === 'demonstrate' && a.parts.length && a.basis !== 'portfolio');
      const notice = thin ? h('aside', { class: 'wb-notice', 'aria-label': 'Missing details' },
        h('p', { class: 'wb-notice-k' }, a.origin === 'ai' ? 'Incomplete: the full page didn’t finish' : 'A short entry'),
        h('p', {}, a.origin === 'ai'
          ? 'The AI wrote this assignment’s title but its full page (' + g.join(', ') + ') didn’t finish during the course build. Nothing you have submitted is affected. Write it now with the button below, or add the details yourself.'
          : 'This assignment doesn’t have all its details yet: ' + g.join(', ') + '. Your progress and any work you have submitted are untouched. Add what you need yourself, or, if the assignment has points, ask the AI to write the full version.'),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => { ui.edit = a.id; S.render(false); } }, 'Add details yourself')),
        canWrite ? vc.writeBtn(c, m, a) : (a.points > 0 ? null : h('p', { class: 'small muted' }, 'The AI can write details only for assignments with points.'))) : (canWrite ? vc.writeBtn(c, m, a) : null);

      const refBody = { brief: briefTab, materials: materialsTab, steps: stepsTab, rubric: rubricTab }[refTab](c, m, a);
      const workBody = { submit: () => submitTab(c, m, a, p), feedback: () => p.feedback, office: () => officeTab(c, m, a) }[workTab]();
      const flags = { feedback: p.state === 'reviewed' ? 'Feedback ready' : p.state === 'graded' ? 'Graded' : '', submit: p.state === 'reviewed' ? 'Resubmit open' : '' };
      const pane = (id, label, tabs, body, cls) => h('section', { class: 'wb-pane wb-' + id + (focusPane === id ? ' is-focus' : '') + (cls || ''), 'aria-label': label },
        h('p', { class: 'wb-pane-k' }, label), tabs, h('div', { class: 'wb-body', id: 'wb-' + id + '-body' }, body));

      return h('div', { class: 'course wb', 'data-theme': theme, 'data-state': p.state },
        crumbs,
        h('header', { class: 'wb-head' },
          h('div', { class: 'wb-head-main' },
            h('p', { class: 'eyebrow' }, (a.kind ? S.kindMark(a.kind) : h('span', {}, 'Practice')), ' ', h('span', { class: 'wb-where' }, isCap ? 'Course capstone · counts ' + (c.capstone ? c.capstone.weight : 20) + '% of the course grade' : st.room + ' · Module ' + mi)),
            h('h2', { class: 'wb-title' }, a.title)),
          h('div', { class: 'wb-tools' }, isCap ? null : vc.editBtn(a.id, 'Edit assignment'))),
        h('div', { class: 'ameta wb-meta' },
          ...[['Due', a.due ? S.fmtDate(a.due) + (a.locked ? ' (course timeline)' : '') : 'No due date'], ['Points', a.points != null ? String(a.points) : 'Not graded'], ['Estimated time', a.estimate], ['Submitting', vc.FORMAT_SHORT[a.format] || 'Text or a file'], ['Status', statusText(a)]]
            .map(([k, v]) => v ? h('div', { class: 'ameta-i' }, h('span', { class: 'ameta-k' }, k), h('span', {}, v)) : null)),
        notice,
        segmented(c, a, focus, flags),
        h('div', { class: 'wb-grid' },
          pane('ref', 'Reference', tabNav(c, a, REF, refTab, 'Reference views'), refBody),
          pane('work', 'Your work', tabNav(c, a, WORK.map(([k, n]) => [k, n + (flags[k] ? ' •' : '')]), workTab, 'Your work views'), workBody, workTab === 'submit' ? ' is-sticky' : '')),
        isCap ? null : h('nav', { class: 'pager', 'aria-label': 'Assignment navigation' },
          (() => { const i = m.assignments.indexOf(a), pr = m.assignments[i - 1], nx = m.assignments[i + 1];
            return [pr ? h('a', { href: S.href(c, 'assignments', pr.id) }, '← ' + pr.title) : h('span', {}), nx ? h('a', { href: S.href(c, 'assignments', nx.id) }, nx.title + ' →') : h('span', {})]; })()));
    },
  };
})(window.Sovereign = window.Sovereign || {});
