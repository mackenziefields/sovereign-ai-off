/* sovereign. — "Build with AI" wizard, AI settings box, resource labels, usage summaries. */
(function (S) {
  'use strict';
  const { h, field, select, plural, toast, go } = S;
  const V = (S.views = S.views || {});
  const ui = S.ui;

  const LEVELS = [['beginner', 'Brand new to this'], ['some', 'I know a little'], ['advanced', 'Fairly experienced']];
  const GOALS = [
    ['understand', 'Understand it well'], ['skill', 'Build a practical skill'], ['project', 'Make something real with it'],
    ['career', 'Prepare for a job or career move'], ['credential', 'Prepare for a license or certification'], ['explore', 'Just explore'],
  ];
  const HOURS = [[2, '2 hours a week'], [4, '4 hours a week'], [6, '6 hours a week'], [10, '10 hours a week']];
  const WEEKS = [[4, '4 weeks'], [6, '6 weeks'], [8, '8 weeks'], [12, '12 weeks']];
  const opts = (list) => list.map(([v, l]) => [String(v), l]);

  /* ---------- resource labels (shown on each reading) ---------- */

  const VERIFY_TEXT = {
    reachable: ['Link responded', 'ok'], unreachable: ['Link not reachable', 'warn'], blocked: ['Site blocks checks', 'warn'],
    broken: ['Link broken', 'warn'], 'not-checked': ['Link not checked', ''],
  };

  // Result of "Check content": a program fetched the page text and an AI judged what kind of page it is. Neither is a human review.
  const CONTENT_TEXT = {
    matched: ['Content matched', 'ok', 'The page appears to contain this work. Checked by a program and an AI reading the start of the page; it is not a human review.'],
    about: ['About the work, not the work', 'warn', 'The page describes the work (a listing, abstract, review or summary) but does not appear to be the work itself.'],
    mismatch: ['Doesn’t match', 'warn', 'The page does not appear to be this work.'],
    unreadable: ['Couldn’t check content', 'soft', 'The page could not be read or judged. Nothing is claimed; look at it yourself.'],
  };
  S.CONTENT_TEXT = CONTENT_TEXT;

  // Returns the extra labels for a reading, or null for plain (user-made) readings.
  S.readingLabels = function (r) {
    if (r.source === 'placeholder') return h('div', { class: 'ai-meta' }, h('span', { class: 'badge warn' }, 'Source needed'), h('span', { class: 'small muted' }, 'No verifiable source was found. Edit this to add your own.'));
    if (r.source !== 'ai') return null;
    const v = r.verification || {}, vt = !r.url ? ['Citation only: no link found', 'warn'] : (VERIFY_TEXT[v.status] || VERIFY_TEXT['not-checked']);
    const cc = r.contentCheck && r.url ? CONTENT_TEXT[r.contentCheck.status] : null;
    const tags = [
      h('span', { class: 'badge ' + vt[1], title: v.detail || '' }, vt[0]),
      cc ? h('span', { class: 'badge ' + cc[1], title: cc[2] + (r.contentCheck.detail ? ' ' + r.contentCheck.detail : '') }, cc[0]) : null,
      v.status === 'reachable' && v.titleMatch === true ? h('span', { class: 'badge', title: 'The page’s title resembles the expected title. This does not confirm the content.' }, 'Title matches') : null,
      v.status === 'reachable' && v.titleMatch === false ? h('span', { class: 'badge warn', title: 'The page’s title is different from what the search result said.' }, 'Title differs') : null,
      r.sourceType && r.sourceType !== 'web' ? h('span', { class: 'badge ok', title: 'Type of website, from its address' }, S.label(S.SOURCE_TYPES, r.sourceType)) : null,
      r.kind ? h('span', { class: 'badge' }, S.label(S.READING_KINDS, r.kind)) : null,
      r.access && r.access !== 'unknown' ? h('span', { class: 'badge' }, r.access === 'free' ? 'Free' : 'Paid') : null,
      h('span', { class: 'badge soft' }, 'AI-suggested'),
    ].filter(Boolean);
    return h('div', { class: 'ai-meta' }, tags,
      r.creator ? h('div', { class: 'small muted ai-line' }, 'By ' + r.creator) : null,
      r.derivedFrom ? h('div', { class: 'small ai-line' }, 'Derived from: ', r.derivedUrl ? h('a', { href: r.derivedUrl, target: '_blank', rel: 'noopener noreferrer' }, r.derivedFrom) : r.derivedFrom, '. Taken from that course’s reading list by AI.') : null,
      r.relevance ? h('div', { class: 'small ai-line' }, h('b', {}, 'Why it fits (AI’s opinion): '), r.relevance) : null,
      v.pageTitle ? h('div', { class: 'small muted ai-line' }, 'Page title: ' + v.pageTitle) : null,
      v.detail ? h('div', { class: 'small muted ai-line' }, v.detail) : null,
      cc && r.contentCheck.detail ? h('div', { class: 'small ai-line' }, h('b', {}, 'Content check: '), r.contentCheck.detail, ' (' + r.contentCheck.checkedAt.slice(0, 10) + ')') : null,
      v.checkedAt && r.url ? h('div', { class: 'small muted ai-line' }, 'Checked by a program on ' + v.checkedAt.slice(0, 10) + '. A working link does not guarantee it covers this topic well; please look it over.') : null);
  };

  S.syllabusLabels = function (y) {
    const v = y.verification || {}, vt = VERIFY_TEXT[v.status] || VERIFY_TEXT['not-checked'];
    return h('div', { class: 'ai-meta' },
      y.sourceType && y.sourceType !== 'web' ? h('span', { class: 'badge ok' }, S.label(S.SOURCE_TYPES, y.sourceType)) : null,
      h('span', { class: 'badge ' + vt[1], title: v.detail || '' }, vt[0]),
      h('span', { class: 'badge soft' }, y.source === 'ai' ? 'Found by AI' : 'Added by you'),
      y.note ? h('div', { class: 'small muted ai-line' }, y.note) : null,
      v.checkedAt ? h('div', { class: 'small muted ai-line' }, 'Link checked by a program on ' + v.checkedAt.slice(0, 10) + '.') : null);
  };

  /* ---------- usage summary ---------- */

  S.usageBlock = function (c) {
    if (!c.ai || !c.ai.generated) return null;
    const t = S.ai.totals(c), b = c.ai.brief;
    return h('details', { class: 'ai-usage' },
      h('summary', {}, 'How this course was built'),
      h('p', { class: 'small' }, 'Drafted by AI on ' + (c.ai.createdAt || '').slice(0, 10) + ' from: “' + b.topic + '”, ' + (S.label(LEVELS, b.level) || b.level).toLowerCase() + ', goal: ' + (S.label(GOALS, b.goal) || b.goal).toLowerCase() + '.'),
      h('p', { class: 'small muted' }, t.calls + ' AI calls · ' + t.inTok.toLocaleString() + ' tokens in · ' + t.outTok.toLocaleString() + ' tokens out · ' + t.searches + ' web searches · estimated cost ' + S.ai.money(t.cost) + '. Estimates use the prices configured on the AI service, not your bill.'),
      h('p', { class: 'small muted' }, 'Naming a school, publisher, or person as a source does not mean they are affiliated with or endorse Sovereign. Source types come from each link’s web address.'),
      c.ai.usage.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grades' },
        h('thead', {}, h('tr', {}, ['Step', 'Model', 'In', 'Out', 'Searches', 'Est. cost'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, c.ai.usage.map((u) => h('tr', {}, h('td', {}, u.step), h('td', {}, u.model), h('td', {}, String(u.inTok)), h('td', {}, String(u.outTok)), h('td', {}, String(u.searches)), h('td', {}, S.ai.money(u.cost))))))) : null);
  };

  /* ---------- AI settings box (address + access code; stays in this browser) ---------- */

  S.aiSettingsBox = function (open) {
    const s = S.ai.settings();
    const msg = h('p', { class: 'small', role: 'status' });
    const urlIn = h('input', { type: 'url', name: 'aiurl', value: s.url, placeholder: 'https://your-worker.workers.dev', autocomplete: 'off' });
    const codeIn = h('input', { type: 'password', name: 'aicode', value: s.code, autocomplete: 'off', 'aria-label': 'Access code' });
    const save = () => {
      const u = S.ai.cleanBase(urlIn.value);
      if (u === null) { msg.textContent = 'That address doesn’t look right. It should start with https://'; return false; }
      S.ai.saveSettings({ url: u || '', code: codeIn.value.trim() });
      return true;
    };
    return h('details', { class: 'add ai-settings', open: open || !S.ai.ready() },
      h('summary', {}, 'AI settings'),
      h('div', { class: 'panel' },
        h('p', { class: 'small muted' }, 'The AI features run through a private service set up by the app owner. Enter its address and your access code once. They are kept only in this browser, and are not included in backups or exports.'),
        h('label', { class: 'field' }, h('span', {}, 'Service address'), urlIn, h('small', {}, S.config.aiUrl ? 'Already set by the app. Leave blank to use it.' : 'Looks like https://something.workers.dev')),
        h('label', { class: 'field' }, h('span', {}, 'Access code'), codeIn),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { if (save()) { msg.textContent = 'Saved in this browser.'; } } }, 'Save'),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
            if (!save()) return;
            msg.textContent = 'Checking…';
            try {
              const r = await S.ai.health();
              msg.textContent = r.configured ? 'Connected. The service is set up (models: ' + r.models.outline + ' and ' + r.models.light + '; up to ' + r.maxModules + ' modules per course). This does not test your access code.' : 'Connected, but the service says it is not fully configured yet.';
            } catch (e) { msg.textContent = e.message; }
          } }, 'Test connection'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { S.ai.saveSettings({ code: '' }); codeIn.value = ''; msg.textContent = 'Access code removed from this browser.'; } }, 'Forget my access code')),
        msg));
  };

  /* ---------- the wizard ---------- */

  const run = () => ui.ai || (ui.ai = { phase: 'form' });

  function readForm(form) {
    const f = new FormData(form);
    const n = (k, d) => parseInt(f.get(k), 10) || d;
    if (f.has('name')) { const nm = String(f.get('name') || '').trim().slice(0, 60); if (nm) { S.state.name = nm; S.save(); } } // stays in this browser; not part of the request
    return {
      topic: String(f.get('topic') || '').trim(), level: f.get('level') || 'beginner', goal: f.get('goal') || 'understand',
      goalText: String(f.get('goalText') || '').trim(), hours: n('hours', 4), weeks: n('weeks', 6), extra: String(f.get('extra') || '').trim(), startDate: S.validDate(String(f.get('startDate') || '')) || S.todayISO(),
    };
  }

  function needService(form) {
    const s = S.ai.settings();
    const u = form && form.elements.aiurl ? S.ai.cleanBase(form.elements.aiurl.value) : s.url;
    const code = form && form.elements.aicode ? form.elements.aicode.value.trim() : s.code;
    if (u === null) return 'The service address doesn’t look right. It should start with https://';
    S.ai.saveSettings({ url: u || '', code });
    const t = S.ai.settings();
    if (!t.url) return 'The AI service address isn’t set yet. Open AI settings below and paste it in.';
    if (!t.code) return 'Enter your access code under AI settings below.';
    return '';
  }

  function startBuild(brief) {
    const r = run();
    r.ctl = new AbortController();
    r.brief = brief;
    S.ai.build(brief, r).then((course) => {
      if (course.ai.status === 'partial') { toast('Your course was saved, but some parts are incomplete. See the note on this page.'); S.render(false); return; } // stay here so the problem is read
      toast('Your course is ready.');
      if ((location.hash || '') === '#/new-ai') { ui.ai = null; go(S.href(course)); } else S.render(false);
    }).catch((e) => {
      r.phase = 'error'; r.msg = e.code === 'cancelled' ? 'Cancelled.' : e.message;
      if (r.courseId) { const c = S.course(r.courseId); if (c && c.ai) { c.ai.status = 'partial'; c.ai.note = 'The AI stopped before finishing: ' + r.msg; S.save(); } }
      S.render(false);
    });
  }

  function formView(r) {
    const b = r.brief || {};
    const form = h('form', { class: 'panel ai-form', onsubmit: (e) => {
      e.preventDefault();
      const brief = readForm(e.target);
      if (!brief.topic) { r.msg = 'Tell me what you’d like to learn.'; return S.render(false); }
      const problem = needService(e.target);
      if (problem) { r.brief = brief; r.msg = problem; return S.render(false); }
      r.msg = ''; startBuild(brief);
    } },
      r.msg ? h('p', { class: 'banner error', role: 'alert' }, r.msg) : null,
      h('label', { class: 'field big' }, h('span', {}, 'What would you like to learn?'),
        h('input', { type: 'text', name: 'topic', value: b.topic || '', required: true, maxlength: '200', placeholder: 'e.g. Entrepreneurship, contract law, watercolor, Spanish for travel', autocomplete: 'off' })),
      h('fieldset', { class: 'radios' }, h('legend', {}, 'Where are you starting?'),
        LEVELS.map(([v, l]) => h('label', {}, h('input', { type: 'radio', name: 'level', value: v, checked: (b.level || 'beginner') === v }), h('span', {}, l)))),
      h('div', {}, select('What do you want out of it?', 'goal', GOALS, b.goal || 'understand'),
        field('Which one? (only if you chose a license or certification)', 'goalText', { value: b.goalText || '', placeholder: 'e.g. the bar exam, a project-management certificate' })),
      h('div', { class: 'two' }, select('Time you can give it', 'hours', opts(HOURS), String(b.hours || 4)), select('Over about', 'weeks', opts(WEEKS), String(b.weeks || 6))),
      h('label', { class: 'field' }, h('span', {}, 'Start date'), h('input', { type: 'date', name: 'startDate', value: b.startDate || S.todayISO() }), h('small', {}, 'Assignment due dates are set from this date and the number of weeks, and then stay fixed.')),
      h('label', { class: 'field' }, h('span', {}, 'Anything else I should know? (optional)'),
        h('textarea', { name: 'extra', rows: 3, maxlength: '600', placeholder: 'e.g. I want to start a small online shop. I learn best by doing.' }, b.extra || '')),
      S.state.name ? null : h('label', { class: 'field' }, h('span', {}, 'What should we call you? (optional)'), h('input', { type: 'text', name: 'name', maxlength: '60', autocomplete: 'given-name' }), h('small', {}, 'Used only to greet you. Stays in this browser and is never sent to the AI.')),
      h('p', { class: 'small muted' }, 'Only what you type on this page is sent to the AI service. Nothing else from your device is uploaded, and no documents are used.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'submit' }, 'Build my course'),
        h('button', { class: 'btn ghost', type: 'button', onclick: async (e) => {
          const fm = e.target.form, brief = readForm(fm);
          if (!brief.topic) { r.msg = 'Tell me what you’d like to learn first.'; return S.render(false); }
          const problem = needService(fm);
          if (problem) { r.brief = brief; r.msg = problem; return S.render(false); }
          r.brief = brief; r.msg = ''; r.phase = 'asking'; r.ctl = new AbortController(); S.render(false);
          try { r.questions = await S.ai.clarify(brief, r.ctl.signal); r.answers = {}; r.phase = r.questions.length ? 'clarify' : 'form'; if (!r.questions.length) startBuild(brief); }
          catch (err) { r.phase = 'form'; r.msg = err.code === 'cancelled' ? '' : err.message; }
          S.render(false);
        } }, 'Ask me a couple of questions first')),
      S.aiSettingsBox(!!r.msg && !S.ai.ready()));
    return form;
  }

  function clarifyView(r) {
    return h('form', { class: 'panel ai-form', onsubmit: (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const answers = r.questions.map((q) => ({ q: q.text, a: String(f.get(q.id) || '').trim() })).filter((x) => x.a);
      startBuild({ ...r.brief, answers });
    } },
      h('p', { class: 'lede' }, 'Two quick questions (both optional).'),
      r.questions.map((q) => h('fieldset', { class: 'radios' }, h('legend', {}, q.text),
        (q.choices || []).map((c) => h('label', {}, h('input', { type: 'radio', name: q.id, value: c }), h('span', {}, c))),
        field('Or in your own words', q.id, { value: '' }))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'submit' }, 'Build my course'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => startBuild(r.brief) }, 'Skip and build')));
  }

  const STEP_MARK = { done: '✓', active: '…', todo: '○', warn: '!', fail: '✕', skipped: '–' };
  const STEP_WORD = { done: 'done', active: 'working', todo: 'waiting', warn: 'no verified source found', fail: 'failed', skipped: 'skipped' };

  function runningView(r) {
    return h('div', { class: 'panel' },
      h('p', { class: 'lede' }, r.phase === 'asking' ? 'Thinking of a couple of questions…' : 'Building your course. This usually takes a few minutes. You can leave this page open and keep reading elsewhere in the app.'),
      r.steps ? h('ol', { class: 'steps', 'aria-live': 'polite' }, r.steps.map((s) => h('li', { class: s.state }, h('span', { class: 'mark', 'aria-hidden': 'true' }, STEP_MARK[s.state]), h('span', {}, s.label), h('span', { class: 'sr' }, ' (' + STEP_WORD[s.state] + ')')))) : null,
      h('p', { class: 'small muted' }, 'Your outline is saved to your dashboard as soon as it’s ready; materials are added after.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => r.ctl && r.ctl.abort() }, 'Cancel')));
  }

  function errorView(r) {
    const saved = r.courseId && S.course(r.courseId);
    return h('div', { class: 'panel' },
      h('p', { class: 'banner error', role: 'alert' }, r.msg || 'Something went wrong.'),
      saved ? h('p', {}, 'Your course outline was saved before this happened. ', h('a', { href: S.href(saved) }, 'Open “' + saved.title + '”'), ', then use “Find materials with AI” on a module to try again.') : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { r.phase = 'form'; r.msg = ''; S.render(false); } }, 'Back to the form'),
        h('a', { class: 'btn ghost', href: '#/' }, 'Build a course manually instead')));
  }

  function doneView(r) {
    const c = r.courseId && S.course(r.courseId);
    return h('div', { class: 'panel' },
      h('p', { class: 'lede' }, c ? '“' + c.title + '” ' + (r.problem ? 'was saved.' : 'is ready.') : 'Done.'),
      r.problem ? h('p', { class: 'banner' }, r.problem) : null,
      c ? h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: S.href(c), onclick: () => { ui.ai = null; } }, 'Open the course')) : null);
  }

  V.newAI = function () {
    const r = run();
    const body = { running: runningView, asking: runningView, error: errorView, done: doneView, clarify: clarifyView }[r.phase] || formView;
    return h('div', { class: 'narrow' },
      h('p', { class: 'crumbs' }, h('a', { href: '#/' }, '← Dashboard')),
      h('p', { class: 'eyebrow' }, 'Build with AI'),
      h('h1', {}, 'Let’s build your course'),
      h('p', { class: 'lede muted' }, 'Answer a few plain questions. You’ll get a complete first draft you can edit, reorder, and make your own.'),
      body(r));
  };

  /* ---------- "New course" chooser on the Dashboard ---------- */

  S.newCourseChooser = function () {
    return h('div', { class: 'panel' },
      h('h3', {}, 'How would you like to start?'),
      h('div', { class: 'choices two-up' },
        h('div', { class: 'choice' }, h('h2', {}, 'Build with AI'), h('p', {}, 'Tell it what you want to learn. It drafts a full course: syllabus, modules, assignments, and a final project, with suggested materials you can check.'),
          h('a', { class: 'btn', href: '#/new-ai', onclick: () => { ui.ai = null; } }, 'Build with AI')),
        h('div', { class: 'choice' }, h('h2', {}, 'Build manually'), h('p', {}, 'Create an empty course and fill it in yourself. Works without any AI service.'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { ui.edit = 'newCourseForm'; S.render(false); } }, 'Build manually'))),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { ui.edit = null; S.render(false); } }, 'Cancel'));
  };

  /* ---------- Data & Backup: AI section ---------- */

  S.aiDataSection = function () {
    const rows = S.state.courses.filter((c) => c.ai && c.ai.generated).map((c) => ({ c, t: S.ai.totals(c) }));
    const sum = rows.reduce((a, x) => ({ calls: a.calls + x.t.calls, inTok: a.inTok + x.t.inTok, outTok: a.outTok + x.t.outTok, searches: a.searches + x.t.searches, cost: a.cost + x.t.cost }), { calls: 0, inTok: 0, outTok: 0, searches: 0, cost: 0 });
    return h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'AI')),
      h('p', { class: 'muted small' }, 'AI features are optional and need a private service set up by the app owner. Courses you build manually never use it.'),
      S.aiSettingsBox(false),
      rows.length
        ? h('div', {}, h('h3', { class: 'minor' }, 'Usage recorded by this app'),
            h('p', { class: 'small muted' }, plural(rows.length, 'AI course') + ' · ' + sum.calls + ' calls · ' + sum.inTok.toLocaleString() + ' tokens in · ' + sum.outTok.toLocaleString() + ' out · ' + sum.searches + ' searches · estimated ' + S.ai.money(sum.cost) + '. Estimates use prices configured on the service, so check your Anthropic Console for the real figure.'),
            h('ul', { class: 'items' }, rows.map(({ c, t }) => h('li', { class: 'item' }, h('div', { class: 'item-body' },
              h('div', { class: 'item-title' }, h('a', { href: S.href(c, 'syllabus') }, c.title)),
              h('div', { class: 'item-note' }, t.calls + ' calls · ' + t.inTok.toLocaleString() + ' in · ' + t.outTok.toLocaleString() + ' out · ' + t.searches + ' searches · ' + S.ai.money(t.cost)))))))
        : null);
  };
})(window.Sovereign = window.Sovereign || {});
