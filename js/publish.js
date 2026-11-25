/* sovereign. — the publication engine (Phase 4). Builds a separately designed, paginated document from the saved course data and hands it to the
   browser's own "Save as PDF". Nothing is sent anywhere and nothing is changed. The document is NOT the app page: it has its own layout (css/publish.css).
   A document builder returns { title, kicker, deck, doc, nodes[] } where nodes are DOM nodes for the body. S.publish.open(kind, course) shows the options + preview. */
(function (S) {
  'use strict';
  const { h } = S;
  const THEME_NAME = { modernist: 'The Modernist', editorial: 'The Editorial', intellectual: 'The Intellectual', institution: 'The Institution' };
  const SIZES = { letter: { label: 'US Letter', w: '8.5in', h: '11in', css: 'Letter' }, a4: { label: 'A4', w: '210mm', h: '297mm', css: 'A4' } };
  const PREF = 'sovereign.aioff.pubSize';
  const getSize = () => { try { const v = localStorage.getItem(PREF); return SIZES[v] ? v : 'letter'; } catch (e) { return 'letter'; } };
  const setSize = (v) => { try { localStorage.setItem(PREF, v); } catch (e) { /* the choice just is not remembered */ } };
  const STAGE = { learn: 'Learn', apply: 'Apply', demonstrate: 'Demonstrate' };
  const todayText = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const sec = (no, title, ...kids) => h('section', { class: 'pub-sec' }, h('div', { class: 'pub-sec-head' }, h('span', { class: 'no' }, no), h('h2', {}, title)), ...kids);
  const link = (text, url) => (safeUrl(url) ? h('a', { href: url }, text) : h('span', {}, text));
  const dateRange = (a, b) => (a ? S.fmtDate(a) + (b && b !== a ? ' to ' + S.fmtDate(b) : '') : '');

  /* ---------------- the document frame ---------------- */
  function frameHtml(doc, c, sizeKey) {
    const sz = SIZES[sizeKey] || SIZES.letter;
    const css = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'css/publish.css'; // absolute, and NO <base>: a <base> would turn "#section" links into external links in the PDF
    const foot = (c.code ? c.code + ' · ' : '') + c.title + ' · ' + doc.doc;
    const cover = h('section', { class: 'pub-cover' },
      h('div', { class: 'kicker' }, h('span', {}, doc.kicker || 'sovereign.'), h('span', {}, c.code || '')),
      h('div', {}, h('span', { class: 'doc' }, doc.doc), h('h1', {}, doc.title || c.title), doc.deck ? h('p', { class: 'deck' }, doc.deck) : null),
      h('div', { class: 'foot' },
        doc.byline ? h('div', {}, h('b', {}, doc.bylineLabel || 'Learner'), doc.byline) : null,
        h('div', {}, h('b', {}, 'Prepared'), todayText()),
        h('div', {}, h('b', {}, 'Design'), THEME_NAME[c.designTheme] || 'Sovereign'),
        h('div', {}, h('b', {}, 'Format'), sz.label)));
    const body = h('main', { class: 'pub-body' }, ...doc.nodes, h('div', { class: 'colophon' },
      h('span', { class: 'mark' }, 'sovereign.'), h('p', {}, 'Learn. Apply. Demonstrate. This document was generated on your device from your own course record' + (doc.colophon ? '. ' + doc.colophon : '.') + ' It is not an official transcript or a credential from any institution.')));
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[<>&]/g, (ch) => '\\' + ch.charCodeAt(0).toString(16) + ' ').replace(/[ \r\n]+/g, ' '); // a CSS string: a title can never close the <style> block
    const th = c.designTheme, sans = '"Segoe UI", Arial, sans-serif', serif = 'Georgia, "Times New Roman", serif';
    // Each design has its own running footer (all 8pt or larger, contrast above 4.5:1): where the title sits and how the page number looks.
    const feet = {
      modernist: ['@bottom-left { content: "' + esc(foot) + '"; font: 8pt ' + sans + '; color: #4a5260; letter-spacing: .04em; } ', '@bottom-right { content: counter(page); font: 800 9pt ' + sans + '; color: #101b32; } '],
      editorial: ['@bottom-left { content: "' + esc(foot) + '"; font: italic 8.5pt ' + serif + '; color: #681632; } ', '@bottom-right { content: "\\2014  " counter(page) "  \\2014"; font: italic 9pt ' + serif + '; color: #681632; } '],
      intellectual: ['@bottom-left { content: counter(page); font: 700 9pt ' + sans + '; color: #2643d8; } ', '@bottom-right { content: "' + esc(foot) + '"; font: italic 8.5pt ' + serif + '; color: #4a5260; } '],
      institution: ['@bottom-left { content: "' + esc(foot) + '"; font: 8pt ' + serif + '; color: #3f4a52; letter-spacing: .06em; } ', '@bottom-right { content: "\\25C6  " counter(page) "  \\25C6"; font: 600 9pt ' + serif + '; color: #073e35; letter-spacing: .1em; } '],
    }[th] || [];
    const style = '@page { size: ' + sz.css + '; margin: .8in .85in .85in; ' + feet.join('') + '} ' +
      '@page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } } ' +
      ':root { --pw: ' + sz.w + '; --ph: calc(' + sz.h + ' - .02in); }';
    return '<!doctype html><html lang="en" data-theme="' + String(c.designTheme).replace(/[^a-z]/g, '') + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + String(c.title + ' — ' + doc.doc).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>' +
      '<link rel="stylesheet" href="' + css + '"><style>' + style + '</style></head><body data-theme="' + String(c.designTheme).replace(/[^a-z]/g, '') + '"><div class="pub-doc">' + cover.outerHTML + body.outerHTML + '</div></body></html>';
  }
  const blockedHtml = (items) => '<!doctype html><meta charset="utf-8"><body style="font:15px/1.5 system-ui;margin:24px;color:#222"><h2 style="margin:0 0 8px">This document was not made</h2><p>Some saved numbers do not agree with each other, so Sovereign will not publish a document that could contradict itself. Nothing in your course was changed.</p><ul>' +
    items.map((d) => '<li><b>' + String(d.assignment).replace(/</g, '&lt;') + '</b>' + (d.module ? ' (' + String(d.module).replace(/</g, '&lt;') + ')' : '') + ': ' + String(d.message).replace(/</g, '&lt;') + '</li>').join('') + '</ul></body>';

  /* ---------------- options + preview dialog ---------------- */
  S.publish = {
    builders: {},
    // kind: 'syllabus' | 'publication' | 'feedback'; ctx: builder-specific (feedback: { assignmentId })
    open(kind, c, ctx) {
      const b = S.publish.builders[kind];
      if (!b) return;
      const prev = document.getElementById('pub-dialog'); if (prev) prev.remove();
      const o = b.init ? b.init(c, ctx || {}) : {};
      o.size = SIZES[o.size] ? o.size : getSize();
      o.theme = S.THEMES.some((x) => x[0] === o.theme) ? o.theme : c.designTheme;
      const frame = h('iframe', { class: 'pub-frame', title: 'Document preview', 'aria-label': 'Preview of the document to be saved as a PDF' });
      const stage = h('div', { class: 'pub-stage' }, frame);
      const fit = () => { const sw = stage.clientWidth, sh = stage.clientHeight, W = 900; if (!sw || sw >= W) { frame.style.cssText = ''; return; } const k = sw / W; frame.style.cssText = 'width:' + W + 'px;height:' + Math.ceil(sh / k) + 'px;transform:scale(' + k + ');transform-origin:0 0'; };
      const status = h('p', { class: 'small muted', role: 'status' }, '');
      const printBtn = h('button', { class: 'btn primary', type: 'button' }, 'Save as PDF');
      let blocked = false, timer = null, pending = false;
      const render = () => {
        pending = false;
        const cc = Object.assign({}, c, { designTheme: o.theme });
        const out = b.build(c, o, ctx || {});
        blocked = !!out.blocked || !!out.empty;
        printBtn.disabled = blocked;
        if (out.blocked) frame.srcdoc = blockedHtml(out.blocked);
        else if (out.empty) frame.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font:15px/1.5 system-ui;margin:24px;color:#222"><p>' + String(out.empty).replace(/</g, '&lt;') + '</p></body>';
        else frame.srcdoc = frameHtml(out, cc, o.size);
        status.textContent = out.blocked ? 'Not made: some saved numbers disagree (see the preview).' : out.empty ? '' : '';
      };
      const later = () => { pending = true; clearTimeout(timer); timer = setTimeout(render, 400); };
      const changed = (immediate) => { if (b.persist) b.persist(c, o); if (immediate) render(); else later(); };
      const sizeSel = h('select', { id: 'pub-size', onchange: (e) => { o.size = e.target.value; setSize(o.size); changed(true); } }, Object.keys(SIZES).map((k) => h('option', { value: k, selected: k === o.size ? 'selected' : null }, SIZES[k].label)));
      const themeSel = h('select', { id: 'pub-theme', onchange: (e) => { o.theme = e.target.value; render(); } }, S.THEMES.map((x) => h('option', { value: x[0], selected: x[0] === o.theme ? 'selected' : null }, THEME_NAME[x[0]] || x[1])));
      const close = () => { clearTimeout(timer); dlg.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      printBtn.addEventListener('click', () => {
        if (pending) { clearTimeout(timer); render(); }
        const w = frame.contentWindow; if (!w || blocked) return;
        status.textContent = 'Opening your print dialog…';
        const go = () => { try { w.focus(); w.print(); status.textContent = 'In the print dialog, choose “Save as PDF” as the destination.'; } catch (e) { status.textContent = 'Your browser blocked printing from here. Try again, or use the browser menu: Print.'; } };
        (w.document.fonts && w.document.fonts.ready ? w.document.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 200));
      });
      const dlg = h('div', { id: 'pub-dialog', class: 'pub-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Save ' + b.name + ' as PDF' },
        h('div', { class: 'pub-panel' },
          h('div', { class: 'pub-side' },
            h('p', { class: 'eyebrow' }, 'Save as PDF'),
            h('h2', {}, b.name),
            h('p', { class: 'small' }, b.intro),
            b.options ? b.options(c, o, changed, ctx || {}) : null,
            h('div', { class: 'field' }, h('label', { for: 'pub-size' }, 'Page size'), sizeSel),
            h('div', { class: 'field' }, h('label', { for: 'pub-theme' }, 'Design (this course’s theme; changing it affects this export only)'), themeSel),
            h('ol', { class: 'pub-steps small' },
              h('li', {}, 'Check the preview on the right.'),
              h('li', {}, 'Choose “Save as PDF”. Your browser’s print window opens.'),
              h('li', {}, 'Pick “Save as PDF” as the destination and turn off “Headers and footers”.')),
            h('p', { class: 'small muted' }, 'Made on this device. Nothing is uploaded and your work, grades and feedback are never changed.'),
            h('div', { class: 'row' }, printBtn, h('button', { class: 'btn', type: 'button', onclick: close }, 'Close')),
            status),
          stage));
      document.body.appendChild(dlg);
      if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); // on a narrow window the page is shrunk to fit, never cut off
      fit();
      document.addEventListener('keydown', onKey);
      render();
      sizeSel.focus();
    },
    // the finished HTML for a document, without the dialog (tests, and a future one-click download)
    html(kind, c, sizeKey, opts, ctx) {
      const b = S.publish.builders[kind], o = Object.assign(b.init ? b.init(c, ctx || {}) : {}, opts || {});
      const out = b.build(c, o, ctx || {});
      return out.blocked || out.empty ? null : frameHtml(out, c, sizeKey || o.size || getSize());
    },
    helpers: { sec, link, dateRange, safeUrl, STAGE, THEME_NAME, getSize, setSize, todayText },
  };

  /* ---------------- the Syllabus ---------------- */
  function buildSyllabus(c) {
    const cap = S.capstoneOf ? S.capstoneOf(c) : null;
    const capRec = cap ? c.capstone : null;
    const mods = c.modules;
    let count = 0, points = 0;
    mods.forEach((m) => m.assignments.forEach((a) => { count++; points += a.points > 0 ? a.points : 0; }));
    const w = capRec ? (capRec.weight > 0 ? capRec.weight : 20) : 0;
    const nodes = [];
    let no = 0; const n = () => String(++no).padStart(2, '0');

    // Overview
    const ov = [];
    if (c.description) ov.push(h('p', { class: 'lede pre' }, c.description));
    ov.push(h('dl', { class: 'facts' },
      [['Length', c.duration || '—'], ['Modules', String(mods.length)], ['Assignments', String(count + (cap ? 1 : 0))], ['Points', String(points + (cap && cap.points > 0 ? cap.points : 0))]]
        .map((x) => h('div', {}, h('dt', {}, x[0]), h('dd', {}, x[1])))));
    if (c.objective) { ov.push(h('span', { class: 'k' }, 'Course objective')); ov.push(h('p', {}, c.objective)); }
    if (c.outcomes.length) { ov.push(h('span', { class: 'k' }, 'What you will be able to do')); ov.push(h('ol', {}, c.outcomes.map((x) => h('li', {}, x)))); }
    if (c.pathway) { ov.push(h('span', { class: 'k' }, 'Where this leads')); ov.push(h('p', {}, c.pathway)); }
    if (c.deliverable) { ov.push(h('span', { class: 'k' }, 'Final deliverable')); ov.push(h('p', {}, c.deliverable)); }
    if (c.licensureNote) ov.push(h('div', { class: 'callout' }, h('b', {}, 'About licenses and credentials. '), c.licensureNote));
    nodes.push(sec(n(), 'Overview', ...ov));

    // Modules
    if (mods.length) {
      nodes.push(sec(n(), 'Modules', ...mods.map((m, i) => {
        const dues = m.assignments.map((a) => a.due).filter(Boolean).sort();
        const meta = [m.duration, dateRange(dues[0], dues[dues.length - 1]) ? 'Due ' + dateRange(dues[0], dues[dues.length - 1]) : ''].filter(Boolean).join(' · ');
        const body = [];
        if (m.overview) body.push(h('p', { class: 'pre' }, m.overview));
        if (m.objectives.length) { body.push(h('span', { class: 'k' }, 'Objectives')); body.push(h('ul', { class: 'plain' }, m.objectives.map((x) => h('li', {}, x)))); }
        if (m.readings.length) {
          body.push(h('span', { class: 'k' }, 'Learning materials'));
          body.push(h('ul', {}, m.readings.map((r) => h('li', {}, link(r.title, r.url), r.creator ? h('span', { class: 'muted' }, ' — ' + r.creator) : null, r.note ? h('span', { class: 'muted' }, '. ' + r.note) : null))));
        }
        if (m.assignments.length) {
          body.push(h('span', { class: 'k' }, 'Assignments'));
          body.push(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Assignment'), h('th', {}, 'Stage'), h('th', {}, 'Due'), h('th', { class: 'n' }, 'Points'))),
            h('tbody', {}, m.assignments.map((a) => h('tr', {}, h('td', {}, a.title), h('td', {}, STAGE[S.stageOf(a)] || ''), h('td', {}, a.due ? S.fmtDate(a.due) : '—'), h('td', { class: 'n' }, a.points > 0 ? String(a.points) : '—'))))));
        }
        return h('div', { class: 'mod' }, h('div', { class: 'mod-head' }, h('span', { class: 'no' }, String(i + 1).padStart(2, '0')), h('span', { class: 't' }, m.title), meta ? h('span', { class: 'm' }, meta) : null), h('div', { class: 'mod-body' }, ...body));
      })));
    }

    // Schedule
    const rows = [];
    mods.forEach((m, i) => m.assignments.forEach((a) => rows.push({ due: a.due || '', mod: String(i + 1).padStart(2, '0') + ' ' + m.title, a, cap: false })));
    if (cap) rows.push({ due: cap.due || '', mod: 'Capstone', a: cap, cap: true });
    if (rows.length) {
      rows.sort((x, y) => (x.due && y.due ? (x.due < y.due ? -1 : x.due > y.due ? 1 : 0) : x.due ? -1 : y.due ? 1 : 0));
      nodes.push(sec(n(), 'Schedule',
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Due'), h('th', {}, 'Assignment'), h('th', {}, 'Module'), h('th', {}, 'Stage'), h('th', { class: 'n' }, 'Points'))),
          h('tbody', {}, rows.map((r) => h('tr', {}, h('td', { class: 'nw' }, r.due ? S.fmtDate(r.due) : 'No date'), h('td', {}, r.a.title, r.cap ? h('span', { class: 'tag solid', style: 'margin-left:.06in' }, 'Capstone') : null), h('td', {}, r.mod), h('td', {}, STAGE[S.stageOf(r.a)] || ''), h('td', { class: 'n' }, r.a.points > 0 ? String(r.a.points) : '—'))))),
        h('p', { class: 'muted' }, 'Dates are the ones set in your course. Late work is accepted and marked late.')));
    }

    // Capstone
    if (cap && capRec) {
      const prep = [];
      const mt = (capRec.prepares && capRec.prepares.modules) || [];
      mt.forEach((p) => { const m = mods.find((x) => x.id === p.id); if (m) prep.push(h('li', {}, h('b', {}, m.title), p.why ? ' — ' + p.why : '')); });
      nodes.push(sec(n(), 'Capstone',
        h('div', { class: 'card cap-card' },
          h('span', { class: 'k', style: 'margin-top:0' }, 'Culminating project · counts ' + w + '% of the course grade'),
          h('h3', { style: 'margin-top:.02in' }, cap.title),
          cap.description ? h('p', { class: 'pre' }, cap.description) : null,
          cap.points > 0 ? h('p', { class: 'muted' }, cap.points + ' points' + (cap.due ? ' · due ' + S.fmtDate(cap.due) : '')) : null),
        capRec.note ? h('p', {}, capRec.note) : null,
        prep.length ? h('div', { class: 'keep' }, h('span', { class: 'k' }, 'Recommended preparation'), h('ul', {}, prep), h('p', { class: 'muted' }, 'These are recommendations. The capstone is open from the start.')) : null));
    }

    // Grading policy
    const g = [];
    g.push(h('p', {}, 'Each graded assignment has a weighted rubric; the criteria and their points are listed with the assignment.'));
    if (cap) {
      g.push(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Component'), h('th', { class: 'n' }, 'Weight'))),
        h('tbody', {}, h('tr', {}, h('td', {}, 'Module assignments (weighted average of graded work)'), h('td', { class: 'n' }, (100 - w) + '%')), h('tr', {}, h('td', {}, 'Capstone'), h('td', { class: 'n' }, w + '%')), h('tr', { class: 'total' }, h('td', {}, 'Course grade'), h('td', { class: 'n' }, '100%')))));
      g.push(h('p', {}, 'Until the capstone has a final grade, your course grade is shown as ', h('b', {}, 'provisional'), ': it is the module average alone. An ungraded capstone never counts as zero. When the capstone is graded, the course grade becomes ' + (100 - w) + '% module average and ' + w + '% capstone, and the “provisional” label is removed.'));
    } else {
      g.push(h('p', {}, 'Your current grade is the points you have earned divided by the points possible across the assignments that have a score.'));
    }
    g.push(h('div', { class: 'callout' }, h('b', {}, 'AI review and revision. '), 'If you send work for AI review, you get detailed feedback first with no grade. You then have ' + S.REVIEW_HOURS + ' hours to improve and resubmit for your final grade; if you do not, the first review becomes your grade.'));
    g.push(h('p', {}, 'Reviews are produced by an AI and are automated assessments, not human grades. Letter equivalents, where shown, use a common scale and accompany the points; they never replace them.'));
    nodes.push(sec(n(), 'Grading policy', ...g));

    // Credentials
    if (c.credentials && c.credentials.length) {
      nodes.push(sec(n(), 'Credentials and next steps',
        h('p', { class: 'muted' }, 'Self-reported by the learner. Sovereign does not verify or issue credentials.'),
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Credential'), h('th', {}, 'Issuer'), h('th', {}, 'Status'))),
          h('tbody', {}, c.credentials.map((k) => h('tr', {}, h('td', {}, link(k.name, k.url), k.note ? h('div', { class: 'muted' }, k.note) : null), h('td', {}, k.issuer || ''), h('td', {}, k.status || '')))))));
    }
    if (c.work && c.work.title) nodes.push(sec(n(), 'Final project: ' + c.work.title, c.work.criteria.length ? h('ul', { class: 'plain' }, c.work.criteria.map((x) => h('li', {}, x))) : null));
    if (c.syllabus) nodes.push(sec(n(), 'Syllabus notes', h('p', { class: 'pre' }, c.syllabus)));
    return { doc: 'Syllabus', kicker: 'sovereign. · Syllabus', deck: c.objective || '', nodes, colophon: 'The grading rules above are the ones the app applies' };
  }
  S.publish.builders.syllabus = { name: 'Syllabus', init: () => ({}), intro: 'A designed, paginated Syllabus in this course’s own design: overview, modules and materials, schedule, capstone and grading policy.', build: buildSyllabus };
})(window.Sovereign);
