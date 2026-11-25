/* sovereign. — Phase 2D-1: reading a learner's own CSV / Excel file into "Your data" table exhibits.
   Everything happens on this device. Nothing is sent anywhere, nothing is executed: a spreadsheet is read as data only
   (formulas are never evaluated, macros / links / images / charts are never opened). What is left out is always reported.
   This file only reads and builds exhibits. Saving them to an assignment or session is a later step (2D-2). */
(function (S) {
  'use strict';

  const DEFAULTS = { fileBytes: 5 * 1024 * 1024, sheets: 5, rows: 2000, columns: 30, cell: 300, preview: 6 };
  const CEIL = { fileBytes: 5 * 1024 * 1024, sheets: 5, rows: 2000, columns: 30, cell: 300, preview: 10 };
  const limits = () => { const o = {}, c = (S.config && S.config.importLimits) || {}; Object.keys(DEFAULTS).forEach((k) => { const v = Number(c[k]); o[k] = Number.isFinite(v) && v >= 1 ? Math.min(CEIL[k], Math.floor(v)) : DEFAULTS[k]; }); return o; };
  const KINDS = ['text', 'number', 'date', 'percent', 'currency'];
  const ext = (n) => (String(n).split('.').pop() || '').toLowerCase();
  const fail = (m) => { const e = new Error(m); e.plain = true; return e; };

  /* ---------- CSV / TSV ---------- */
  function guessDelimiter(text) {
    const head = text.split(/\r?\n/).slice(0, 8).join('\n'), count = (d) => { let n = 0, q = false; for (const c of head) { if (c === '"') q = !q; else if (!q && c === d) n++; } return n; };
    const c = [[',', count(',')], ['\t', count('\t')], [';', count(';')]].sort((a, b) => b[1] - a[1])[0];
    return c[1] > 0 ? c[0] : ',';
  }
  function parseDelimited(text, d) {
    text = String(text).replace(/^﻿/, ''); const rows = []; let row = [], cur = '', inq = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inq) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
      else if (c === '"' && cur === '') inq = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  async function decodeText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return { text: new TextDecoder('windows-1252').decode(buf), legacy: true }; }
  }

  /* ---------- XLSX (read as data only) ---------- */
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const isDateFmt = (code) => { const c = String(code || '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, ''); return /[ymdhs]/i.test(c) && !/^(general|0|#)/i.test(c.trim()); };
  const serialToIso = (n) => { if (!(n > 0 && n < 2958466)) return null; const ms = Math.round((n - (n >= 60 ? 25569 : 25568)) * 86400000), d = new Date(ms); if (isNaN(d)) return null; const p = (x) => String(x).padStart(2, '0'); const s = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); return n % 1 ? s + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) : s; };

  async function readXlsx(file, L) {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) throw fail('That file is password-protected or in an old Excel format (.xls). Remove the password or save a copy as .xlsx or CSV, then try again.');
    let zip; try { zip = S.files.unzip(await file.arrayBuffer()); } catch (e) { throw fail('That doesn’t look like a valid Excel (.xlsx) file.'); }
    if (!zip.has('xl/workbook.xml')) throw fail(zip.has('EncryptedPackage') ? 'That workbook is password-protected. Remove the password and try again.' : 'That doesn’t look like a valid Excel (.xlsx) file.');
    const dom = (x) => new DOMParser().parseFromString(x, 'application/xml'), names = zip.names(), unsupported = [];
    const has = (re) => names.some((n) => re.test(n));
    if (has(/vbaProject\.bin$/i)) unsupported.push('Macros were found and were ignored. Nothing in the workbook is run.');
    if (has(/^xl\/externalLinks\//i)) unsupported.push('Links to other workbooks were found and were ignored.');
    if (has(/^xl\/(charts|drawings)\//i)) unsupported.push('Charts or drawings were found and were not imported.');
    if (has(/^xl\/media\//i)) unsupported.push('Images were found and were not imported.');
    if (has(/^xl\/(pivotTables|pivotCache)\//i)) unsupported.push('Pivot tables were found; only the cell values shown are imported.');
    const shared = [];
    if (zip.has('xl/sharedStrings.xml')) dom(await zip.read('xl/sharedStrings.xml')).querySelectorAll('si').forEach((si) => { shared.push([...si.querySelectorAll('t')].filter((t) => !t.closest('rPh')).map((t) => t.textContent).join('')); });
    const dateXf = new Set();
    if (zip.has('xl/styles.xml')) {
      const sd = dom(await zip.read('xl/styles.xml')), fmts = {};
      sd.querySelectorAll('numFmts > numFmt').forEach((n) => { fmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
      [...sd.querySelectorAll('cellXfs > xf')].forEach((xf, i) => { const id = Number(xf.getAttribute('numFmtId')); if (BUILTIN_DATE.has(id) || (fmts[id] != null && isDateFmt(fmts[id]))) dateXf.add(i); });
    }
    const rels = {};
    if (zip.has('xl/_rels/workbook.xml.rels')) dom(await zip.read('xl/_rels/workbook.xml.rels')).querySelectorAll('Relationship').forEach((r) => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const all = [...dom(await zip.read('xl/workbook.xml')).querySelectorAll('sheet')];
    const sheets = [];
    for (const sh of all) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS(R, 'id');
      let target = (rels[rid] || '').replace(/^\/?(xl\/)?/, 'xl/');
      if (!zip.has(target)) continue;
      const doc = dom(await zip.read(target)), grid = [], stats = { formulas: 0, noValue: 0, dates: 0, merged: doc.querySelectorAll('mergeCell').length, errors: 0 };
      const formulaText = [];
      let seen = 0;
      for (const row of doc.querySelectorAll('row')) {
        seen++;
        const r = Number(row.getAttribute('r')) || seen, cells = [];
        row.querySelectorAll('c').forEach((c) => {
          const t = c.getAttribute('t'), v = c.querySelector('v'), is = c.querySelector('is'), f = c.querySelector('f');
          let val = '';
          if (t === 's') val = shared[parseInt(v && v.textContent, 10)] || '';
          else if (t === 'inlineStr' && is) val = [...is.querySelectorAll('t')].map((x) => x.textContent).join('');
          else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
          else if (v) val = v.textContent;
          if (t === 'e') stats.errors++;
          if (f) { stats.formulas++; if (!v || v.textContent === '') stats.noValue++; if (formulaText.length < 50) formulaText.push({ ref: c.getAttribute('r') || '', formula: String(f.textContent || '').slice(0, 300) }); }
          else if (!t && v && dateXf.has(Number(c.getAttribute('s')))) { const iso = serialToIso(Number(val)); if (iso) { val = iso; stats.dates++; } }
          cells[S.files.colIndex(c.getAttribute('r'))] = val;
        });
        const arr = Array.from(cells, (x) => (x == null ? '' : x));
        grid[r - 1] = arr; // keep the source row number
      }
      const dense = []; grid.forEach((arr, i) => { if (arr) dense.push({ src: i + 1, cells: arr }); });
      sheets.push({ name: sh.getAttribute('name') || 'Sheet', hidden: /hidden/i.test(sh.getAttribute('state') || ''), rows: dense, stats, formulas: formulaText });
    }
    if (!sheets.length) throw fail('No sheets with cell values were found in that Excel file.');
    return { sheets, unsupported };
  }

  /* ---------- building a table exhibit from one sheet ---------- */
  const slug = (s, i) => { let k = String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); if (!/^[a-z]/.test(k)) k = 'c' + (k ? '_' + k : i + 1); return k.slice(0, 24).replace(/_+$/, '') || 'c' + (i + 1); };
  const DATE_RE = /^(\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-[A-Za-z]{3}-\d{2,4}|[A-Za-z]{3,9} \d{1,2}, \d{4})$/;
  function guessKind(values) {
    const v = values.filter((x) => x !== ''); if (!v.length) return 'text';
    const P = S.exhibits.parseNumber;
    if (v.every((x) => P(x, 'number') !== null)) return 'number';
    if (v.every((x) => /^-?\$/.test(x.trim()) && P(x, 'currency') !== null)) return 'currency';
    if (v.every((x) => /%$/.test(x.trim()) && P(x, 'percent') !== null)) return 'percent';
    if (v.every((x) => DATE_RE.test(x.trim()))) return 'date';
    return 'text';
  }
  const isBlank = (cells) => !cells.some((x) => String(x).trim() !== '');

  // sheet: { name, rows:[{src, cells:[]}], ... }  opts: { headerRow: source row number | 0 (none), kinds: {key: kind}, labels: {key: text}, id: 'U1', source: 'file name' }
  function build(sheet, opts) {
    opts = opts || {}; const L = limits(), report = { kept: {}, left: [], notes: [], renamed: [] };
    const rows = sheet.rows.filter((r) => !isBlank(r.cells)); report.blankRows = sheet.rows.length - rows.length;
    if (!rows.length) throw fail('That sheet has no values to import.');
    let headIdx = 0;
    if (opts.headerRow === 0) headIdx = -1; else if (opts.headerRow) { const i = rows.findIndex((r) => r.src === opts.headerRow); headIdx = i < 0 ? 0 : i; }
    else if (rows[0].cells.every((x) => S.exhibits.parseNumber(x, 'number') !== null && String(x).trim() !== '' )) headIdx = -1; // first row is all numbers: no header row
    const headCells = headIdx >= 0 ? rows[headIdx].cells : [], body = rows.filter((_, i) => i !== headIdx && i > headIdx), width = Math.max(headCells.length, ...body.map((r) => r.cells.length), 1);
    const dataRows = headIdx >= 0 ? rows.slice(headIdx + 1) : rows;
    // columns that are empty everywhere are dropped (and reported)
    let cols = [];
    for (let c = 0; c < width; c++) {
      const vals = dataRows.map((r) => (r.cells[c] == null ? '' : String(r.cells[c]))), label = headIdx >= 0 ? String(headCells[c] == null ? '' : headCells[c]) : '';
      if (!vals.some((x) => x.trim() !== '') && !label.trim()) { report.emptyColumns = (report.emptyColumns || 0) + 1; continue; }
      cols.push({ c, label: label.trim() || 'Column ' + (c + 1), vals });
    }
    if (!cols.length) throw fail('No columns with values were found in that sheet.');
    if (cols.length > L.columns) { report.left.push('Columns after the first ' + L.columns + ' were left out: ' + cols.slice(L.columns, L.columns + 8).map((x) => x.label).join(', ') + (cols.length > L.columns + 8 ? ', and ' + (cols.length - L.columns - 8) + ' more' : '') + '.'); cols = cols.slice(0, L.columns); }
    const seenLabel = new Map(), seenKey = new Set(), columns = [];
    cols.forEach((col, i) => {
      let label = col.label.slice(0, 80); const n = (seenLabel.get(label) || 0) + 1; seenLabel.set(label, n);
      if (n > 1) { const nl = (label.slice(0, 74) + ' (' + n + ')'); report.renamed.push('“' + label + '” appears more than once; the later one is labelled “' + nl + '”.'); label = nl; }
      let key = slug(label, i), k = key, j = 2; while (seenKey.has(k)) k = key.slice(0, 21) + '_' + j++; seenKey.add(k);
      const kind = KINDS.includes(opts.kinds && opts.kinds[k]) ? opts.kinds[k] : guessKind(col.vals);
      columns.push({ key: k, label: (opts.labels && opts.labels[k]) ? String(opts.labels[k]).slice(0, 80) : label, kind, unit: '', _c: col.c });
    });
    // rows: keep up to the limit; a row with an over-long cell is left out and listed, never cut short
    const out = []; let tooLong = 0, over = 0; const longList = [];
    for (const r of dataRows) {
      if (out.length >= L.rows) { over++; continue; }
      const cells = {}; let bad = false;
      for (const c of columns) { const v = r.cells[c._c] == null ? '' : String(r.cells[c._c]); if (v.length > L.cell) { bad = true; break; } cells[c.key] = v; }
      if (bad) { tooLong++; if (longList.length < 10) longList.push(r.src); continue; }
      out.push({ id: (opts.id || 'U1') + '-' + (out.length + 1), cells, src: r.src });
    }
    if (over) report.left.push(over.toLocaleString() + ' row' + (over === 1 ? '' : 's') + ' after the first ' + L.rows.toLocaleString() + ' were left out.');
    if (tooLong) report.left.push(tooLong + ' row' + (tooLong === 1 ? '' : 's') + ' with a cell longer than ' + L.cell + ' characters ' + (tooLong === 1 ? 'was' : 'were') + ' left out rather than cut short (sheet row' + (longList.length === 1 ? '' : 's') + ' ' + longList.join(', ') + (tooLong > longList.length ? ', …' : '') + ').');
    if (!out.length) throw fail('No rows could be imported from that sheet.');
    const st = sheet.stats || {};
    if (st.formulas) report.notes.push(st.formulas.toLocaleString() + ' cell' + (st.formulas === 1 ? ' contains' : 's contain') + ' a formula. Formulas are never run: the value saved in the file is imported as plain text' + (st.noValue ? ', and ' + st.noValue + ' formula cell' + (st.noValue === 1 ? ' had' : 's had') + ' no saved value so ' + (st.noValue === 1 ? 'it is' : 'they are') + ' empty' : '') + '.');
    if (st.dates) report.notes.push(st.dates.toLocaleString() + ' date cell' + (st.dates === 1 ? ' was' : 's were') + ' stored by Excel as serial numbers and shown here as dates. Your original file is kept unchanged.');
    if (st.merged) report.notes.push('This sheet has merged cells. Their values are kept but the merged layout is not.');
    if (st.errors) report.notes.push(st.errors + ' cell' + (st.errors === 1 ? ' holds' : 's hold') + ' an Excel error value (such as #DIV/0!), kept as text.');
    if (headIdx >= 0 && rows[headIdx].src !== rows[0].src) report.left.push('Rows above the header row (before sheet row ' + rows[headIdx].src + ') were left out.');
    if (headIdx < 0) report.notes.push('No header row was detected, so the columns are named Column 1, Column 2, and so on.');
    if (report.blankRows) report.notes.push(report.blankRows + ' blank row' + (report.blankRows === 1 ? ' was' : 's were') + ' skipped.');
    if (report.emptyColumns) report.notes.push(report.emptyColumns + ' empty column' + (report.emptyColumns === 1 ? ' was' : 's were') + ' skipped.');
    report.kept = { rows: out.length, columns: columns.length };
    const ex = { id: opts.id || 'U1', origin: 'user', type: 'table', title: String(opts.title || sheet.name || 'Your data').slice(0, 120), source: String(opts.source || '').slice(0, 200), fictional: false, purpose: '',
      table: { columns: columns.map(({ key, label, kind, unit }) => ({ key, label, kind, unit })), rows: out.map(({ id, cells }) => ({ id, cells })) },
      import: { sheet: sheet.name, hidden: !!sheet.hidden, headerRow: headIdx >= 0 ? rows[headIdx].src : 0, sourceRows: out.length ? [out[0].src, out[out.length - 1].src] : [], formulas: (sheet.formulas || []).slice(0, 50) } };
    return { exhibit: ex, report };
  }

  /* ---------- inspecting a chosen file ---------- */
  async function inspect(file) {
    if (!file) throw fail('Choose a file first.');
    const L = limits(), e = ext(file.name), t = (file.type || '').toLowerCase();
    if (file.size > L.fileBytes) throw fail('That file is over ' + Math.round(L.fileBytes / 1048576) + ' MB. Save a smaller copy and try again.');
    if (!file.size) throw fail('That file is empty.');
    let kind = e === 'xlsx' || /spreadsheetml/.test(t) ? 'xlsx' : e === 'csv' || e === 'tsv' || e === 'txt' || t === 'text/csv' || t === 'text/tab-separated-values' || t === 'text/plain' ? 'csv' : '';
    if (!kind) throw fail('Only CSV, TSV and Excel (.xlsx) files can be imported. ' + (e === 'xls' || e === 'xlsm' || e === 'xlsb' ? 'Save it as .xlsx or CSV first.' : 'Export your data as CSV or .xlsx first.'));
    const notes = []; let sheets, unsupported = [];
    if (kind === 'csv') {
      const d = await decodeText(file), text = typeof d === 'string' ? d : d.text;
      if (typeof d !== 'string') notes.push('This file is not UTF-8, so it was read as Windows-1252. Check that accented characters look right.');
      const delim = guessDelimiter(text), grid = parseDelimited(text, delim);
      if (delim !== ',') notes.push('Columns were separated by ' + (delim === '\t' ? 'tabs' : 'semicolons') + '.');
      sheets = [{ name: file.name.replace(/\.[^.]+$/, '') || 'Data', hidden: false, rows: grid.map((cells, i) => ({ src: i + 1, cells })), stats: {}, formulas: [] }];
    } else { const x = await readXlsx(file, L); sheets = x.sheets; unsupported = x.unsupported; }
    const info = sheets.map((s, i) => { const rows = s.rows.filter((r) => !isBlank(r.cells)); return { index: i, name: s.name, hidden: s.hidden, rowCount: rows.length, colCount: rows.reduce((m, r) => Math.max(m, r.cells.length), 0), preview: rows.slice(0, L.preview).map((r) => r.cells.slice(0, 8).map((x) => String(x).slice(0, 40))) }; });
    let extra = 0; if (info.length > L.sheets) { extra = info.length - L.sheets; notes.push('Only the first ' + L.sheets + ' sheets are offered. ' + extra + ' more ' + (extra === 1 ? 'was' : 'were') + ' not listed.'); }
    return { kind, name: file.name, size: file.size, sheets, info: info.slice(0, L.sheets), notes, unsupported };
  }

  /* ---------- the dialog: choose sheets, check columns, read the limits report ---------- */
  // Resolves with { file, items: [{ exhibit, report }] } when the learner adds data, or null if they cancel. Nothing is saved here.
  function dialog(file, o) {
    const h = S.h; o = o || {};
    return new Promise((resolve) => {
      let model = null, picked = new Set(), cfg = {}, stage = 'load';
      const dlg = h('dialog', { class: 'di', 'aria-labelledby': 'di-title' }), body = h('div', { class: 'di-body' });
      const done = (v) => { try { dlg.close(); } catch (e) { /* closed */ } dlg.remove(); resolve(v); };
      const head = h('header', { class: 'di-head' }, h('h2', { id: 'di-title' }, 'Add your own data'), h('button', { type: 'button', class: 'linkbtn', onclick: () => done(null) }, 'Cancel'));
      dlg.append(head, body); dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      const say = (...k) => { body.replaceChildren(...k.flat(3).filter(Boolean)); };
      const err = (m) => say(h('p', { class: 'banner warn', role: 'alert' }, m), h('div', { class: 'di-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => done(null) }, 'Close')));
      const table = (rows) => h('div', { class: 'di-prev', tabindex: '0', role: 'region', 'aria-label': 'Preview of the first rows' }, h('table', {}, h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
      const remind = h('p', { class: 'small muted' }, 'Stays on this device. Remove personal information about other people first; this app cannot check for it. Nothing is sent to the AI unless you agree when you ask for a review.');

      const showSheets = () => {
        stage = 'sheets'; const L = limits(), multi = model.info.length > 1;
        if (!multi) picked = new Set([0]);
        say(h('p', { class: 'small' }, h('b', {}, model.name), ' · ' + Math.max(1, Math.round(model.size / 1024)) + ' KB · ' + (model.kind === 'xlsx' ? 'Excel workbook' : 'text file')),
          model.notes.map((n) => h('p', { class: 'small muted' }, n)), model.unsupported.length ? h('div', { class: 'banner', role: 'status' }, h('b', {}, 'Not imported'), h('ul', { class: 'plain small' }, model.unsupported.map((n) => h('li', {}, n)))) : null,
          multi ? h('p', {}, 'This workbook has ' + model.info.length + ' sheets. Choose the ones to import; each becomes its own exhibit. None is chosen for you.') : null,
          h('ul', { class: 'di-sheets' }, model.info.map((s) => h('li', {}, h('label', { class: 'di-sheet' }, multi ? h('input', { type: 'checkbox', checked: picked.has(s.index), onchange: (e) => { e.target.checked ? picked.add(s.index) : picked.delete(s.index); go.disabled = !picked.size; } }) : null,
            h('span', { class: 'di-sname' }, s.name + (s.hidden ? ' (hidden)' : '')), h('span', { class: 'small muted' }, s.rowCount.toLocaleString() + ' rows · ' + s.colCount + ' columns')), s.preview.length ? table(s.preview) : h('p', { class: 'small muted' }, 'No values in this sheet.')))),
          remind);
        const go = h('button', { type: 'button', class: 'btn', disabled: !picked.size, onclick: showColumns }, 'Continue');
        body.append(h('div', { class: 'di-actions' }, go, h('button', { type: 'button', class: 'linkbtn', onclick: () => done(null) }, 'Cancel')));
      };
      const built = () => [...picked].sort((a, b) => a - b).map((i, n) => {
        const s = model.sheets[i], c = cfg[i] || {}; try { return { i, ...build(s, { id: 'U' + (n + 1 + (o.startAt || 0)), title: (model.kind === 'xlsx' ? 'Your data: ' + s.name : 'Your data: ' + s.name), source: model.name, headerRow: c.headerRow, kinds: c.kinds }) }; } catch (e) { return { i, error: e.message }; }
      });
      const showColumns = () => {
        stage = 'cols'; const items = built();
        say(items.map((it) => {
          const s = model.sheets[it.i]; if (it.error) return h('section', { class: 'di-sec' }, h('h3', {}, s.name), h('p', { class: 'banner warn' }, it.error));
          const ex = it.exhibit, r = it.report;
          return h('section', { class: 'di-sec' }, h('h3', {}, ex.title), h('p', { class: 'small muted' }, 'Will be added as Exhibit ' + ex.id + ' · ' + r.kept.rows.toLocaleString() + ' rows · ' + r.kept.columns + ' columns · “Added by you”'),
            h('div', { class: 'di-hdr' }, h('label', { class: 'small' }, 'Header row ', h('select', { 'aria-label': 'Header row for ' + s.name, onchange: (e) => { (cfg[it.i] = cfg[it.i] || {}).headerRow = Number(e.target.value); showColumns(); } },
              h('option', { value: '0', selected: ex.import.headerRow === 0 }, 'None (name the columns for me)'), ...s.rows.filter((x) => !isBlank(x.cells)).slice(0, 8).map((x) => h('option', { value: String(x.src), selected: x.src === ex.import.headerRow }, 'Row ' + x.src + ': ' + x.cells.slice(0, 4).join(' | ').slice(0, 50)))))),
            h('table', { class: 'di-cols' }, h('thead', {}, h('tr', {}, h('th', {}, 'Column'), h('th', {}, 'Type'), h('th', {}, 'First values'))), h('tbody', {}, ex.table.columns.map((c) => h('tr', {}, h('td', {}, c.label), h('td', {}, h('select', { 'aria-label': 'Type of ' + c.label, onchange: (e) => { const m = (cfg[it.i] = cfg[it.i] || {}); (m.kinds = m.kinds || {})[c.key] = e.target.value; showColumns(); } }, KINDS.map((k) => h('option', { value: k, selected: k === c.kind }, k)))), h('td', { class: 'small muted' }, ex.table.rows.slice(0, 3).map((x) => x.cells[c.key]).join(' · ').slice(0, 60)))))),
            r.left.length ? h('div', { class: 'banner warn', role: 'status' }, h('b', {}, 'Left out'), h('ul', { class: 'plain' }, r.left.map((x) => h('li', {}, x)))) : h('p', { class: 'small' }, 'Nothing was left out.'),
            r.renamed.length ? h('ul', { class: 'plain small' }, r.renamed.map((x) => h('li', {}, x))) : null,
            r.notes.length ? h('ul', { class: 'plain small muted' }, r.notes.map((x) => h('li', {}, x))) : null);
        }), h('p', { class: 'small muted' }, 'Changing a type or header row only changes how columns are read. Your values are never edited, and your original file is kept as it is.'));
        const ok = items.filter((x) => !x.error);
        body.append(h('div', { class: 'di-actions' }, h('button', { type: 'button', class: 'btn', disabled: !ok.length, onclick: () => done({ file, items: ok.map((x) => ({ exhibit: x.exhibit, report: x.report })) }) }, 'Add ' + ok.length + ' exhibit' + (ok.length === 1 ? '' : 's')),
          model.info.length > 1 ? h('button', { type: 'button', class: 'linkbtn', onclick: showSheets }, 'Back') : null, h('button', { type: 'button', class: 'linkbtn', onclick: () => done(null) }, 'Cancel')));
      };
      document.body.append(dlg); dlg.showModal(); say(h('p', { class: 'small', role: 'status' }, 'Reading the file on this device…'));
      inspect(file).then((m) => { model = m; showSheets(); }).catch((e) => err(e && e.plain ? e.message : 'That file could not be read. It may be damaged or not a spreadsheet.'));
    });
  }

  S.dataImport = { limits, inspect, build, dialog, KINDS, parseDelimited, guessDelimiter, serialToIso };
})(window.Sovereign);
