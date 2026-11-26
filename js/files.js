/* sovereign. — files people attach to assignments. They are kept in this browser only (IndexedDB), never in the backup file,
   and are never sent anywhere. */
(function (S) {
  'use strict';

  const DB = 'sovereign-aioff-files', STORE = 'files';
  S.FILE_LIMITS = { xlsx: 5 * 1024 * 1024, pdf: 2 * 1024 * 1024, attach: 25 * 1024 * 1024, text: 30000, imageEdge: 1600 };
  const f = S.files = {};

  function open() {
    return new Promise((res, rej) => {
      let q; try { q = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      q.onupgradeneeded = () => q.result.createObjectStore(STORE);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error || new Error('Storage unavailable'));
    });
  }
  const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(r && r.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error || new Error('Storage failed')); };
  }));

  f.put = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
  f.get = (id) => tx('readonly', (s) => s.get(id)).then((b) => b || null);
  f.del = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {}); // best effort; a leftover blob is never shown

  const ext = (n) => (String(n).split('.').pop() || '').toLowerCase();
  const TEXT_EXT = ['txt', 'md', 'markdown', 'csv'];

  // What kind of file is this? (text, PDF, image and Excel files can be shown or read in the app; any other file is kept as it is.)
  f.classify = function (file) {
    const t = (file.type || '').toLowerCase(), e = ext(file.name);
    if (t === 'application/pdf' || e === 'pdf') return 'pdf';
    if (/^image\/(png|jpeg|webp|gif)$/.test(t)) return 'image';
    if (e === 'xlsx' || t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
    if (t.startsWith('text/') || TEXT_EXT.includes(e)) return 'text';
    return 'other';
  };

  // Can this file be submitted here? Checked the moment a file is chosen.
  // Returns { ok:true } or { ok:false, msg }. (Text length is checked later, when the text is read.)
  f.check = function (file, fileOnly) {
    if (!file) return { ok: true };
    const kind = f.classify(file), e = ext(file.name), L = S.FILE_LIMITS, mb = (n) => Math.round(n / 1048576) + ' MB';
    if (kind === 'text' && fileOnly) return { ok: false, msg: 'This assignment needs a PDF, Excel file, or image, not a text file.' };
    return { ok: true };
  };

  f.readText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(r.error); r.readAsText(file); });

  const toB64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  // Shrinks large photos so they upload quickly and stay within the service's limits. Returns {blob, mime}.
  f.downscale = (file) => new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const edge = S.FILE_LIMITS.imageEdge, k = Math.min(1, edge / Math.max(img.width, img.height));
      if (k === 1 && file.size <= 1.5 * 1024 * 1024 && /jpeg|png|webp/.test(file.type)) return res({ blob: file, mime: file.type });
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? res({ blob: b, mime: 'image/jpeg' }) : rej(new Error('That image could not be read.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That image could not be read.')); };
    img.src = url;
  });

  f.base64 = toB64;

  /* ----- Excel (.xlsx) -> plain text. An .xlsx is a zip of XML files; we read the cell values only (no charts, no formatting). ----- */

  const utf8 = (u8) => new TextDecoder().decode(u8);
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open Excel files. Export the sheet as a PDF or CSV instead.');
    // Read in chunks and stop at a hard ceiling, so a crafted "zip bomb" cannot use up the tab's memory whatever sizes its header claims.
    const MAX = 20 * 1024 * 1024, ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(), rd = ds.readable.getReader(), parts = [];
    w.write(bytes).catch(() => {}); w.close().catch(() => {});
    let total = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      total += value.length;
      if (total > MAX) { try { await rd.cancel(); } catch (e) { /* already stopped */ } throw new Error('That Excel file is too large to read.'); }
      parts.push(value);
    }
    const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('That doesn’t look like a valid Excel (.xlsx) file.');
    const n = dv.getUint16(e + 10, true), files = {};
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      files[utf8(u8.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), lho: dv.getUint32(p + 42, true) };
      p += 46 + nl + el + cl;
    }
    return {
      has: (name) => !!files[name], names: () => Object.keys(files),
      read: async (name) => {
        const z = files[name]; if (!z) return null;
        if (z.usize > 20 * 1024 * 1024) throw new Error('That Excel file is too large to read.');
        const start = z.lho + 30 + dv.getUint16(z.lho + 26, true) + dv.getUint16(z.lho + 28, true), data = u8.subarray(start, start + z.csize);
        return utf8(z.method === 0 ? data : await inflateRaw(data));
      },
    };
  }
  const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); let n = 0; if (m) for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return Math.max(0, n - 1); };
  const csvCell = (v) => (/[",\n\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

  f.unzip = unzip; f.colIndex = colIndex; // shared with js/dataset-import.js
  f.xlsxToText = async function (file) {
    const zip = unzip(await file.arrayBuffer()), dom = (x) => new DOMParser().parseFromString(x, 'application/xml');
    if (!zip.has('xl/workbook.xml')) throw new Error('That doesn’t look like a valid Excel (.xlsx) file.');
    const shared = [];
    if (zip.has('xl/sharedStrings.xml')) dom(await zip.read('xl/sharedStrings.xml')).querySelectorAll('si').forEach((si) => {
      shared.push([...si.querySelectorAll('t')].filter((t) => !t.closest('rPh')).map((t) => t.textContent).join(''));
    });
    const rels = {};
    if (zip.has('xl/_rels/workbook.xml.rels')) dom(await zip.read('xl/_rels/workbook.xml.rels')).querySelectorAll('Relationship').forEach((r) => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const sheets = [...dom(await zip.read('xl/workbook.xml')).querySelectorAll('sheet')].slice(0, 5);
    let out = '[Cell values from an Excel file the learner submitted. Charts, images, and formatting are not included.]\n';
    for (const sh of sheets) {
      let target = rels[sh.getAttribute('r:id')] || rels[sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] || '';
      target = target.replace(/^\/?(xl\/)?/, 'xl/');
      if (!zip.has(target)) continue;
      out += '\n## Sheet: ' + sh.getAttribute('name') + '\n';
      const rows = [...dom(await zip.read(target)).querySelectorAll('row')].slice(0, 500);
      for (const row of rows) {
        const cells = [];
        row.querySelectorAll('c').forEach((c) => {
          const t = c.getAttribute('t'), v = c.querySelector('v'), is = c.querySelector('is');
          let val = '';
          if (t === 's') val = shared[parseInt(v && v.textContent, 10)] || '';
          else if (t === 'inlineStr' && is) val = [...is.querySelectorAll('t')].map((x) => x.textContent).join('');
          else if (v) val = v.textContent;
          cells[colIndex(c.getAttribute('r'))] = val;
        });
        if (cells.some((x) => x)) out += Array.from(cells, (x) => csvCell(x || '')).join(',') + '\n';
      }
    }
    if (out.length > S.FILE_LIMITS.text) throw new Error('That spreadsheet has more content than this app reads at once (about ' + S.FILE_LIMITS.text.toLocaleString() + ' characters). Submit a PDF or a smaller sheet.');
    if (out.split('\n').length < 4) throw new Error('No cell values were found in that Excel file.');
    return out;
  };
})(window.Sovereign);
