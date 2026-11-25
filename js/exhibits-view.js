/* sovereign. — Evidence packets: how exhibits look (Phase 2A, functional layer).
   Renders only the fixed component set defined in exhibits.js. Every string goes in as text, never as HTML.
   S.exhibitsView.packet(list, o) -> the exhibit navigator plus the open exhibit.   .previewBar(...) -> approve / discard bar. */
(function (S) {
  'use strict';
  const { h } = S, X = S.exhibits;
  const SVG = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => { const e = document.createElementNS(SVG, tag); Object.entries(attrs || {}).forEach(([k, v]) => { if (v != null) e.setAttribute(k, v); }); kids.flat(Infinity).forEach((c) => { if (c != null) e.append(c); }); return e; };
  const TYPE_NAME = { table: 'Table', timeline: 'Timeline', document: 'Document', chart: 'Chart' };
  const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100).toLocaleString();
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exhibit';

  /* ---- table ---- */
  function tableEl(ex) {
    const t = ex.table;
    return h('div', { class: 'ex-tablewrap', role: 'region', tabindex: '0', 'aria-label': ex.title + ', ' + t.rows.length + ' rows' },
      h('table', { class: 'ex-table' },
        h('caption', { class: 'sr-only' }, ex.title + '. ' + t.rows.length + ' rows, ' + t.columns.length + ' columns. Data is shown exactly as supplied.'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'ex-rid' }, 'Row'), t.columns.map((c) => h('th', { scope: 'col', class: c.kind === 'number' || c.kind === 'percent' || c.kind === 'currency' ? 'num' : '' }, c.label, c.unit ? h('span', { class: 'ex-unit' }, ' (' + c.unit + ')') : null)))),
        h('tbody', {}, t.rows.map((r) => h('tr', { id: 'ex-' + r.id },
          h('th', { scope: 'row', class: 'ex-rid' }, r.id),
          t.columns.map((c) => h('td', { class: (c.kind === 'number' || c.kind === 'percent' || c.kind === 'currency' ? 'num' : '') + (keepWhole(r.cells[c.key], c) ? ' ex-nw' : '') }, r.cells[c.key])))))));
  }
  // Identifiers, dates and short figures stay on one line (RV-2023-0401 must not break at its hyphens); long text still wraps.
  function keepWhole(v, c) { v = String(v == null ? '' : v); return v.length <= 26 && (c.kind !== 'text' || (!/\s/.test(v) && /\d/.test(v)) || /^\d{4}-\d{2}-\d{2}$/.test(v)); }
  // "Focus on exhibit": the same table in a large dialog, so a long dataset can be read without losing your place in the assignment.
  function focusTable(ex) {
    const dlg = h('dialog', { class: 'ex-focus', 'aria-labelledby': 'ex-f-' + ex.id },
      h('header', { class: 'ex-focus-head' }, h('h3', { id: 'ex-f-' + ex.id }, 'Exhibit ' + ex.id + ': ' + ex.title),
        h('button', { class: 'btn small', type: 'button', onclick: () => dlg.close() }, 'Close')),
      tableEl(ex), h('p', { class: 'ex-fine' }, 'Data is shown exactly as supplied. Press Escape or Close to return to the assignment.'));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
  }
  function csvBar(ex) {
    const safe = X.toCsv(ex, { safe: true }), name = slug(ex.title);
    return h('div', { class: 'ex-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => download(name + '-spreadsheet-safe.csv', safe.text) }, 'Download CSV (spreadsheet-safe)'),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => download(name + '-exact.csv', X.toCsv(ex, { safe: false }).text) }, 'Download exact original values'),
      h('p', { class: 'ex-fine' }, safe.guarded
        ? safe.guarded + ' cell' + (safe.guarded === 1 ? '' : 's') + ' begin with a character spreadsheets can read as a formula. The spreadsheet-safe file writes ' + (safe.guarded === 1 ? 'it' : 'them') + ' as text with a leading apostrophe. The exact file has no changes, so open it with care. The data shown here is never altered.'
        : 'Both files contain the same values, exactly as shown. Nothing has been cleaned or corrected.'));
  }

  /* ---- document ---- */
  function documentEl(ex) {
    const d = ex.document;
    return h('article', { class: 'ex-paper ex-doc-' + d.kind, 'aria-label': ex.title },
      d.meta.length ? h('dl', { class: 'ex-meta' }, d.meta.map((m) => [h('dt', {}, m.label), h('dd', {}, m.value)])) : null,
      d.blocks.map((b) => {
        if (b.t === 'heading') return h(b.level === 3 ? 'h5' : 'h4', { class: 'ex-h', id: 'ex-' + b.id }, b.text);
        if (b.t === 'paragraph') return h('p', { id: 'ex-' + b.id }, b.text);
        if (b.t === 'list') return h(b.ordered ? 'ol' : 'ul', { id: 'ex-' + b.id }, b.items.map((x) => h('li', {}, x)));
        if (b.t === 'quote') return h('blockquote', { id: 'ex-' + b.id }, h('p', {}, b.text), b.by ? h('footer', {}, '— ' + b.by) : null);
        if (b.t === 'turn') return h('p', { class: 'ex-turn', id: 'ex-' + b.id }, h('b', { class: 'ex-who' }, b.who ? b.who + ':' : ''), ' ', b.text);
        if (b.t === 'note') return h('p', { class: 'ex-stamp', id: 'ex-' + b.id }, b.label ? h('b', {}, b.label + (b.text ? ': ' : '')) : null, b.text);
        return h('hr', {});
      }));
  }

  /* ---- timeline ---- */
  function timelineEl(ex) {
    return h('ol', { class: 'ex-timeline', 'aria-label': ex.title }, ex.timeline.events.map((e) => h('li', { id: 'ex-' + e.id },
      h('span', { class: 'ex-when' }, e.date), h('div', {}, h('b', {}, e.label), e.detail ? h('p', {}, e.detail) : null))));
  }

  /* ---- chart ---- */
  function chartEl(ex, list) {
    const r = X.compute(list, ex), ch = ex.chart, pts = r.points, unit = r.unit ? ' ' + r.unit : '';
    const dataRows = pts.map((p) => h('tr', {}, h('th', { scope: 'row' }, p.label), h('td', { class: 'num' }, fmt(p.value) + unit), h('td', { class: 'num' }, String(p.n))));
    const dataTable = h('table', { class: 'ex-table ex-chartdata sr-only' }, h('caption', {}, 'Data behind the chart: ' + ex.title),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ch.xLabel || 'Category'), h('th', { scope: 'col', class: 'num' }, (ch.yLabel || 'Value') + (r.unit ? ' (' + r.unit + ')' : '')), h('th', { scope: 'col', class: 'num' }, 'Source rows'))), h('tbody', {}, dataRows));
    let svg = null;
    if (pts.length) {
      const max = Math.max(...pts.map((p) => p.value), 0), min = Math.min(...pts.map((p) => p.value), 0), span = max - min || 1;
      if (ch.kind === 'line') {
        const W = 720, H = 300, L = 56, Rr = 20, T = 20, B = 56, step = pts.length > 1 ? (W - L - Rr) / (pts.length - 1) : 0;
        const X0 = (i) => L + step * i, Y0 = (v) => T + (H - T - B) * (1 - (v - min) / span);
        svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', class: 'ex-svg', 'aria-label': ex.title },
          sv('title', {}, ex.title), sv('line', { x1: L, y1: Y0(min), x2: W - Rr, y2: Y0(min), class: 'ex-axis' }), sv('line', { x1: L, y1: T, x2: L, y2: Y0(min), class: 'ex-axis' }),
          sv('text', { x: L - 8, y: Y0(max) + 4, 'text-anchor': 'end', class: 'ex-tick' }, fmt(max)), sv('text', { x: L - 8, y: Y0(min) + 4, 'text-anchor': 'end', class: 'ex-tick' }, fmt(min)),
          sv('polyline', { points: pts.map((p, i) => X0(i) + ',' + Y0(p.value)).join(' '), class: 'ex-line', fill: 'none' }),
          pts.map((p, i) => [sv('circle', { cx: X0(i), cy: Y0(p.value), r: 4, class: 'ex-dot' }), pts.length <= 14 ? sv('text', { x: X0(i), y: Y0(p.value) - 9, 'text-anchor': 'middle', class: 'ex-val' }, fmt(p.value)) : null,
            (pts.length <= 14 || i % Math.ceil(pts.length / 12) === 0) ? sv('text', { x: X0(i), y: H - B + 20, 'text-anchor': 'middle', class: 'ex-tick' }, clip(p.label, 12)) : null]),
          ch.yLabel ? sv('text', { x: L, y: 12, class: 'ex-axislabel' }, ch.yLabel + (r.unit ? ' (' + r.unit + ')' : '')) : null);
      } else { // bar and share: HTML bars, so labels keep a readable size at any width (the data table below is the accessible form)
        const tot = pts.reduce((t, p) => t + Math.max(0, p.value), 0) || 1;
        const pct = (v) => Math.max(1, (ch.kind === 'share' ? Math.max(0, v) / tot : Math.max(0, v) / (max || 1)) * 100);
        svg = h('div', { class: 'ex-bars', role: 'img', 'aria-label': ex.title + '. ' + pts.map((p) => p.label + ' ' + fmt(p.value) + (ch.kind === 'share' ? '%' : '')).join('; ') },
          h('p', { class: 'ex-axislabel', 'aria-hidden': 'true' }, ch.kind === 'share' ? 'Share of total (%)' : (ch.yLabel || 'Value') + (r.unit ? ' (' + r.unit + ')' : '')),
          pts.map((p) => h('div', { class: 'ex-barrow', 'aria-hidden': 'true' }, h('span', { class: 'ex-cat', title: p.label }, p.label),
            h('span', { class: 'ex-track' }, h('span', { class: 'ex-barfill', style: 'width:' + pct(p.value).toFixed(1) + '%' })), h('span', { class: 'ex-val' }, fmt(p.value) + (ch.kind === 'share' ? '%' : '')))));
      }
    }
    if (svg && svg.tagName === 'svg') svg = h('div', { class: 'ex-svgwrap' }, svg);
    const showBtn = h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': 'false', onclick: () => { const on = dataTable.classList.toggle('sr-only') === false; showBtn.setAttribute('aria-expanded', String(on)); showBtn.textContent = on ? 'Hide the data' : 'Show the data'; } }, 'Show the data');
    return h('figure', { class: 'ex-chart' },
      svg || h('p', { class: 'ex-empty', role: 'status' }, 'No values could be plotted from the supplied data. See the list below.'),
      h('figcaption', {},
        h('p', { class: 'ex-summary' }, !pts.length ? '' : (() => {
          const lo = pts.reduce((a, p) => (p.value < a.value ? p : a)), hi = pts.reduce((a, p) => (p.value > a.value ? p : a));
          return 'The chart shows ' + pts.length + ' ' + (ch.xLabel || 'categories').toLowerCase() + ' value' + (pts.length === 1 ? '' : 's') + (lo.value === hi.value ? '. Every value is ' + fmt(lo.value) + unit + '.' : ': lowest ' + clip(lo.label, 40) + ' (' + fmt(lo.value) + unit + '), highest ' + clip(hi.label, 40) + ' (' + fmt(hi.value) + unit + ').');
        })()),
        h('p', { class: 'ex-method' }, h('b', {}, 'How it was computed. '), r.formula + '. Source: Exhibit ' + r.source + ', ' + r.used + ' of ' + r.total + ' rows used. Computed from the data exactly as supplied; it has not been cleaned.'),
        r.excluded.length ? h('div', { class: 'ex-excl' }, h('p', {}, h('b', {}, r.excluded.length + ' item' + (r.excluded.length === 1 ? ' is' : 's are') + ' not plotted. '), 'Nothing was estimated or filled in.'),
          h('ul', { class: 'plain' }, r.excluded.slice(0, 12).map((e) => h('li', {}, (e.ref ? e.ref + ': ' : '') + e.reason)), r.excluded.length > 12 ? h('li', {}, 'and ' + (r.excluded.length - 12) + ' more') : null)) : null,
        showBtn, dataTable));
  }

  /* ---- one exhibit ---- */
  function exhibitEl(ex, list) {
    const body = ex.type === 'table' ? [h('div', { class: 'ex-tools' }, h('button', { class: 'linkbtn', type: 'button', onclick: () => focusTable(ex) }, 'Expand table')), tableEl(ex), csvBar(ex)] : ex.type === 'document' ? [documentEl(ex)] : ex.type === 'timeline' ? [timelineEl(ex)] : [chartEl(ex, list)];
    let src = null;
    if (ex.type === 'chart') src = list.find((x) => x.id === ex.chart.calc.from);
    return h('article', { class: 'ex-plate', 'aria-labelledby': 'ex-t-' + ex.id },
      h('header', { class: 'ex-head' },
        h('span', { class: 'ex-letter', 'aria-hidden': 'true' }, ex.id),
        h('div', {}, h('h3', { class: 'ex-title', id: 'ex-t-' + ex.id }, h('span', { class: 'sr-only' }, 'Exhibit ' + ex.id + ': '), ex.title),
          ex.purpose ? h('p', { class: 'ex-purpose' }, ex.purpose) : null,
          h('p', { class: 'ex-prov' }, h('span', { class: 'ex-kind' }, TYPE_NAME[ex.type]), ex.source ? h('span', {}, ex.source) : null,
            ex.fictional ? h('span', { class: 'ex-tag' }, 'Fictional data for this exercise') : null, ex.origin === 'user' ? h('span', { class: 'ex-tag ex-mine' }, 'Added by you') : null))),
      ...body, src && ex.chart.calc.fn !== 'none' ? h('div', { class: 'ex-actions' }, h('button', { class: 'linkbtn', type: 'button', onclick: () => { const el = document.getElementById('ex-nav-' + src.id); if (el) el.click(); } }, 'Open the source data (Exhibit ' + src.id + ')')) : null);
  }

  /* ---- the navigator plus the open exhibit ---- */
  // o: { key } remembers the open exhibit for this visit. Returns a DOM node.
  function packet(list, o) {
    o = o || {}; const mem = (S.ui.exh = S.ui.exh || {});
    let cur = list.find((x) => x.id === mem[o.key]) || list[0];
    const panel = h('div', { class: 'ex-panel', id: 'ex-panel', role: 'tabpanel', tabindex: '-1' });
    const tabs = h('div', { class: 'ex-nav', role: 'tablist', 'aria-label': 'Exhibits in this packet' });
    const btns = list.map((ex) => h('button', { type: 'button', role: 'tab', class: 'ex-tab', id: 'ex-nav-' + ex.id, 'aria-controls': 'ex-panel',
      onclick: () => open(ex), onkeydown: (e) => { const i = list.indexOf(ex), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1; if (j >= 0 && list[j]) { e.preventDefault(); open(list[j]); btns[j].focus(); } } },
      h('span', { class: 'ex-tab-l' }, ex.id), h('span', { class: 'ex-tab-t' }, ex.title)));
    tabs.append(...btns);
    function open(ex) { cur = ex; if (o.key) mem[o.key] = ex.id; btns.forEach((b, i) => { const on = list[i] === ex; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); panel.setAttribute('aria-labelledby', 'ex-nav-' + ex.id); panel.replaceChildren(exhibitEl(ex, list)); }
    open(cur);
    return h('section', { class: 'ex-packet', 'aria-label': 'Exhibits' }, list.length > 1 ? tabs : null, panel);
  }

  /* ---- the assignment's Materials panel: status, packet, build / upgrade with preview ---- */
  const flow = new Map(); // assignment id -> { phase: 'busy'|'preview'|'error', draft, notes, error } (this visit only; nothing here is saved until Approve)
  const textOf = (list) => list.map((e) => JSON.stringify(e.table ? e.table.rows.map((r) => Object.values(r.cells)) : e.document ? [e.document.meta, e.document.blocks] : e.timeline ? e.timeline.events : '')).join(' ').replace(/,(?=\d{3})/g, '');
  // Figures already stated in the existing text (numbers of 2+ digits) that the draft does not contain. A deterministic aid for the preview, not a guarantee.
  function missingFigures(a, draft) {
    const have = textOf(draft.exhibits), found = (a.materials || '').replace(/,(?=\d{3})/g, '').match(/\d[\d.]*\d%?|\d{2,}/g) || [];
    const uniq = [...new Set(found)].filter((x) => x.length >= 2); return { total: uniq.length, missing: uniq.filter((x) => !have.includes(x.replace(/%$/, ''))) };
  }

  function panel(c, m, a) {
    const ex = a.exhibits || [], st = flow.get(a.id) || {}, pk = a.packet, nodes = [];
    const ready = S.ai && S.ai.ready && S.ai.ready();
    const rerender = () => S.render(false);
    const request = async (notes) => {
      if (!ready) { S.toast('Add the AI service address and access code first (Data & Backup, AI).'); return; }
      flow.set(a.id, { phase: 'busy', notes }); rerender();
      try { const draft = await S.ai.draftPacket(c, m, a, { notes }); flow.set(a.id, { phase: 'preview', draft, notes }); }
      catch (e) { flow.set(a.id, { phase: 'error', error: e.message, notes }); }
      rerender();
    };
    if (st.phase === 'busy') { nodes.push(h('div', { class: 'ex-banner', role: 'status' }, h('p', {}, h('b', {}, 'Building the exhibits… '), 'This can take a minute. Nothing is saved until you approve it.'))); return nodes; }
    if (st.phase === 'preview') {
      const d = st.draft, fig = a.materials ? missingFigures(a, d) : null, upgrade = !ex.length && !!a.materials, miss = (fig && fig.missing) || [], needAck = !!(miss.length || a.work); let approve = null;
      nodes.push(h('div', { class: 'ex-banner', role: 'region', 'aria-label': 'Preview of proposed exhibits' },
        h('p', {}, h('b', {}, 'Preview. '), 'These exhibits are not saved yet. Approving them adds a packet to this assignment. Your instructions, steps, grading criteria, supplied text' + (a.work ? ', submitted work, grade and feedback' : '') + ' are not changed.'),
        a.work ? h('p', {}, h('b', {}, 'You have already submitted work. '), 'It was written against the original text. Check that these exhibits match what you used. Existing feedback and grades will not change.') : null,
        fig && fig.total ? h('p', {}, 'Figures from your existing materials: ' + (fig.total - fig.missing.length) + ' of ' + fig.total + ' appear in the exhibits' + (fig.missing.length ? '. Not found: ' + fig.missing.slice(0, 8).join(', ') + '. Check whether that matters.' : '.')) : null));
      if (d.dropped.length) nodes.push(h('div', { class: 'ex-banner warn' }, h('p', {}, h('b', {}, d.dropped.length + ' exhibit' + (d.dropped.length === 1 ? ' was' : 's were') + ' rejected by the checks and ' + (d.dropped.length === 1 ? 'is' : 'are') + ' not shown. '), 'Nothing was repaired or filled in.'), h('ul', { class: 'plain' }, d.dropped.slice(0, 6).map((x) => h('li', {}, (x.id ? 'Exhibit ' + x.id + ' ' : '') + '“' + x.title + '”: ' + x.reason)))));
      nodes.push(d.exhibits.length ? packet(d.exhibits, { key: 'draft-' + a.id }) : h('p', { class: 'empty' }, 'No exhibit passed the checks. You can try again.'));
      const notes = h('textarea', { rows: '2', 'aria-label': 'Notes for the AI when regenerating', placeholder: 'Optional notes for another try, for example: make the dataset messier, add a landlord table, shorten the memo.', style: 'width:100%;margin-top:.8rem' }, st.notes || '');
      if (needAck) nodes.push(h('div', { class: 'ex-banner warn', role: 'region', 'aria-label': 'Differences from the original text' }, h('p', {}, h('b', {}, miss.length ? 'These exhibits do not fully match your original text. ' : 'You have already submitted work on this assignment. '), (miss.length ? miss.length + ' figure' + (miss.length === 1 ? '' : 's') + ' from the original (' + miss.slice(0, 8).join(', ') + (miss.length > 8 ? ', …' : '') + ') could not be found in them. ' : 'Please confirm the exhibits match the material you worked from. ') + 'If you approve, the exhibits become what the assignment shows, but your original text is kept and stays available under the exhibits, and nothing is deleted. Do not approve if your submitted work or grade depends on the original figures.'),
        h('label', { class: 'consent' }, h('input', { type: 'checkbox', onchange: (e) => { if (approve) approve.disabled = !d.exhibits.length || !e.target.checked; } }), h('span', {}, 'I have compared them and want these exhibits to replace the original presentation.'))));
      nodes.push(h('div', { class: 'ex-bar-actions' },
        (approve = h('button', { class: 'btn', type: 'button', disabled: !d.exhibits.length || needAck, onclick: () => { try { const state = S.ai.savePacket(c, a, d, { upgraded: upgrade }); flow.delete(a.id); S.toast(state === 'ready' ? 'Exhibits added.' : 'Exhibits added, but the packet is still marked incomplete.'); S.commit(); } catch (e) { S.toast(e.message); } } }, 'Approve and add these exhibits')),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => request(notes.value.trim().slice(0, 400)) }, 'Regenerate'),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { flow.delete(a.id); rerender(); } }, 'Discard')), notes);
      return nodes;
    }
    if (st.phase === 'error') nodes.push(h('div', { class: 'ex-banner warn', role: 'alert' }, h('p', {}, h('b', {}, 'The exhibits could not be built. '), st.error), h('button', { class: 'linkbtn', type: 'button', onclick: () => { flow.delete(a.id); rerender(); } }, 'Dismiss')));
    const needs = S.exhibits.needsPacket(a), status = S.exhibits.packetStatus(a);
    if (ex.length) {
      if (pk && (pk.state === 'incomplete' || status === 'incomplete')) nodes.push(h('div', { class: 'ex-banner warn', role: 'status' }, h('p', {}, h('b', {}, 'This materials packet is incomplete. '), (pk && pk.note) || 'An exhibit that the instructions refer to is missing.'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => request('') }, 'Rebuild the exhibits with AI')));
      nodes.push(packet(ex, { key: a.id }));
      nodes.push(h('div', { class: 'ex-actions' },
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { const n = window.prompt('Anything to change? For example: add a second table, make the data messier. Leave blank to rebuild as before.'); if (n !== null) request(n.trim().slice(0, 400)); } }, 'Rebuild or customize with AI'),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { if (window.confirm('Remove this packet? Your instructions, supplied text and any submitted work are not affected.')) { S.ai.removePacket(a); S.toast('Exhibits removed.'); S.commit(); } } }, 'Remove the exhibits')));
    } else if (needs || (pk && pk.state)) {
      nodes.push(h('div', { class: 'ex-banner warn', role: 'status' }, h('p', {}, h('b', {}, 'The exhibits for this assignment have not been built. '), (pk && pk.note) || 'The assignment refers to supplied materials, such as a document or data, that are not here yet.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => request('') }, 'Build the exhibits with AI')));
    } else if (!a.realEvidence && a.kind !== 'learn' && a.basis !== 'readings') {
      nodes.push(h('div', { class: 'ex-banner' }, h('p', {}, h('b', {}, 'Upgrade to an evidence packet. '), 'The AI can add documents, tables, timelines and charts to this assignment. You see a preview first, and only your approval saves anything. Nothing you wrote or submitted is changed.'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => request('') }, 'Preview an evidence packet')));
    }
    return nodes;
  }

  // "Exhibit A, row A-7, Landlord": where in the evidence packet a finding points (the Worker has already checked that it exists).
  const refLine = (f) => (f && f.ref && f.ref.exhibit ? h('p', { class: 'small rv-ref' }, h('b', {}, 'Related exhibit location: '), (/^U\d/.test(f.ref.exhibit) ? 'Your data, exhibit ' : 'Exhibit ') + f.ref.exhibit + (f.ref.row ? ', ' + (/-b\d/.test(f.ref.row) ? 'paragraph ' : 'row ') + f.ref.row : '') + (f.ref.column ? ', ' + f.ref.column : '')) : null);
  S.exhibitsView = { refLine, packet, exhibitEl, download, panel };
})(window.Sovereign = window.Sovereign || {});
