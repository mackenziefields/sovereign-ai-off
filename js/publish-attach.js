/* sovereign. — Phase 4C: files a learner submitted, shown inside a publication.
   Everything happens on this device. Nothing is uploaded, no conversion service is used, and the original file is never changed.
   A file is included only when the learner ticks it for that export. What could not be shown is always said, never silently left out.
   Supported: images, PDF (pages drawn as pictures with the PDF.js copy already in js/vendor), Word .docx (text and tables), Excel .xlsx (cell values and simple charts). */
(function (S) {
  'use strict';
  const P = S.publish, h = S.h;
  const LIM = { imgEdge: 1600, pdfPages: 30, pdfDefault: 10, pdfWidth: 1200, rows: 30, rowsMax: 100, sheets: 3, cols: 10, charts: 6, words: 8000, bytes: 24 * 1048576 };
  const cache = new Map(), metaCache = new Map();
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', CNS = 'http://schemas.openxmlformats.org/drawingml/2006/chart', ANS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const mb = (n) => (n >= 1048576 ? (Math.round(n / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  function kindOf(sub) {
    const t = String((sub && sub.fileType) || '').toLowerCase(), n = String((sub && sub.fileName) || '').toLowerCase();
    if (!sub || !sub.fileName || !sub.fileId) return 'none';
    if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
    if (/^image\/(png|jpeg|webp|gif)$/.test(t)) return 'image';
    if (/wordprocessingml/.test(t) || /\.docx$/.test(n)) return 'docx';
    if (/spreadsheetml/.test(t) || /\.xlsx$/.test(n)) return 'xlsx';
    return 'other';
  }
  const KIND_NAME = { pdf: 'PDF', image: 'Image', docx: 'Word', xlsx: 'Excel', other: 'File' };
  const keyOf = (sub, spec) => [sub.fileId, sub.fileSize, spec.from || '', spec.to || '', spec.rows || ''].join('|');
  const toUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const kids = (el, ns, name) => [...el.children].filter((c) => c.localName === name && (!ns || c.namespaceURI === ns));
  const all = (el, ns, name) => [...el.getElementsByTagNameNS(ns, name)];
  const dom = (x) => new DOMParser().parseFromString(x, 'application/xml');
  const fail = (kind, name, status, msg) => ({ status, kind, name, summary: msg, notes: [], parts: [], bytes: 0 });

  /* ---------- reading what a file is (cheap, so the dialog can offer sensible choices) ---------- */
  let pdfLib = null;
  const HERE = document.currentScript && document.currentScript.src ? document.currentScript.src : new URL('js/publish-attach.js', document.baseURI).href;
  const loadPdf = () => { if (!pdfLib) pdfLib = import('./vendor/pdf.min.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', HERE).href; return m; }); return pdfLib; };
  async function blobOf(sub) { try { return await S.files.get(sub.fileId); } catch (e) { return null; } }

  async function probe(sub) {
    const k = kindOf(sub); if (k === 'none') return { kind: 'none' };
    const key = 'p|' + sub.fileId + '|' + sub.fileSize; if (metaCache.has(key)) return metaCache.get(key);
    const out = { kind: k, size: sub.fileSize || 0 }, blob = await blobOf(sub);
    if (!blob) out.missing = true;
    else if (k === 'pdf') { try { const lib = await loadPdf(), doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; out.pages = doc.numPages; doc.destroy(); } catch (e) { out.error = e && e.name === 'PasswordException' ? 'This PDF is password-protected.' : 'This PDF could not be read.'; } }
    metaCache.set(key, out); return out;
  }

  /* ---------- images ---------- */
  async function prepImage(sub, blob) {
    const file = blob.type ? blob : new Blob([blob], { type: sub.fileType });
    const r = await S.files.downscale(file), src = await toUrl(r.blob);
    const dims = await new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([0, 0]); i.src = src; });
    const notes = []; if (/gif/i.test(sub.fileType)) notes.push('An animated GIF is shown as its first frame.');
    return { status: 'ready', kind: 'image', name: sub.fileName, summary: 'Embedded image' + (dims[0] ? ' (' + dims[0] + ' × ' + dims[1] + ' px, scaled to fit within ' + LIM.imgEdge + ' px if larger)' : ''), notes, parts: [{ t: 'img', src, alt: 'Image submitted by the learner: ' + sub.fileName, cap: sub.fileName }], bytes: src.length };
  }

  /* ---------- PDF: pages drawn as pictures ---------- */
  async function prepPdf(sub, blob, spec) {
    let lib, doc;
    try { lib = await loadPdf(); doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; }
    catch (e) { return fail('pdf', sub.fileName, 'error', e && e.name === 'PasswordException' ? 'This PDF is password-protected, so no pages were included. Remove the password and try again.' : 'This PDF could not be read, so no pages were included.'); }
    const total = doc.numPages, from = Math.max(1, Math.min(total, spec.from || 1)), to = Math.min(total, Math.max(from, spec.to || Math.min(total, LIM.pdfDefault)), from + LIM.pdfPages - 1);
    const parts = [], notes = []; let bytes = 0, stoppedAt = 0;
    for (let p = from; p <= to; p++) {
      const page = await doc.getPage(p), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, LIM.pdfWidth / v1.width) });
      const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const src = await new Promise((res) => cv.toBlob((b) => res(b), 'image/jpeg', 0.82)).then(toUrl);
      cv.width = cv.height = 0; page.cleanup();
      if (bytes + src.length > LIM.bytes) { stoppedAt = p; break; }
      bytes += src.length; parts.push({ t: 'img', src, page: true, alt: 'Page ' + p + ' of ' + sub.fileName, cap: 'Page ' + p + ' of ' + total + ' · ' + sub.fileName });
    }
    doc.destroy();
    const last = parts.length ? from + parts.length - 1 : 0;
    if (stoppedAt === from) notes.push('Page ' + from + ' alone is over the size limit for one export, so no pages were included.');
    else if (stoppedAt) notes.push('Stopped after page ' + (stoppedAt - 1) + ' to keep the PDF a workable size (about ' + mb(bytes) + ' of pages). Pages ' + stoppedAt + ' to ' + to + ' were not included.');
    if (last < total) notes.push((last < to ? '' : '') + 'This file has ' + total + ' pages; ' + (parts.length ? 'pages ' + from + ' to ' + last + ' are included' : 'no pages are included') + '. The rest are not in this export.');
    notes.push('Pages are drawn as pictures: the text in them cannot be searched or selected in the exported PDF, and links inside them do not work.');
    return { status: parts.length ? 'ready' : 'error', kind: 'pdf', name: sub.fileName, summary: parts.length ? 'Embedded as page pictures, pages ' + from + ' to ' + last + ' of ' + total : 'No pages could be included', notes, parts, bytes };
  }

  /* ---------- Word (.docx): text and tables ---------- */
  async function prepDocx(sub, blob) {
    let zip, xml;
    try { zip = S.files.unzip(await blob.arrayBuffer()); if (!zip.has('word/document.xml')) throw new Error('x'); xml = await zip.read('word/document.xml'); }
    catch (e) { return fail('docx', sub.fileName, 'error', 'This Word file could not be read (it may be damaged, password-protected, or an older .doc file), so nothing from it was included.'); }
    const d = dom(xml), body = all(d, W, 'body')[0]; if (!body) return fail('docx', sub.fileName, 'error', 'This Word file has no readable text.');
    const runText = (p) => { let s = ''; const walk = (n) => { for (const c of n.children) { const ln = c.localName; if (ln === 't') s += c.textContent; else if (ln === 'tab') s += '\t'; else if (ln === 'br' || ln === 'cr') s += '\n'; else if (ln === 'delText' || ln === 'del' || ln === 'drawing' || ln === 'pict' || ln === 'AlternateContent' || ln === 'instrText') continue; else walk(c); } }; walk(p); return s; };
    const parts = [], notes = []; let words = 0, cut = false;
    const para = (p) => { const st = (all(p, W, 'pStyle')[0] || { getAttributeNS: () => '' }).getAttributeNS(W, 'val') || '', hm = /^Heading ?(\d)/i.exec(st), num = all(p, W, 'numPr').length > 0, text = runText(p).replace(/\s+$/g, '');
      return { st, level: hm ? +hm[1] : /^Title$/i.test(st) ? 1 : 0, list: num, text }; };
    for (const el of [...body.children]) {
      if (cut) break;
      if (el.localName === 'p') { const q = para(el); if (!q.text.trim()) continue; words += q.text.split(/\s+/).length; parts.push({ t: 'p', ...q }); }
      else if (el.localName === 'tbl') {
        const rows = kids(el, W, 'tr').map((tr) => kids(tr, W, 'tc').map((tc) => all(tc, W, 'p').map((p) => runText(p).trim()).filter(Boolean).join(' / ')));
        if (rows.length) { rows.forEach((r) => r.forEach((c) => { words += c.split(/\s+/).filter(Boolean).length; })); parts.push({ t: 'table', head: rows[0], rows: rows.slice(1, 61), more: Math.max(0, rows.length - 61), cap: 'Table from the Word file' }); }
      }
      if (words > LIM.words) { cut = true; notes.push('The document is long: the first ' + LIM.words.toLocaleString() + ' words are included and the rest is not.'); }
    }
    if (!parts.length) return fail('docx', sub.fileName, 'error', 'No text was found in this Word file, so nothing was included.');
    const hasImg = all(d, W, 'drawing').length + all(d, W, 'pict').length > 0, hasBox = all(d, W, 'txbxContent').length > 0, tracked = all(d, W, 'ins').length + all(d, W, 'del').length > 0;
    const left = []; if (hasImg) left.push('images and drawings'); if (hasBox) left.push('text boxes'); left.push('headers, footers, footnotes, comments, fonts and page layout');
    notes.push('Not included from the Word file: ' + left.join(', ') + '.'); if (tracked) notes.push('The file has tracked changes; the text shown is the version with insertions kept and deletions left out.');
    return { status: 'ready', kind: 'docx', name: sub.fileName, summary: 'Text and tables read from the Word file', notes, parts, bytes: 0 };
  }

  /* ---------- Excel (.xlsx): cell values (via the data reader) and simple charts ---------- */
  const PAL = ['#2643d8', '#d9822b', '#2f8f6b', '#8a4fc7', '#c0392b', '#4c6b82'];
  const txt = (el) => (el ? el.textContent : '');
  function chartSvg(spec) {
    const W0 = 560, H0 = 280, L = 54, R = 14, T = 30, B = 62, pw = W0 - L - R, ph = H0 - T - B, ser = spec.series, cats = spec.cats;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W0 + ' ' + H0 + '" role="img" aria-label="' + esc((spec.title || 'Chart') + ' (redrawn from the workbook)') + '" font-family="Segoe UI, Arial, sans-serif">';
    if (spec.title) s += '<text x="' + W0 / 2 + '" y="17" text-anchor="middle" font-size="12" font-weight="700" fill="#101b32">' + esc(spec.title.slice(0, 80)) + '</text>';
    const vals = ser.flatMap((x) => x.vals.filter((v) => Number.isFinite(v)));
    if (spec.type === 'pie') {
      const sr = ser[0], tot = sr.vals.reduce((a, v) => a + (v > 0 ? v : 0), 0) || 1; let ang = -Math.PI / 2; const cx = 140, cy = 150, r = 95;
      sr.vals.forEach((v, i) => { if (!(v > 0)) return; const a2 = ang + 2 * Math.PI * v / tot, x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        s += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 ' + (a2 - ang > Math.PI ? 1 : 0) + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z" fill="' + PAL[i % PAL.length] + '" stroke="#fff" stroke-width="1"/>';
        s += '<rect x="280" y="' + (46 + i * 20) + '" width="11" height="11" fill="' + PAL[i % PAL.length] + '"/><text x="297" y="' + (56 + i * 20) + '" font-size="11" fill="#101b32">' + esc(String(cats[i] || '').slice(0, 28)) + ' · ' + Math.round(100 * v / tot) + '%</text>'; ang = a2; });
      return s + '</svg>';
    }
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = (max - min) || 1, step = Math.pow(10, Math.floor(Math.log10(span))) * (span / Math.pow(10, Math.floor(Math.log10(span))) > 5 ? 2 : span / Math.pow(10, Math.floor(Math.log10(span))) > 2 ? 1 : .5);
    const top = Math.ceil(max / step) * step, bot = Math.floor(min / step) * step, rng = (top - bot) || 1, y = (v) => T + ph - ((v - bot) / rng) * ph;
    for (let v = bot; v <= top + step / 100; v += step) s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="#d5d9e0" stroke-width=".6"/><text x="' + (L - 6) + '" y="' + (y(v) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#4a5260">' + (Math.round(v * 100) / 100) + '</text>';
    const n = Math.max(1, cats.length), bw = pw / n;
    if (spec.type === 'line') ser.forEach((sr, si) => { const pts = sr.vals.map((v, i) => (Number.isFinite(v) ? (L + bw * (i + .5)).toFixed(1) + ',' + y(v).toFixed(1) : null)).filter(Boolean); s += '<polyline fill="none" stroke="' + PAL[si % PAL.length] + '" stroke-width="2" points="' + pts.join(' ') + '"/>'; sr.vals.forEach((v, i) => { if (Number.isFinite(v)) s += '<circle cx="' + (L + bw * (i + .5)).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.6" fill="' + PAL[si % PAL.length] + '"/>'; }); });
    else { const g = Math.min(ser.length, 4), w1 = Math.min(34, (bw * .76) / g); ser.forEach((sr, si) => sr.vals.forEach((v, i) => { if (!Number.isFinite(v)) return; const x0 = L + bw * i + (bw - w1 * g) / 2 + si * w1, y0 = y(Math.max(v, 0)), y1 = y(Math.min(v, 0)); s += '<rect x="' + x0.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + (w1 - 1).toFixed(1) + '" height="' + Math.max(.5, y1 - y0).toFixed(1) + '" fill="' + PAL[si % PAL.length] + '"/>'; })); }
    s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="#101b32" stroke-width=".8"/>';
    const every = Math.ceil(n / 12); cats.forEach((c, i) => { if (i % every) return; const cx = L + bw * (i + .5); s += '<text transform="translate(' + cx.toFixed(1) + ',' + (T + ph + 14) + ') rotate(' + (n > 6 ? -30 : 0) + ')" text-anchor="' + (n > 6 ? 'end' : 'middle') + '" font-size="10" fill="#4a5260">' + esc(String(c).slice(0, 16)) + '</text>'; });
    if (ser.length > 1 || (ser[0] && ser[0].name)) ser.forEach((sr, i) => { const lx = L + i * 120; s += '<rect x="' + lx + '" y="' + (H0 - 14) + '" width="10" height="10" fill="' + PAL[i % PAL.length] + '"/><text x="' + (lx + 14) + '" y="' + (H0 - 5) + '" font-size="10" fill="#101b32">' + esc(String(sr.name || 'Series ' + (i + 1)).slice(0, 18)) + '</text>'; });
    return s + '</svg>';
  }
  function parseChart(xml) {
    const d = dom(xml), plot = all(d, CNS, 'plotArea')[0]; if (!plot) return { skip: 'a chart with no plot' };
    const typeEl = [...plot.children].find((c) => /^(bar|line|pie|area|scatter|doughnut|radar|bubble|stock|surface)/.test(c.localName)); if (!typeEl) return { skip: 'a chart with no recognised plot' };
    const ln = typeEl.localName.replace(/3D$/, '').replace(/Chart$/, '');
    if (!['bar', 'line', 'pie'].includes(ln)) return { skip: 'a ' + ln + ' chart (this kind is not drawn)' };
    const sers = all(typeEl, CNS, 'ser').slice(0, 6), series = []; let cats = [];
    for (const sr of sers) {
      const v = all(sr, CNS, 'val')[0], cat = all(sr, CNS, 'cat')[0]; if (!v) continue;
      const nc = all(v, CNS, 'numCache')[0]; if (!nc) return { skip: 'a chart whose values were not saved with it' };
      const pts = (cache0) => { const m = []; all(cache0, CNS, 'pt').forEach((p) => { m[+p.getAttribute('idx')] = txt(all(p, CNS, 'v')[0]); }); const pc = all(cache0, CNS, 'ptCount')[0], cnt = (pc && +pc.getAttribute('val')) || m.length; return Array.from({ length: Math.min(cnt, 60) }, (_, i) => m[i]); };
      const vals = pts(nc).map((x) => (x === undefined || x === '' ? NaN : parseFloat(x)));
      if (cat && !cats.length) { const cc = all(cat, CNS, 'strCache')[0] || all(cat, CNS, 'numCache')[0]; if (cc) cats = pts(cc).map((x) => (x === undefined ? '' : x)); }
      const tx = all(sr, CNS, 'tx')[0]; series.push({ name: tx ? txt(all(tx, CNS, 'v')[0]) : '', vals });
    }
    if (!series.length) return { skip: 'a chart with no data series' };
    if (!cats.length) cats = series[0].vals.map((_, i) => String(i + 1));
    const tt = all(d, CNS, 'title')[0], title = tt ? all(tt, ANS, 't').map((x) => x.textContent).join('') : '';
    const barDir = ln === 'bar' ? (all(typeEl, CNS, 'barDir')[0] || { getAttribute: () => 'col' }).getAttribute('val') : '';
    return { spec: { type: ln, title, series, cats, horizontal: barDir === 'bar' } };
  }
  async function prepXlsx(sub, blob, spec) {
    let info;
    try { info = await S.dataImport.inspect(new File([blob], sub.fileName, { type: sub.fileType })); }
    catch (e) { return fail('xlsx', sub.fileName, 'error', (e && e.plain ? e.message : 'This Excel file could not be read') + ' Nothing from it was included.'); }
    const rowsMax = Math.min(LIM.rowsMax, Math.max(1, spec.rows || LIM.rows)), parts = [], notes = [];
    const shown = info.sheets.filter((s) => !s.hidden).slice(0, LIM.sheets);
    shown.forEach((sh) => {
      const rows = sh.rows.filter((r) => r.cells.some((x) => String(x).trim() !== '')), width = Math.min(LIM.cols, rows.reduce((m, r) => Math.max(m, r.cells.length), 0)), wide = rows.reduce((m, r) => Math.max(m, r.cells.length), 0);
      if (!rows.length || !width) return;
      const cut = (r) => Array.from({ length: width }, (_, i) => String(r.cells[i] == null ? '' : r.cells[i]).slice(0, 80));
      parts.push({ t: 'table', head: cut(rows[0]), rows: rows.slice(1, rowsMax).map(cut), more: Math.max(0, rows.length - rowsMax), cap: 'Sheet “' + sh.name + '”' + (wide > width ? ' · first ' + width + ' of ' + wide + ' columns' : ''), sheet: true });
    });
    if (info.sheets.some((s) => s.hidden)) notes.push('Hidden sheets are not shown.');
    if (info.sheets.filter((s) => !s.hidden).length > LIM.sheets) notes.push('Only the first ' + LIM.sheets + ' sheets are shown.');
    let chartsSeen = 0, drawn = 0; const skipped = [];
    try { const zip = S.files.unzip(await blob.arrayBuffer()); for (const nm of zip.names().filter((n) => /^xl\/charts\/chart\d*\.xml$/.test(n)).slice(0, LIM.charts)) { chartsSeen++; const r = parseChart(await zip.read(nm)); if (r.spec) { drawn++; parts.push({ t: 'chart', svg: chartSvg(r.spec), alt: (r.spec.title || 'Chart') + ' from the workbook', cap: (r.spec.title || 'Chart') + ' · redrawn from the values saved in the chart' }); } else skipped.push(r.skip); } } catch (e) { /* charts are optional */ }
    if (skipped.length) notes.push('Not drawn: ' + skipped.join('; ') + '.');
    if (chartsSeen) notes.push('Charts are redrawn from the numbers saved inside the workbook, so colours and styling will differ from Excel.');
    notes.push('Cell values only: formulas show their last saved result, and formatting, images, pivot tables and macros are not included. Nothing in the workbook is run.');
    if (!parts.length) return fail('xlsx', sub.fileName, 'error', 'No cell values were found in the visible sheets, so nothing was included.');
    return { status: 'ready', kind: 'xlsx', name: sub.fileName, summary: 'Cell values' + (drawn ? ' and ' + drawn + ' chart' + (drawn === 1 ? '' : 's') : '') + ' from the Excel file', notes, parts, bytes: 0 };
  }

  /* ---------- load (async, cached) and read back (sync) ---------- */
  async function load(sub, spec) {
    spec = spec || {}; const k = kindOf(sub), key = keyOf(sub, spec);
    if (cache.has(key)) return cache.get(key);
    let res;
    if (k === 'none') return null;
    const blob = await blobOf(sub);
    if (!blob) res = fail(k, sub.fileName, 'missing', 'The file itself is not on this device (files are kept in the browser that submitted them and are not part of a backup), so it could not be included.');
    else if (k === 'other') res = fail(k, sub.fileName, 'unsupported', 'This kind of file can’t be shown inside a PDF. Images, PDF, Word (.docx) and Excel (.xlsx) files can.');
    else { try { res = k === 'image' ? await prepImage(sub, blob) : k === 'pdf' ? await prepPdf(sub, blob, spec) : k === 'docx' ? await prepDocx(sub, blob) : await prepXlsx(sub, blob, spec); } catch (e) { res = fail(k, sub.fileName, 'error', 'This file could not be prepared (' + (e && e.message ? e.message : 'unknown problem') + '), so nothing from it was included.'); } }
    cache.set(key, res); return res;
  }
  const probed = (sub) => metaCache.get('p|' + sub.fileId + '|' + sub.fileSize) || null;
  const peek = (sub, spec) => cache.get(keyOf(sub, spec || {})) || null;

  /* ---------- the document nodes ---------- */
  function partNode(p) {
    if (p.t === 'img') return h('figure', { class: 'fig att-fig' + (p.page ? ' att-page' : '') }, p.page ? h('figcaption', {}, p.cap) : null, h('img', { src: p.src, alt: p.alt }), p.page ? null : h('figcaption', {}, p.cap)); // a page's label sits above it, so the two never separate
    if (p.t === 'chart') { const d = h('figure', { class: 'fig att-fig att-chart' }); const w = document.createElement('div'); w.innerHTML = p.svg; d.append(w, h('figcaption', {}, p.cap)); return d; }
    if (p.t === 'table') return h('div', { class: 'att-tbl' }, h('table', {}, p.cap ? h('caption', {}, p.cap) : null, h('thead', {}, h('tr', {}, p.head.map((c) => h('th', {}, c)))), h('tbody', {}, p.rows.map((r) => h('tr', {}, p.head.map((_, i) => h('td', {}, r[i] || '')))))), p.more ? h('p', { class: 'muted' }, 'Showing ' + (p.rows.length + 1) + ' rows; ' + p.more + ' more rows in the file are not shown.') : null);
    if (p.t === 'p') { if (p.level) return h('p', { class: 'att-h att-h' + Math.min(p.level, 3) }, p.text); if (p.list) return h('p', { class: 'att-li' }, '• ' + p.text); return h('p', { class: 'att-p' }, p.text); }
    return null;
  }
  const chipText = (res) => ({ ready: 'Included', missing: 'Not included · file not on this device', error: 'Not included · could not be read', unsupported: 'Not included · not a supported kind' }[res.status] || '');
  // What the publication shows for one file the learner chose to include. Returns { nodes, status } (status is the honest label), or null when the file was not chosen.
  function nodes(sub, spec) {
    if (!spec || !spec.on) return null;
    const res = peek(sub, spec);
    if (!res) return { pending: true, status: 'Preparing this file…' };
    if (res.status !== 'ready') return { failed: true, status: chipText(res), why: res.summary };
    return { status: res.summary, notes: res.notes, nodes: res.parts.map(partNode), kind: res.kind, name: res.name };
  }

  P.attach = { LIM, kindOf, KIND_NAME, probe, probed, load, peek, nodes, mb, clear: () => { cache.clear(); metaCache.clear(); } };
})(window.Sovereign);
