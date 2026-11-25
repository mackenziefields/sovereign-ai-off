/* sovereign. — Evidence packets: the data side (no DOM). Loaded before store.js.
   An assignment can carry a packet of exhibits (S.exhibits): tables, timelines, documents and charts. Everything here is plain data.
   Rules this file enforces:
   - Values are kept exactly as written. Nothing is cleaned, deduplicated, trimmed or corrected.
   - Charts are recipes computed from table data at render time. Unreadable or unmatched values are excluded and listed, never estimated.
   - Spreadsheet-safe formatting exists only in the CSV export. Stored data is never changed by it.
   The limits below are PROTOTYPE limits. Override any of them by setting S.EXHIBIT_LIMITS in js/config.js (the Worker has matching settings). */
(function (S) {
  'use strict';
  const DEFAULTS = { exhibits: 6, columns: 12, rows: 80, packetRows: 200, cell: 120, events: 40, docWords: 1800, docBlocks: 60, points: 60, meta: 8 };
  // Hard ceilings: a configuration typo can never create an unbounded packet. Stored data is read against these, not the (smaller) generation limits.
  const CEIL = { exhibits: 6, columns: 20, rows: 500, packetRows: 1500, cell: 500, events: 200, docWords: 8000, docBlocks: 300, points: 200, meta: 12 };
  const limits = () => { const o = {}, c = (S.config && S.config.exhibitLimits) || {}; Object.keys(DEFAULTS).forEach((k) => { const v = Number(c[k]); o[k] = Number.isFinite(v) && v >= 1 ? Math.min(CEIL[k], Math.floor(v)) : DEFAULTS[k]; }); return o; };

  const TYPES = ['table', 'timeline', 'document', 'chart'];
  const DOC_KINDS = ['article', 'memo', 'policy', 'transcript', 'correspondence', 'report', 'case-file', 'notes', 'other'];
  const BLOCKS = ['heading', 'paragraph', 'list', 'quote', 'turn', 'note', 'rule'];
  const COL_KINDS = ['text', 'number', 'date', 'percent', 'currency'];
  const FNS = ['none', 'count', 'sum', 'mean', 'median', 'percent', 'rate'];
  const LETTERS = 'ABCDEF';
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const str = (v, n) => (v == null ? '' : String(v)).slice(0, n); // plain slice at a hard ceiling only; stored cells are never trimmed or edited
  const words = (t) => (String(t).match(/\S+/g) || []).length;

  /* ---- reading numbers (strict; the same rule everywhere) ---- */
  // Accepts 1200, 1,200, -3.5, and $ / % only when the column says currency / percent. Anything else ("about 40", "N/A", "", "1.2k") is unreadable.
  function parseNumber(s, kind) {
    let t = String(s == null ? '' : s).trim(); if (!t) return null;
    if (kind === 'currency') t = t.replace(/^(-?)\$/, '$1'); else if (kind === 'percent') t = t.replace(/%$/, '');
    return /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t) ? Number(t.replace(/,/g, '')) : null;
  }

  /* ---- sanitizing ---- */
  const KEY = /^[a-z][a-z0-9_]{0,23}$/;
  function normTable(t, ex, L, strict, why) {
    t = obj(t); const cols = [], seen = new Set();
    arr(t.columns, L.columns + (strict ? 1 : 0)).forEach((c) => { c = obj(c); const key = str(c.key, 24); if (KEY.test(key) && !seen.has(key)) { seen.add(key); cols.push({ key, label: str(c.label, 80) || key, kind: COL_KINDS.includes(c.kind) ? c.kind : 'text', unit: str(c.unit, 30) }); } });
    if (strict && Array.isArray(t.columns) && t.columns.length > L.columns) { why('more than ' + L.columns + ' columns'); return null; }
    if (!cols.length) { why('no usable columns'); return null; }
    if (strict && Array.isArray(t.rows) && t.rows.length > L.rows) { why('more than ' + L.rows + ' rows'); return null; }
    const rows = arr(t.rows, L.rows).map((r, i) => {
      r = obj(r); const src = obj(r.cells), cells = {};
      for (const c of cols) { const v = src[c.key]; cells[c.key] = v == null ? '' : typeof v === 'object' ? '' : String(v); }
      return { id: ex + '-' + (i + 1), cells };
    });
    if (strict) for (const r of rows) for (const c of cols) if (r.cells[c.key].length > L.cell) { why('a cell is longer than ' + L.cell + ' characters (' + r.id + ', ' + c.label + ')'); return null; }
    for (const r of rows) for (const c of cols) r.cells[c.key] = r.cells[c.key].slice(0, CEIL.cell);
    return { columns: cols, rows };
  }
  function normTimeline(t, ex, L, strict, why) {
    t = obj(t); if (strict && Array.isArray(t.events) && t.events.length > L.events) { why('more than ' + L.events + ' events'); return null; }
    const events = arr(t.events, L.events).map((e, i) => { e = obj(e); return { id: ex + '-' + (i + 1), date: str(e.date, 60), label: str(e.label, 200), detail: str(e.detail, 600) }; }).filter((e) => e.label || e.date);
    if (!events.length) { why('no events'); return null; }
    return { events };
  }
  function normDocument(d, ex, L, strict, why) {
    d = obj(d); if (!DOC_KINDS.includes(d.kind)) d = { ...d, kind: 'other' };
    const blocks = []; let tooLong = false;
    arr(d.blocks, strict ? L.docBlocks + 1 : CEIL.docBlocks).forEach((b) => {
      b = obj(b); const t = b.t;
      if (strict && String(b.text || '').length > ({ heading: 200, paragraph: 4000, quote: 2000, turn: 3000, note: 400 }[t] || 1e9)) tooLong = true; // rejected below, never cut short
      if (!BLOCKS.includes(t)) return;
      const o = { t };
      if (t === 'heading') { o.level = b.level === 3 ? 3 : 2; o.text = str(b.text, 200); if (!o.text) return; }
      else if (t === 'paragraph') { o.text = str(b.text, 4000); if (!o.text) return; }
      else if (t === 'list') { o.ordered = b.ordered === true; o.items = arr(b.items, 30).map((x) => str(x, 600)).filter(Boolean); if (!o.items.length) return; }
      else if (t === 'quote') { o.text = str(b.text, 2000); o.by = str(b.by, 120); if (!o.text) return; }
      else if (t === 'turn') { o.who = str(b.who, 80); o.text = str(b.text, 3000); if (!o.text) return; }
      else if (t === 'note') { o.label = str(b.label, 60); o.text = str(b.text, 400); if (!o.label && !o.text) return; }
      blocks.push(o);
    });
    if (strict && arr(d.blocks, 100000).length > L.docBlocks) { why('more than ' + L.docBlocks + ' blocks'); return null; }
    if (tooLong) { why('a paragraph, heading, quote or turn is longer than its limit'); return null; }
    blocks.forEach((b, i) => { b.id = ex + '-b' + (i + 1); });
    const total = blocks.reduce((n, b) => n + words([b.text, b.items && b.items.join(' '), b.who].filter(Boolean).join(' ')), 0);
    if (!blocks.length) { why('the document has no readable content'); return null; }
    if (strict && total > L.docWords) { why('the document is about ' + total + ' words (limit ' + L.docWords + ')'); return null; }
    return { kind: d.kind, meta: arr(d.meta, L.meta).map((m) => { m = obj(m); return { label: str(m.label, 40), value: str(m.value, 200) }; }).filter((m) => m.label && m.value), blocks };
  }
  function normChart(c, byId, why) {
    c = obj(c); const k = obj(c.calc);
    if (!['bar', 'line', 'share'].includes(c.kind)) { why('unknown chart kind'); return null; }
    if (!FNS.includes(k.fn)) { why('unknown calculation'); return null; }
    const src = byId[k.from]; if (!src || !src.table) { why('the chart’s source exhibit ' + str(k.from, 4) + ' is not a table in this packet'); return null; }
    const has = (ex, key) => !!ex.table.columns.find((x) => x.key === key);
    if (!has(src, k.x)) { why('the chart’s category column does not exist'); return null; }
    if (['sum', 'mean', 'median', 'none'].includes(k.fn) && !has(src, k.y)) { why('the chart’s value column does not exist'); return null; }
    if (k.fn === 'percent' && k.y && !has(src, k.y)) { why('the chart’s value column does not exist'); return null; }
    const out = { fn: k.fn, from: k.from, x: k.x, y: k.y && has(src, k.y) ? k.y : '' };
    if (k.fn === 'rate') {
      const p = obj(k.per), den = byId[p.from];
      if (!den || !den.table || !has(den, p.join) || (p.agg !== 'count' && !has(den, p.col))) { why('the rate’s denominator exhibit or columns do not exist'); return null; }
      if (k.numAgg !== 'count' && !out.y) { why('the rate’s numerator column does not exist'); return null; }
      out.per = { from: p.from, col: p.agg === 'count' ? '' : p.col, join: p.join, agg: p.agg === 'count' ? 'count' : 'sum', scale: [1, 100, 1000, 100000].includes(Number(p.scale)) ? Number(p.scale) : 100, label: str(p.label, 80) };
      out.numAgg = k.numAgg === 'count' ? 'count' : 'sum';
    }
    return { kind: c.kind, calc: out, xLabel: str(c.xLabel, 80), yLabel: str(c.yLabel, 80), unit: str(c.unit, 40), method: str(c.method, 300) };
  }

  // strict=false: reading saved data (hard ceilings only). strict=true: checking something just generated or imported against the configured limits.
  // Returns { exhibits, dropped:[{id,title,reason}] }.
  function sanitize(list, o) {
    o = o || {}; const strict = o.strict === true, L = strict ? limits() : CEIL, dropped = [];
    const raw = arr(list, strict ? 40 : CEIL.exhibits), kept = [], used = new Set();
    let packetRows = 0;
    raw.forEach((e, i) => {
      e = obj(e); const title = str(e.title, 120) || 'Untitled exhibit';
      let id = LETTERS.includes(str(e.id, 1)) && str(e.id, 2).length === 1 && !used.has(e.id) ? e.id : LETTERS.split('').find((x) => !used.has(x));
      const why = (r) => dropped.push({ id: id || '?', title, reason: r });
      if (!id || kept.length >= L.exhibits) { dropped.push({ id: '?', title, reason: 'more than ' + L.exhibits + ' exhibits' }); return; }
      if (!TYPES.includes(e.type)) { why('unknown exhibit type'); return; }
      const out = { id, origin: e.origin === 'user' ? 'user' : 'supplied', type: e.type, title, source: str(e.source, 200), fictional: strict ? o.fictional !== false : e.fictional === true, purpose: str(e.purpose, 300) };
      if (e.type === 'table') { const t = normTable(e.table, id, L, strict, why); if (!t) return; packetRows += t.rows.length; out.table = t; }
      else if (e.type === 'timeline') { const t = normTimeline(e.timeline, id, L, strict, why); if (!t) return; out.timeline = t; }
      else if (e.type === 'document') { const d = normDocument(e.document, id, L, strict, why); if (!d) return; out.document = d; }
      else out.chart = e.chart; // resolved after every table is known
      if (e.file && typeof e.file === 'object' && e.file.fileId) out.file = { fileId: str(e.file.fileId, 60), name: str(e.file.name, 200), size: Number(e.file.size) || 0 };
      used.add(id); kept.push(out);
    });
    if (strict && packetRows > L.packetRows) { dropped.push({ id: '', title: 'Packet', reason: 'more than ' + L.packetRows + ' table rows in all' }); return { exhibits: [], dropped }; }
    const byId = {}; kept.forEach((x) => { byId[x.id] = x; });
    const final = [];
    kept.forEach((x) => {
      if (x.type !== 'chart') { final.push(x); return; }
      const c = normChart(x.chart, byId, (r) => dropped.push({ id: x.id, title: x.title, reason: r }));
      if (c) { x.chart = c; final.push(x); } else delete byId[x.id];
    });
    return { exhibits: final, dropped };
  }

  /* ---- the calculation engine for charts ---- */
  const byIdOf = (list, id) => list.find((x) => x.id === id);
  const colOf = (ex, key) => ex.table.columns.find((c) => c.key === key);
  // compute(exhibits, chartExhibit) -> { points:[{label,value,n}], excluded:[{ref,reason}], used, total, formula, unit }
  function compute(list, ex) {
    const ch = ex.chart, k = ch.calc, src = byIdOf(list, k.from), excluded = [], groups = new Map();
    const xc = colOf(src, k.x), yc = k.y ? colOf(src, k.y) : null;
    const num = (row, col) => parseNumber(row.cells[col.key], col.kind);
    let used = 0;
    for (const row of src.table.rows) {
      const label = row.cells[k.x];
      if (label === '') { excluded.push({ ref: row.id, reason: 'no ' + xc.label }); continue; }
      let v = null;
      if (yc && !(k.fn === 'count' || (k.fn === 'percent' && !yc) || (k.fn === 'rate' && k.numAgg === 'count'))) {
        v = num(row, yc);
        if (v === null) { excluded.push({ ref: row.id, reason: yc.label + ' “' + row.cells[k.y] + '” is not a readable number' }); continue; }
      }
      if (!groups.has(label)) groups.set(label, { vals: [], rows: 0 });
      const g = groups.get(label); g.rows++; if (v !== null) g.vals.push(v); used++;
    }
    const sum = (a) => a.reduce((t, x) => t + x, 0);
    const median = (a) => { const s = a.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    let points = [], formula = '', unit = ch.unit || (yc && yc.unit) || '';
    const labelOf = (c) => (c ? c.label : '');
    if (k.fn === 'none') { points = [...groups].map(([label, g]) => ({ label, value: g.vals[0], n: g.rows })); formula = 'Each row’s ' + labelOf(yc) + ' as supplied'; }
    else if (k.fn === 'count') { points = [...groups].map(([label, g]) => ({ label, value: g.rows, n: g.rows })); formula = 'Number of rows for each ' + labelOf(xc); unit = unit || 'rows'; }
    else if (k.fn === 'sum') { points = [...groups].map(([label, g]) => ({ label, value: sum(g.vals), n: g.rows })); formula = 'Sum of ' + labelOf(yc) + ' for each ' + labelOf(xc); }
    else if (k.fn === 'mean') { points = [...groups].map(([label, g]) => ({ label, value: sum(g.vals) / g.vals.length, n: g.rows })); formula = 'Mean of ' + labelOf(yc) + ' for each ' + labelOf(xc); }
    else if (k.fn === 'median') { points = [...groups].map(([label, g]) => ({ label, value: median(g.vals), n: g.rows })); formula = 'Median of ' + labelOf(yc) + ' for each ' + labelOf(xc) + ' (with an even count, the average of the two middle values)'; }
    else if (k.fn === 'percent') {
      const base = [...groups].map(([label, g]) => ({ label, v: yc ? sum(g.vals) : g.rows, n: g.rows })), total = sum(base.map((b) => b.v));
      if (total > 0) points = base.map((b) => ({ label: b.label, value: b.v / total * 100, n: b.n })); else excluded.push({ ref: '', reason: 'the total is zero, so no percentage can be computed' });
      formula = 'Each ' + labelOf(xc) + '’s ' + (yc ? 'sum of ' + labelOf(yc) : 'row count') + ' ÷ the total (' + total.toLocaleString() + ') × 100'; unit = '%';
    } else if (k.fn === 'rate') {
      const den = byIdOf(list, k.per.from), dj = colOf(den, k.per.join), dc = k.per.col ? colOf(den, k.per.col) : null, dm = new Map();
      for (const row of den.table.rows) {
        const key = row.cells[k.per.join]; if (key === '') continue;
        let v = 1; if (dc) { v = parseNumber(row.cells[dc.key], dc.kind); if (v === null) { excluded.push({ ref: row.id, reason: dc.label + ' “' + row.cells[dc.key] + '” is not a readable number' }); continue; } }
        dm.set(key, (dm.get(key) || 0) + v);
      }
      for (const [label, g] of groups) {
        const numr = k.numAgg === 'count' ? g.rows : sum(g.vals), d = dm.get(label);
        if (d === undefined) { excluded.push({ ref: '', reason: '“' + label + '” has no matching ' + dj.label + ' in Exhibit ' + den.id }); continue; }
        if (d === 0) { excluded.push({ ref: '', reason: '“' + label + '” has a denominator of zero' }); continue; }
        points.push({ label, value: numr / d * k.per.scale, n: g.rows });
      }
      formula = (k.numAgg === 'count' ? 'Row count' : 'Sum of ' + labelOf(yc)) + ' for each ' + labelOf(xc) + ' ÷ ' + (dc ? 'sum of ' + dc.label : 'row count') + ' in Exhibit ' + den.id + ' (matched on exactly equal ' + labelOf(dj) + ' values) × ' + k.per.scale; unit = ch.unit || k.per.label || '';
    }
    return { points: points.filter((p) => Number.isFinite(p.value)), excluded, used, total: src.table.rows.length, formula, unit, source: src.id };
  }

  /* ---- CSV ---- */
  const needsGuard = (s) => /^[=+@\t\r]/.test(s) || (/^-/.test(s) && parseNumber(s, 'text') === null);
  const q = (s) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  // safe=true writes a leading apostrophe on cells a spreadsheet could run as a formula. The stored data is not touched.
  function toCsv(ex, o) {
    o = o || {}; const safe = o.safe === true; let guarded = 0;
    const f = (s) => { s = String(s); if (safe && needsGuard(s)) { guarded++; return q("'" + s); } return q(s); };
    const head = (o.rowIds === false ? [] : ['row_id']).concat(ex.table.columns.map((c) => c.label));
    const lines = [head.map(f).join(',')];
    ex.table.rows.forEach((r) => lines.push((o.rowIds === false ? [] : [r.id]).concat(ex.table.columns.map((c) => r.cells[c.key])).map(f).join(',')));
    return { text: '﻿' + lines.join('\r\n') + '\r\n', guarded };
  }
  // The reverse, used by tests to prove an exact-values export reads back to the stored strings.
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, ''); const rows = []; let row = [], cur = '', inq = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inq) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
      else if (c === '"') inq = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* ---- which assignments need a packet ---- */
  // Deterministic rule: AI-built, not a reading task, not real-evidence, and built on a scenario or portfolio basis.
  const needsPacket = (a) => !!a && a.origin === 'ai' && !a.realEvidence && a.kind !== 'learn' && (a.basis === 'scenario' || a.basis === 'portfolio');
  // A required packet is 'ready' only when it holds at least one valid exhibit; an exhibit the text points at must exist.
  function packetStatus(a) {
    const ex = (a && a.exhibits) || [];
    if (!needsPacket(a) && !ex.length) return 'none';
    if (!ex.length) return 'incomplete';
    const text = [a.description, (a.parts || []).map((p) => p.title + ' ' + p.questions.join(' ')).join(' ')].join(' ');
    const cited = [...text.matchAll(/\bexhibit\s+([A-F])\b/gi)].map((m) => m[1].toUpperCase());
    return cited.some((l) => !ex.find((e) => e.id === l)) ? 'incomplete' : 'ready';
  }

  /* ---- a plain-text rendering for the AI reviewer (2C) ---- */
  // Everything the learner can see, as addressable text: [A-3] rows, [A-b2] document blocks. When the whole packet does not fit in `budget`
  // characters, each exhibit gets a fair share (small exhibits stay whole, large ones are cut to their first rows) and says "N of M shown",
  // so the reviewer is never led to think it saw more than it did. Returns { text, cut, shown:{id:[shown,total]} }.
  function asText(a, budget, opts) {
    const ex = (a && a.exhibits) || []; if (!ex.length) return { text: '', cut: 0, shown: {} };
    const intro = (opts && opts.intro) || 'EXHIBITS SUPPLIED WITH THIS ASSIGNMENT (fictional, exactly as the learner sees them; nothing has been cleaned; "(blank)" means an empty cell; ids in brackets are the app’s own row and paragraph references):';
    const parts = ex.map((e) => {
      const head = ['\nEXHIBIT ' + e.id + ' (' + e.type + '): ' + e.title + (e.source ? ' — ' + e.source : '')], rows = [], tail = [];
      let noun = 'items';
      if (e.type === 'table') {
        noun = 'rows'; head.push('Columns: ' + e.table.columns.map((c) => c.label + (c.unit ? ' (' + c.unit + ')' : '')).join(' | '));
        e.table.rows.forEach((r) => rows.push('[' + r.id + '] ' + e.table.columns.map((c) => c.label + '=' + (r.cells[c.key] === '' ? '(blank)' : r.cells[c.key])).join(' | ')));
      } else if (e.type === 'document') {
        e.document.meta.forEach((m) => head.push(m.label + ': ' + m.value));
        e.document.blocks.forEach((b) => { const t = b.t === 'list' ? b.items.map((x, i) => (b.ordered ? i + 1 + '. ' : '- ') + x).join(' ') : b.t === 'rule' ? '---' : (b.who ? b.who + ': ' : b.label ? b.label + ': ' : '') + (b.text || ''); rows.push('[' + b.id + '] ' + t); });
      } else if (e.type === 'timeline') {
        e.timeline.events.forEach((v) => rows.push('[' + v.id + '] ' + v.date + ': ' + v.label + (v.detail ? '. ' + v.detail : '')));
      } else {
        noun = 'values'; const r = compute(ex, e); head.push('Computed from Exhibit ' + r.source + ' by the app: ' + r.formula + '.');
        r.points.forEach((p) => rows.push(p.label + ': ' + Math.round(p.value * 1000) / 1000 + (r.unit ? ' ' + r.unit : '')));
        r.excluded.slice(0, 6).forEach((x) => tail.push('Not plotted: ' + (x.ref ? x.ref + ': ' : '') + x.reason));
      }
      const size = (l) => l.reduce((t, x) => t + x.length + 1, 0);
      return { e, head, rows, tail, noun, fixed: size(head) + size(tail) + 90 };
    });
    // water-filling: exhibits that fit within an equal share keep everything; the unused room goes to the larger ones
    let left = budget - intro.length, pending = parts.slice().sort((x, y) => (x.fixed + x.rows.reduce((t, r) => t + r.length + 1, 0)) - (y.fixed + y.rows.reduce((t, r) => t + r.length + 1, 0)));
    pending.forEach((p, i) => { const share = Math.floor(left / (pending.length - i)); const full = p.fixed + p.rows.reduce((t, r) => t + r.length + 1, 0); p.allow = Math.min(full, Math.max(share, 0)); left -= p.allow; });
    const out = [intro], shown = {}; let cut = 0;
    for (const p of parts) {
      let room = p.allow - p.fixed; const lines = [];
      if (room < 0) { cut++; shown[p.e.id] = [0, p.rows.length]; out.push('\nEXHIBIT ' + p.e.id + ' (' + p.e.type + '): ' + p.e.title + '\n[None of the ' + p.rows.length + ' ' + p.noun + ' of Exhibit ' + p.e.id + ' could be shown to you. Do not make claims about it.]'); continue; }
      for (const r of p.rows) { if (room - r.length - 1 < 0) break; lines.push(r); room -= r.length + 1; }
      out.push(...p.head, ...lines, ...p.tail); shown[p.e.id] = [lines.length, p.rows.length];
      if (lines.length < p.rows.length) { cut++; out.push('[Only the first ' + lines.length + ' of ' + p.rows.length + ' ' + p.noun + ' of Exhibit ' + p.e.id + ' could be shown to you. Do not make claims about the rest.]'); }
    }
    return { text: out.join('\n'), cut, shown };
  }

  /* ---- presentation rule: one representation of the evidence ---- */
  // Splits an assignment's plain-text material into paragraphs and labels each:
  //   'narrative' (scene-setting, background, an editor's note, how to use the evidence): always shown;
  //   'repeat'    (record-shaped text, e.g. rows or a pipe table, whose figures are really found in the structured exhibits): not shown a second time.
  // Prose is NEVER labelled 'repeat', even when it mentions figures. The stored text is not changed; the view keeps the original available.
  function splitMaterials(text, exhibits) {
    const paras = String(text || '').split(/\n{2,}/).map((p) => p.replace(/\s+$/, '')).filter((p) => p.trim());
    const hay = (exhibits || []).map((e) => e.table ? e.table.rows.map((r) => Object.values(r.cells).join(' ')).join(' ') : e.document ? e.document.blocks.map((b) => b.text || (b.items || []).join(' ')).join(' ') : e.timeline ? e.timeline.events.map((v) => v.date + ' ' + v.label + ' ' + (v.detail || '')).join(' ') : '').join(' ').toLowerCase().replace(/[^a-z0-9]/g, '');
    const out = paras.map((p) => {
      const lines = p.split('\n').filter((l) => l.trim());
      const recordish = lines.filter((l) => (l.match(/[|\t;]/g) || []).length >= 2 || ((l.match(/,/g) || []).length >= 2 && /\d/.test(l))).length;
      const shaped = lines.length >= 3 && recordish / lines.length >= 0.6;
      const toks = [...new Set((p.match(/[A-Za-z]*\d[\w.\-/]*/g) || []).map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '')).filter((t) => t.length >= 2))];
      const found = toks.filter((t) => hay.includes(t)).length;
      const repeat = shaped && toks.length >= 4 && found / toks.length >= 0.6;
      return { text: p, kind: repeat ? 'repeat' : 'narrative', share: toks.length ? Math.round((found / toks.length) * 100) / 100 : 0 };
    });
    return { parts: out, narrative: out.filter((x) => x.kind === 'narrative'), repeats: out.filter((x) => x.kind === 'repeat') };
  }

  S.exhibits = { splitMaterials, asText, limits, CEIL, DEFAULTS, TYPES, DOC_KINDS, BLOCKS, COL_KINDS, FNS, parseNumber, sanitize, compute, toCsv, parseCsv, needsPacket, packetStatus, needsGuard };
})(window.Sovereign = window.Sovereign || {});
