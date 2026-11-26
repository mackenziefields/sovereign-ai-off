/* sovereign. — Review Studio: your submitted work beside its feedback, with each point linked to the passage it is about.
   Everything happens on this device. Nothing is uploaded to show or highlight a document. A passage is highlighted only when this app
   itself finds it in the submission; if it can't, the feedback stays and says so. Grades, the 72-hour window and saved records are never touched. */
(function (S) {
  'use strict';
  const { h } = S;

  // ---------- finding a quoted passage in a submission ----------
  // Compare letters and digits only (any case), so quotation marks, dashes, line breaks and hyphenation don't matter.
  const KEEP = /[\p{L}\p{N}]/u, MIN = 6, MAXP = 40;
  function norm(str) {
    let s = ''; const map = [];
    for (let i = 0; i < str.length; i++) { const ch = str[i]; if (KEEP.test(ch)) { s += ch.toLowerCase()[0]; map.push(i); } }
    return { s, map };
  }
  function hits(hay, q) { const out = []; let i = hay.indexOf(q); while (i !== -1 && out.length < 50) { out.push(i); i = hay.indexOf(q, i + 1); } return out; }
  // -> { ok, start, end, count } (character offsets in the original text), or { ok:false, short }
  S.locate = function (text, quote) {
    const n = norm(String(text || '')), q = norm(String(quote || '')).s;
    if (q.length < MIN) return { ok: false, short: true };
    const at = hits(n.s, q);
    return at.length ? { ok: true, start: n.map[at[0]], end: n.map[at[0] + q.length - 1] + 1, count: at.length } : { ok: false, short: false };
  };

  // ---------- PDF.js (local copy, loaded only when a PDF is opened) ----------
  let pdfLib = null;
  function loadPdf() {
    if (!pdfLib) pdfLib = import('./vendor/pdf.min.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('js/vendor/pdf.worker.min.mjs', document.baseURI).href; return m; });
    return pdfLib;
  }
  const hasHL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

  async function buildPdfPages(lib, pdf, mount, width) {
    mount.replaceChildren();
    const pages = [], n = Math.min(pdf.numPages, MAXP), dpr = Math.min(2, window.devicePixelRatio || 1);
    const jobs = [];
    for (let p = 1; p <= n; p++) {
      const page = await pdf.getPage(p), v1 = page.getViewport({ scale: 1 }), scale = Math.max(0.3, Math.min(1.8, width / v1.width)), vp = page.getViewport({ scale });
      const canvas = h('canvas', { class: 'rv-canvas', role: 'img', 'aria-label': 'Page ' + p + ' of your PDF' }), tdiv = h('div', { class: 'textLayer' });
      const wrap = h('div', { class: 'rv-page', 'data-page': p, style: 'width:' + Math.floor(vp.width) + 'px;height:' + Math.floor(vp.height) + 'px;--scale-factor:' + scale + ';--total-scale-factor:' + scale }, canvas, tdiv);
      mount.append(h('div', { class: 'rv-page-label small muted' }, 'Page ' + p + ' of ' + pdf.numPages), wrap);
      const tl = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: tdiv, viewport: vp });
      await tl.render();
      const strs = tl.textContentItemsStr, divs = tl.textDivs, s = [], map = [];
      strs.forEach((str, i) => { for (let o = 0; o < str.length; o++) if (KEEP.test(str[o])) { s.push(str[o].toLowerCase()[0]); map.push([i, o]); } });
      pages.push({ p, divs, s: s.join(''), map });
      jobs.push(() => { canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr); canvas.style.width = Math.floor(vp.width) + 'px'; canvas.style.height = Math.floor(vp.height) + 'px';
        return page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: scale * dpr }) }).promise.catch(() => {}); });
    }
    (async () => { for (const j of jobs) { if (!mount.isConnected) return; await j(); } })(); // draw page pictures one at a time, after the text is ready
    return pages;
  }
  // -> { ok, page, count, a:[item,offset], b:[item,offset] } or { ok:false, short }
  function locateInPdf(pages, quote) {
    const q = norm(String(quote || '')).s;
    if (q.length < MIN) return { ok: false, short: true };
    let first = null, count = 0;
    for (const pg of pages) { const at = hits(pg.s, q); count += at.length; if (at.length && !first) first = { page: pg.p, a: pg.map[at[0]], b: pg.map[at[0] + q.length - 1] }; }
    return first ? { ok: true, count, ...first } : { ok: false, short: false };
  }
  function pdfRange(pages, loc) {
    const pg = pages.find((x) => x.p === loc.page); if (!pg) return null;
    const d0 = pg.divs[loc.a[0]], d1 = pg.divs[loc.b[0]], t0 = d0 && d0.firstChild, t1 = d1 && d1.firstChild; if (!t0 || !t1) return null;
    try { const r = document.createRange(); r.setStart(t0, Math.min(loc.a[1], t0.length)); r.setEnd(t1, Math.min(loc.b[1] + 1, t1.length)); return r; } catch (e) { return null; }
  }

  // ---------- the studio ----------
  const TYPES = {
    strength: ['Working well', 'blue', 'What’s working'], error: ['Verified error', 'yellow', 'Verified errors'], missing: ['Missing', 'yellow', 'Missing requirements'],
    partial: ['Partly achieved', 'yellow', 'Partly achieved'], clarity: ['Clarity', 'yellow', 'Clarity and presentation'], optional: ['Optional', 'yellow', 'Optional improvements'], unverified: ['Could not verify', 'none', 'Could not be verified'],
  };
  TYPES.change = ['Suggested change', 'yellow', 'What to change'];
  function legacyPoint(type, text) {
    const m = String(text).match(/[“"]([^”"]{12,300})[”"]/);
    return { type, claim: String(text), quote: m ? m[1] : '', criterion: '', where: '', alreadyPresent: '', fix: '', example: '', exampleSource: 'none', located: null, note: '', caution: '', illustrative: false, ref: null, legacy: true };
  }
  const ORDER = ['strength', 'change', 'error', 'missing', 'partial', 'clarity', 'optional', 'unverified'];
  const CSTATUS = { met: 'Met', partly: 'Partly met', 'not-met': 'Not met', 'not-assessed': 'Not assessed' };
  const FOLLOW = { addressed: 'Addressed', partly: 'Partly addressed', 'not-addressed': 'Not yet addressed', 'cannot-tell': 'Could not tell' };
  const wide = () => window.matchMedia('(min-width: 900px)').matches;
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };

  async function loadDoc(sub) {
    const t = String(sub.fileType || ''), name = sub.fileName || '';
    if (sub.text && !(sub.fileId && (t === 'application/pdf' || t.startsWith('image/')))) return { kind: 'text', text: sub.text, name };
    if (!sub.fileId) return { kind: 'none', name };
    let blob = null; try { blob = await S.files.get(sub.fileId); } catch (e) { /* treated as not available */ }
    if (!blob) return { kind: 'missing', name };
    if (t === 'application/pdf') return { kind: 'pdf', blob, name };
    if (t.startsWith('image/')) return { kind: 'image', blob, name };
    if (/spreadsheet|excel|xlsx/i.test(t) || /\.xlsx$/i.test(name)) { try { return { kind: 'xlsx', text: await S.files.xlsxToText(blob), name }; } catch (e) { return { kind: 'other', blob, name }; } }
    return { kind: 'other', blob, name };
  }

  // opts: { c, m, a, sub, feedback, showScore, office, title, meta, scoreLine, rubric, legacy: () => node, opener }
  function open(opts) {
    const fb = opts.feedback, v2 = !!(fb && fb.findings && fb.context);
    // Older reviews have no structured findings. Their saved points are shown as they were written; where a point quotes the work in
    // quotation marks, this device tries to match that quote locally (no AI, nothing saved). A point with no quote is never given an anchor.
    const legacyPts = (!v2 && fb) ? [...(fb.strengths || []).map((s) => legacyPoint('strength', s)), ...(fb.improvements || []).map((s) => legacyPoint('change', s))] : [];
    const items = (v2 ? fb.findings : legacyPts).map((f, i) => ({ id: 'f' + i, f, i, hue: (TYPES[f.type] || TYPES.optional)[1], state: f.quote ? 'pending' : 'none', count: 0, page: 0, short: false })).sort((x, y) => ORDER.indexOf(x.f.type) - ORDER.indexOf(y.f.type));
    items.forEach((it, k) => { it.n = k + 1; }); // numbered in the order they are read: strengths first
    const theme = (opts.c && opts.c.designTheme) || 'modernist';
    const st = { doc: null, items, active: null, pdf: null, pages: null, noText: false, urls: [] };
    let updateLegacy = () => {};
    const live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    const say = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
    const dlg = h('dialog', { class: 'rv', 'aria-labelledby': 'rv-title', 'data-tab': 'fb', 'data-theme': theme });
    const docBody = h('div', { class: 'rv-docbody' }, h('p', { class: 'small muted' }, 'Opening your work…'));
    const docPane = h('section', { class: 'rv-doc', 'aria-label': 'Your submitted work' });
    const fbPane = h('section', { class: 'rv-fb', 'aria-label': 'Feedback' });
    const setTab = (t) => { dlg.dataset.tab = t; tabs.forEach(([k, b]) => { b.setAttribute('aria-selected', String(k === t)); b.tabIndex = k === t ? 0 : -1; }); updatePeek(); };
    const tabs = [['work', h('button', { type: 'button', role: 'tab', class: 'rv-tab', id: 'rv-tab-work', 'aria-controls': 'rv-docpane', onclick: () => setTab('work') }, 'Your work')], ['fb', h('button', { type: 'button', role: 'tab', class: 'rv-tab', id: 'rv-tab-fb', 'aria-controls': 'rv-fbpane', onclick: () => setTab('fb') }, 'Feedback')]];
    docPane.id = 'rv-docpane'; fbPane.id = 'rv-fbpane';
    const tabList = h('div', { class: 'rv-tabs', role: 'tablist', 'aria-label': 'Show your work or the feedback', onkeydown: (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const t = dlg.dataset.tab === 'fb' ? 'work' : 'fb'; setTab(t); tabs.find((x) => x[0] === t)[1].focus(); e.preventDefault(); } } }, tabs.map((x) => x[1]));

    // --- where each point sits in the work ---
    const locLine = (it) => {
      const k = st.doc && st.doc.kind;
      if (!it.f.quote) return it.f.legacy ? 'This older point does not quote your work, so there is nothing to highlight. No location was guessed.' : it.f.type === 'missing' ? 'Nothing to highlight: this is about something that is not in your work.' : '';
      if (it.state === 'pending') return 'Checking where this is in your work…';
      if (it.state === 'located') return 'Found in your work' + (it.page ? ' (page ' + it.page + ')' : '') + '.' + (it.count > 1 ? ' The same words appear ' + it.count + ' times; the first is shown.' : '');
      if (k === 'image') return 'Passages can’t be located in an image, so nothing is highlighted.';
      if (k === 'missing' || k === 'none' || k === 'other') return 'Your file isn’t available to show here, so this passage couldn’t be located.';
      if (st.noText) return 'This PDF has no selectable text (it may be a scan), so passages can’t be located.';
      if (it.short) return 'The AI’s quote was too short to locate reliably, so nothing is highlighted.';
      return 'Sovereign could not find this passage in your submission, so it is not highlighted. The feedback is kept.';
    };
    function refreshUi() {
      updateLegacy();
      items.forEach((it) => { if (!it.ui) return; it.ui.loc.textContent = locLine(it); it.ui.show.hidden = it.state !== 'located'; it.ui.card.classList.toggle('located', it.state === 'located'); it.ui.pin.hidden = it.state !== 'located'; });
    }

    // --- document pane ---
    const marks = () => [...docBody.querySelectorAll('mark.rv-hl')];
    function paintText() {
      const text = st.doc.text, ranges = items.filter((it) => it.state === 'located' && it.start != null);
      const pts = new Set([0, text.length]); ranges.forEach((it) => { pts.add(it.start); pts.add(it.end); });
      const cuts = [...pts].sort((x, y) => x - y), page = h('div', { class: 'rv-text', tabindex: '0', 'aria-label': 'Text of your submission' });
      for (let k = 0; k < cuts.length - 1; k++) {
        const a = cuts[k], b = cuts[k + 1], ids = ranges.filter((it) => it.start <= a && it.end >= b);
        if (!ids.length) { page.append(text.slice(a, b)); continue; }
        const yellow = ids.some((it) => it.hue !== 'blue');
        page.append(h('mark', { class: 'rv-hl ' + (yellow ? 'rv-yellow' : 'rv-blue'), 'data-ids': ids.map((it) => it.id).join(' '), 'data-n': ids.map((it) => it.n).sort((x, y) => x - y).join(','), title: 'Select to see the feedback about this passage', onclick: (e) => { const list = e.currentTarget.dataset.ids.split(' '); const next = list.includes(st.active) ? list[(list.indexOf(st.active) + 1) % list.length] : list[0]; select(next, { fromDoc: true }); } }, text.slice(a, b)));
      }
      docBody.replaceChildren(page);
    }
    function paintPdf() {
      if (!st.pages) return;
      const blue = [], yellow = [], onB = [], onY = [];
      items.forEach((it) => { if (it.state !== 'located' || !it.loc) return; const r = pdfRange(st.pages, it.loc); if (!r) return; it.range = r; (it.hue === 'blue' ? blue : yellow).push(r); if (it.id === st.active) (it.hue === 'blue' ? onB : onY).push(r); });
      if (hasHL) { CSS.highlights.set('rv-blue', new Highlight(...blue)); CSS.highlights.set('rv-yellow', new Highlight(...yellow)); CSS.highlights.set('rv-on-blue', new Highlight(...onB)); CSS.highlights.set('rv-on-yellow', new Highlight(...onY)); }
      else { docBody.querySelectorAll('.rv-fallback').forEach((e) => e.classList.remove('rv-fallback')); items.forEach((it) => { if (it.state === 'located' && it.loc) { const pg = st.pages.find((x) => x.p === it.loc.page); for (let i = it.loc.a[0]; pg && i <= it.loc.b[0]; i++) pg.divs[i].classList.add('rv-fallback'); } }); }
    }
    function applyActive() {
      items.forEach((it) => { if (!it.ui) return; const on = it.id === st.active; it.ui.card.classList.toggle('active', on); it.ui.head.setAttribute('aria-expanded', String(on)); it.ui.body.hidden = !on; });
      if (st.doc && st.doc.kind === 'text') marks().forEach((mk) => mk.classList.toggle('rv-on', st.active && mk.dataset.ids.split(' ').includes(st.active)));
      else paintPdf();
      const n = items.findIndex((it) => it.id === st.active); counter.textContent = n < 0 ? items.length + ' points' : (n + 1) + ' of ' + items.length; updatePeek();
    }
    function scrollToActive() {
      const it = items.find((x) => x.id === st.active); if (!it || it.state !== 'located') return;
      const beh = calm() ? 'auto' : 'smooth';
      if (st.doc.kind === 'text') { const mk = marks().find((m) => m.dataset.ids.split(' ').includes(it.id)); if (mk) mk.scrollIntoView({ block: 'center', behavior: beh }); }
      else if (it.range) { const r = it.range.getBoundingClientRect(), box = docBody.getBoundingClientRect(); docBody.scrollBy({ top: r.top - box.top - box.height / 3, behavior: beh }); }
    }
    function select(id, o) {
      o = o || {}; st.active = id; applyActive();
      const it = items.find((x) => x.id === id); if (!it) return;
      if (it.ui && !o.fromDoc) it.ui.card.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
      if (o.fromDoc && it.ui) { if (!wide()) setTab('fb'); it.ui.card.scrollIntoView({ block: 'nearest' }); }
      if (it.state === 'located' && !o.fromDoc) { if (!wide()) setTab('work'); setTimeout(scrollToActive, 30); say('Showing in your work: ' + (it.f.quote || '')); }
      else if (!o.fromDoc) say(it.state === 'pending' ? 'Checking where this is.' : locLine(it) || 'This point has no passage to show.');
    }

    // --- feedback pane ---
    const counter = h('span', { class: 'rv-count-now', 'aria-live': 'off' }, items.length + ' points');
    const step = (d) => { if (!items.length) return; const n = items.findIndex((it) => it.id === st.active); select(items[(n < 0 ? (d > 0 ? 0 : items.length - 1) : (n + d + items.length) % items.length)].id); };
    function card(it) {
      const f = it.f, t = TYPES[f.type] || TYPES.optional, bodyId = 'rv-b-' + it.id;
      const pin = h('span', { class: 'rv-pin', hidden: true, title: 'Located in your work' }, 'In your work');
      const head = h('button', { type: 'button', class: 'rv-card-head', 'aria-expanded': 'false', 'aria-controls': bodyId, onclick: () => select(it.id) },
        h('span', { class: 'rv-num', 'aria-hidden': 'true' }, String(it.n)),
        h('span', { class: 'rv-main' }, h('span', { class: 'rv-line' }, h('span', { class: 'sr-only' }, 'Point ' + it.n + ': '), h('span', { class: 'rv-chip rv-chip-' + t[1] }, t[0]), pin), h('span', { class: 'rv-claim' }, f.claim)));
      const loc = h('p', { class: 'small muted rv-loc' }), show = h('button', { type: 'button', class: 'rv-show', hidden: true, onclick: () => { if (!wide()) setTab('work'); scrollToActive(); say('Showing in your work: ' + (f.quote || '')); } }, 'Show in your work →');
      const body = h('div', { class: 'rv-card-body', id: bodyId, hidden: true },
        f.quote ? h('blockquote', { class: 'f-quote' }, '“' + f.quote + '”') : null, S.exhibitsView.refLine(f), S.myData && opts.a && f.ref ? S.myData.refRow(opts.a, fb.data, f.ref) : null, loc, show,
        f.criterion ? h('p', { class: 'small muted' }, 'Criterion: ' + f.criterion) : null,
        f.note ? h('p', { class: 'small muted' }, f.note) : null, f.caution ? h('p', { class: 'small' }, f.caution) : null,
        f.fix ? h('p', { class: 'f-fix' }, h('b', {}, 'Suggested change: '), f.fix) : null,
        f.example ? h('p', { class: 'f-example' }, h('b', {}, f.illustrative ? 'Illustration (not from your assignment materials): ' : 'Example: '), f.example) : null);
      const li = h('li', { class: 'rv-card hue-' + t[1] }, head, body);
      it.ui = { card: li, head, body, loc, show, pin };
      return li;
    }
    function buildFeedback() {
      fbPane.replaceChildren();
      const ins = fb.inspection || {}, c = fb.context || {}, rub = opts.rubric || [];
      const fullName = (k) => { const r = rub.find((x) => x.name === k.name || (k.name.length >= 100 && x.name.startsWith(k.name))); return r ? r.name : k.name; };
      if (!v2) {
        const legText = () => 'This review was made before evidence-linked feedback existed, so it has no saved passage references. Its points are shown below exactly as written and nothing was regenerated or changed. Where a point quotes your work in quotation marks, this device tries to match the quote itself (no AI). ' + (items.length ? (items.some((it) => it.state === 'pending') ? 'Checking the quotes…' : 'So far ' + items.filter((it) => it.state === 'located').length + ' of ' + items.length + ' points could be matched; the rest are not highlighted and no location is guessed.') : '');
        const legBanner = h('p', { class: 'banner', role: 'status' }, legText()); updateLegacy = () => { legBanner.textContent = legText(); };
        fbPane.append(h('div', { class: 'rv-intro' }, h('p', { class: 'rv-kicker' }, 'Your review'), h('h3', { class: 'rv-display' }, 'A closer look.'), opts.scoreLine ? h('p', { class: 'rv-score' }, opts.scoreLine) : null),
          legBanner,
          items.length ? h('p', { class: 'rv-hint' }, 'Select a point marked “In your work” to jump to its passage.') : null,
          ...['strength', 'change'].map((ty) => { const g = items.filter((it) => it.f.type === ty); return g.length ? h('section', { class: 'rv-group', 'aria-label': TYPES[ty][2] }, h('h3', { class: 'rv-h' }, TYPES[ty][2], h('span', { class: 'rv-count' }, ' ' + g.length)), h('ul', { class: 'rv-cards' }, g.map(card))) : null; }).filter(Boolean),
          fb.nextSteps && fb.nextSteps.length ? h('section', { class: 'rv-group', 'aria-label': 'Next steps' }, h('h3', { class: 'rv-h' }, 'Next steps (optional)'), h('ul', { class: 'plain' }, fb.nextSteps.map((x) => h('li', {}, x)))) : null,
          opts.legacy ? h('details', { class: 'inspect rv-orig' }, h('summary', {}, 'The original review, as saved (scores, summary, next steps)'), opts.legacy()) : null);
        refreshUi();
        return;
      }
      const assessed = fb.criteria.filter((k) => k.assessed !== false);
      fbPane.append(...[
        h('div', { class: 'rv-intro' }, h('p', { class: 'rv-kicker' }, 'Your review'), h('h3', { class: 'rv-display' }, 'A closer look.'), h('p', { class: 'rv-sub' }, 'Evidence-linked observations and suggested revisions.'), opts.scoreLine ? h('p', { class: 'rv-score' }, opts.scoreLine) : null, fb.summary ? h('p', { class: 'rv-lead' }, fb.summary) : null),
        ins.limited ? h('p', { class: 'banner', role: 'status' }, 'Review limitation: ' + (fb.criteria.length - assessed.length) + ' of ' + fb.criteria.length + ' grading criteria could not be fairly assessed because the AI could not read the evidence. They were left out, not scored low.') : null,
        h('details', { class: 'inspect' }, h('summary', {}, 'What the reviewer could see'),
          ins.received ? h('p', { class: 'small' }, ins.received) : null,
          fb.data ? h('p', { class: 'small' }, h('b', {}, 'Your own dataset was included. '), 'You chose to send ' + fb.data.rows.toLocaleString() + ' row' + (fb.data.rows === 1 ? '' : 's') + (fb.data.sent.length ? ' from ' + fb.data.sent.join(', ') : '') + ' for this review (about ' + fb.data.chars.toLocaleString() + ' characters).' + (fb.data.removed ? ' That version has since been deleted from this device.' : '')) : null,
          (ins.facts || []).length ? h('ul', { class: 'plain small' }, ins.facts.map((x) => h('li', {}, x))) : null,
          (ins.couldNotInspect || []).length ? h('div', {}, h('p', { class: 'small' }, h('b', {}, 'Could not read or see:')), h('ul', { class: 'plain small' }, ins.couldNotInspect.map((x) => h('li', {}, x)))) : null,
          h('p', { class: 'small muted' }, c.mode === 'practice' ? 'Practice on this assignment. Ungraded.' : c.mode === 'own' ? 'Explored with your own material. Ungraded.' : ''),
          c.compared === 'both-versions' ? h('p', { class: 'small muted' }, 'Compared with your first version (you agreed to send it).') : c.compared === 'findings-only' ? h('p', { class: 'small muted' }, 'Your first version was not available to the AI, so it could not compare the two versions.') : null),
        !items.length ? h('p', { class: 'small muted' }, 'The AI found nothing to flag.') : h('p', { class: 'rv-hint' }, h('span', { class: 'rv-key rv-k-blue' }, 'What’s working'), h('span', { class: 'rv-key rv-k-yellow' }, 'What to change'), 'Select any point marked “In your work” to jump to its passage. The passage is highlighted and the point stays selected; select a highlight to come back.'),
        ORDER.map((ty) => { const g = items.filter((it) => it.f.type === ty); return g.length ? h('section', { class: 'rv-group', 'aria-label': TYPES[ty][2] }, h('h3', { class: 'rv-h' }, TYPES[ty][2], h('span', { class: 'rv-count' }, ' ' + g.length)), h('ul', { class: 'rv-cards' }, g.map(card))) : null; }),
        fb.followUp && fb.followUp.length ? h('section', { class: 'rv-group' }, h('h3', { class: 'rv-h' }, 'Earlier points'), h('ul', { class: 'plain' }, fb.followUp.map((x) => h('li', {}, h('b', {}, FOLLOW[x.status] || ''), ': ', x.claim, x.note ? ' — ' + x.note : '')))) : null,
        fb.criteria.length ? h('section', { class: 'rv-group' }, h('h3', { class: 'rv-h' }, 'Rubric assessment'), h('ul', { class: 'rv-rubric' }, fb.criteria.map((k) => h('li', {}, h('div', { class: 'rv-rub-top' }, h('b', {}, fullName(k)), h('span', { class: 'rv-cstatus rv-cs-' + k.status }, CSTATUS[k.status] || ''), opts.showScore && k.assessed !== false ? h('span', { class: 'rv-pts' }, k.score + ' / ' + k.max) : null), k.comment ? h('p', { class: 'small muted' }, k.comment) : null, k.adjusted ? h('p', { class: 'small muted' }, 'Adjusted: ' + k.adjusted) : null)))) : null,
        fb.nextSteps && fb.nextSteps.length ? h('section', { class: 'rv-group' }, h('h3', { class: 'rv-h' }, 'Next steps (optional)'), h('ul', { class: 'plain' }, fb.nextSteps.map((x) => h('li', {}, x)))) : null,
        h('p', { class: 'small muted' }, 'Reviewed by AI in the full app on ' + when(fb.at) + ' and imported here. ' + (opts.office ? 'Practice feedback only: nothing here is graded.' : 'This is an automated assessment, not a human grade.') + ' Highlights appear only where this app found the passage in your submission.'),
        items.length ? h('div', { class: 'rv-nav', role: 'group', 'aria-label': 'Move between points' }, h('button', { type: 'button', class: 'rv-step', onclick: () => step(-1) }, '← Previous'), counter, h('button', { type: 'button', class: 'rv-step', onclick: () => step(1) }, 'Next →')) : null].flat().filter(Boolean));
      refreshUi();
    }

    // --- shell ---
    let done = false;
    const close = () => {
      if (done) return; done = true;
      try { if (dlg.open) dlg.close(); } catch (e) { /* already closed */ }
      if (hasHL) ['rv-blue', 'rv-yellow', 'rv-on-blue', 'rv-on-yellow'].forEach((k) => CSS.highlights.delete(k));
      st.urls.forEach((u) => URL.revokeObjectURL(u)); if (st.pdf && st.pdf.destroy) st.pdf.destroy().catch(() => {}); if (st.ro) st.ro.disconnect();
      document.documentElement.classList.remove('rv-lock'); dlg.remove();
      const o = opts.opener; if (o && o.isConnected) o.focus(); else { const mn = document.getElementById('main'); if (mn) mn.focus({ preventScroll: true }); }
    };
    const pdfCtl = h('div', { class: 'rv-pdfctl', role: 'group', 'aria-label': 'Page and zoom', hidden: true });
    const peek = h('div', { class: 'rv-peek', hidden: true, role: 'region', 'aria-label': 'Selected point' });
    function updatePeek() {
      const it = items.find((x) => x.id === st.active); peek.hidden = !(it && !wide() && dlg.dataset.tab === 'work'); if (peek.hidden) return;
      const t = TYPES[it.f.type] || TYPES.optional;
      peek.replaceChildren(
        h('div', { class: 'rv-peek-top' }, h('span', { class: 'rv-num', 'aria-hidden': 'true' }, String(it.n)), h('span', { class: 'rv-chip rv-chip-' + t[1] }, t[0]), h('span', { class: 'rv-peek-of' }, it.n + ' of ' + items.length)),
        h('p', { class: 'rv-claim' }, it.f.claim), ...(it.state === 'located' ? [] : [h('p', { class: 'small muted' }, locLine(it))]),
        h('div', { class: 'rv-peek-actions' }, h('button', { type: 'button', class: 'rv-step', onclick: () => step(-1) }, '← Previous'), h('button', { type: 'button', class: 'rv-step', onclick: () => step(1) }, 'Next →'),
          h('button', { type: 'button', class: 'rv-step rv-all', onclick: () => { setTab('fb'); const x = items.find((q) => q.id === st.active); (x && x.ui ? x.ui.head : tabs[1][1]).focus(); } }, 'All feedback')));
    }
    // Adjustable split (desktop): drag the bar, or focus it and use the arrow keys. Starts at 55% work / 45% feedback; remembered on this device.
    const splitter = h('div', { class: 'rv-split', role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-label': 'Resize the work and feedback panels. Use the left and right arrow keys; Home resets.', title: 'Drag to resize. Double-click to reset.' });
    const grid = h('div', { class: 'rv-grid' }, docPane, splitter, fbPane);
    const SPLIT_KEY = 'sovereign.aioff.rvSplit';
    let pct = 55; try { const v = parseFloat(localStorage.getItem(SPLIT_KEY)); if (v >= 30 && v <= 70) pct = v; } catch (e) { /* default */ }
    const setSplit = (p, save) => {
      const W = grid.clientWidth || 1200, rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, lo = Math.min(45, (22 * rem) / W * 100), hi = Math.max(lo, 100 - (26 * rem) / W * 100);
      pct = Math.round(Math.max(lo, Math.min(hi, p)) * 10) / 10;
      grid.style.setProperty('--rv-w', pct + '%'); splitter.setAttribute('aria-valuenow', String(Math.round(pct))); splitter.setAttribute('aria-valuemin', String(Math.round(lo))); splitter.setAttribute('aria-valuemax', String(Math.round(hi)));
      if (save) { try { localStorage.setItem(SPLIT_KEY, String(pct)); } catch (e) { /* not saved */ } }
    };
    splitter.addEventListener('pointerdown', (e) => {
      e.preventDefault(); splitter.setPointerCapture(e.pointerId); splitter.classList.add('on'); const r = grid.getBoundingClientRect();
      const move = (ev) => setSplit(((ev.clientX - r.left) / r.width) * 100, false);
      const up = () => { splitter.classList.remove('on'); splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', up); setSplit(pct, true); };
      splitter.addEventListener('pointermove', move); splitter.addEventListener('pointerup', up);
    });
    splitter.addEventListener('dblclick', () => setSplit(55, true));
    splitter.addEventListener('keydown', (e) => { const d = e.key === 'ArrowLeft' ? -3 : e.key === 'ArrowRight' ? 3 : 0; if (d) { e.preventDefault(); setSplit(pct + d, true); } else if (e.key === 'Home') { e.preventDefault(); setSplit(55, true); } });
    docPane.append(h('div', { class: 'rv-docbar' }, h('p', { class: 'rv-docmeta', id: 'rv-docmeta' }),
      v2 ? h('p', { class: 'rv-legend' }, h('span', { class: 'rv-key rv-k-blue' }, 'Strength'), h('span', { class: 'rv-key rv-k-yellow' }, 'Suggested change'), h('span', { class: 'rv-fine' }, 'Highlighted only where Sovereign found the passage.')) : null, pdfCtl), docBody);
    dlg.append(h('div', { class: 'rv-head' }, h('div', { class: 'rv-head-main' }, h('p', { class: 'rv-eyebrow' }, 'Review Studio' + (opts.meta ? ' · ' + opts.meta : '')), h('h2', { id: 'rv-title', class: 'rv-title' }, opts.title || 'Your work and feedback')), h('button', { type: 'button', class: 'rv-close', onclick: close }, 'Close ', h('span', { 'aria-hidden': 'true' }, '✕'))),
      tabList, grid, peek, live);
    dlg.addEventListener('close', close);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Escape closes
    document.body.append(dlg); document.documentElement.classList.add('rv-lock'); dlg.showModal(); setTab('fb'); setSplit(pct, false); buildFeedback(); applyActive();

    // --- load the work, then find each passage ---
    (async () => {
      const doc = st.doc = await loadDoc(opts.sub), meta = dlg.querySelector('#rv-docmeta');
      const setMeta = (x) => { if (meta) meta.textContent = x; };
      const finish = () => { refreshUi(); applyActive(); };
      if (doc.kind === 'text' || doc.kind === 'xlsx') {
        setMeta(doc.kind === 'xlsx' ? 'Cell values from “' + doc.name + '”, as the reviewer received them (charts and formatting are not shown).' : doc.name ? 'From the file “' + doc.name + '”.' : 'The text you typed.');
        items.forEach((it) => { if (!it.f.quote) return; const r = S.locate(doc.text, it.f.quote); if (r.ok) Object.assign(it, { state: 'located', start: r.start, end: r.end, count: r.count }); else Object.assign(it, { state: 'not-found', short: !!r.short }); });
        paintText(); finish();
      } else if (doc.kind === 'pdf') {
        setMeta('“' + doc.name + '”, shown on this device. It is not uploaded anywhere.');
        try {
          const lib = await loadPdf();
          st.pdf = await lib.getDocument({ data: new Uint8Array(await doc.blob.arrayBuffer()), isEvalSupported: false }).promise;
          const cs = getComputedStyle(docBody), pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
          let zoom = 1, lastBase = 0;
          const base = () => Math.max(240, Math.floor(docBody.clientWidth - pad - 18)), width = () => Math.floor(base() * zoom);
          const build = async () => { lastBase = base(); docBody.classList.add('rv-pdf'); st.pages = await buildPdfPages(lib, st.pdf, docBody, width()); };
          const rebuild = async () => { const r = docBody.scrollTop / Math.max(1, docBody.scrollHeight); await build(); docBody.scrollTop = r * docBody.scrollHeight; paintPdf(); curPage(); };
          const pageEls = () => [...docBody.querySelectorAll('.rv-page')];
          const pageNow = h('span', { class: 'rv-pagenow', 'aria-live': 'off' }, 'Page 1');
          const curPage = () => { const box = docBody.getBoundingClientRect(), pg = pageEls(); let k = 0; pg.forEach((e, i) => { if (e.getBoundingClientRect().top - box.top <= box.height * 0.35) k = i; }); pageNow.textContent = 'Page ' + (k + 1) + ' of ' + st.pdf.numPages; };
          const goPage = (d) => { const box = docBody.getBoundingClientRect(), pg = pageEls(); let k = 0; pg.forEach((e, i) => { if (e.getBoundingClientRect().top - box.top <= box.height * 0.35) k = i; }); const t = pg[Math.max(0, Math.min(pg.length - 1, k + d))]; if (t) docBody.scrollBy({ top: t.getBoundingClientRect().top - box.top - 12, behavior: calm() ? 'auto' : 'smooth' }); };
          const zoomTo = (z) => { zoom = Math.max(0.6, Math.min(2.2, z)); say('Zoom ' + Math.round(zoom * 100) + ' percent'); rebuild(); };
          const btn = (label, aria, fn) => h('button', { type: 'button', class: 'rv-tool', 'aria-label': aria, title: aria, onclick: fn }, label);
          pdfCtl.replaceChildren(btn('‹', 'Previous page', () => goPage(-1)), pageNow, btn('›', 'Next page', () => goPage(1)), h('span', { class: 'rv-sep', 'aria-hidden': 'true' }), btn('−', 'Zoom out', () => zoomTo(zoom - 0.25)), btn('+', 'Zoom in', () => zoomTo(zoom + 0.25)), btn('Fit', 'Fit to width', () => zoomTo(1)));
          pdfCtl.hidden = false; docBody.addEventListener('scroll', () => { clearTimeout(docBody.__t); docBody.__t = setTimeout(curPage, 80); });
          docBody.replaceChildren(h('p', { class: 'small muted' }, 'Reading your PDF…')); docBody.classList.add('rv-pdf');
          await build();
          st.noText = st.pages.reduce((n, p) => n + p.s.length, 0) < 20;
          items.forEach((it) => { if (!it.f.quote) return; const r = locateInPdf(st.pages, it.f.quote); if (r.ok) Object.assign(it, { state: 'located', loc: r, page: r.page, count: r.count }); else Object.assign(it, { state: 'not-found', short: !!r.short }); });
          if (st.pdf.numPages > MAXP) docBody.append(h('p', { class: 'small muted' }, 'Showing the first ' + MAXP + ' of ' + st.pdf.numPages + ' pages. Passages on later pages can’t be located.'));
          if (st.noText) docBody.prepend(h('p', { class: 'banner' }, 'This PDF has no selectable text (it may be a scan), so no passage can be located. The feedback is shown without highlights.'));
          finish(); curPage();
          let timer = 0; st.ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(async () => { if (Math.abs(base() - lastBase) > lastBase * 0.12 && dlg.open && docBody.clientWidth > 0) await rebuild(); }, 300); }); st.ro.observe(docBody);
        } catch (e) {
          items.forEach((it) => { if (it.f.quote) it.state = 'not-found'; });
          const a = h('a', { href: URL.createObjectURL(doc.blob), target: '_blank', rel: 'noopener' }, 'Open the PDF in your browser'); st.urls.push(a.href);
          docBody.replaceChildren(h('p', { class: 'banner' }, 'The PDF viewer could not start here (it may not have been available offline yet). Your feedback is below, without highlights. ', a, '.')); finish();
        }
      } else if (doc.kind === 'image') {
        const u = URL.createObjectURL(doc.blob); st.urls.push(u); setMeta('“' + doc.name + '”, shown on this device.');
        docBody.replaceChildren(h('img', { class: 'rv-img', src: u, alt: 'The image you submitted' }), h('p', { class: 'small muted' }, 'Passages can’t be located inside an image, so the feedback appears without highlights.')); items.forEach((it) => { if (it.f.quote) it.state = 'not-found'; }); finish();
      } else {
        items.forEach((it) => { if (it.f.quote) it.state = 'not-found'; });
        docBody.replaceChildren(h('p', { class: 'banner' }, doc.kind === 'missing' ? 'This file isn’t on this device (files are not part of backups), so it can’t be shown. Your feedback is still here.' : doc.kind === 'other' ? 'This kind of file can’t be shown here. Your feedback is still here.' : 'No text or file was saved with this review.')); finish();
      }
    })().catch(() => { docBody.replaceChildren(h('p', { class: 'banner' }, 'Your work couldn’t be opened here. The feedback is still shown.')); items.forEach((it) => { if (it.f.quote) it.state = 'not-found'; }); refreshUi(); });
    return dlg;
  }

  S.reviewStudio = {
    open,
    // A button for the Feedback tab. `spec` is what open() needs, minus the opener.
    button(spec, label) {
      return h('div', { class: 'rv-open' }, h('button', { type: 'button', class: 'btn', onclick: (e) => open({ ...spec, opener: e.currentTarget }) }, label || 'Open Review Studio'),
        h('p', { class: 'small muted' }, 'See your work beside its feedback and jump to the passage each point is about. Stays on this device.'));
    },
  };
})(window.Sovereign);
