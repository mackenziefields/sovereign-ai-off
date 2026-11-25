/* sovereign. — Phase 2D-2: "Your data". A learner's own dataset, kept apart from the supplied exhibits.
   - Demonstrate assignments: the dataset belongs to the assignment (a.myData). Office Hours: it belongs to that practice session (a.office.data).
   - Every import or replacement is a NEW immutable version. Earlier versions stay, so a review can always be explained by the data it was given.
   - The structured rows and the original file live in this browser's IndexedDB (never in localStorage, never in backups, never sent anywhere
     in this step). The assignment only keeps small descriptive records. Nothing here touches a.exhibits, submissions, grades or feedback. */
(function (S) {
  'use strict';

  const h = S.h, D = S.myData = {}, KEY = 'ds:', MAX_VERSIONS = 20;
  D.cache = new Map(); // versionId -> exhibits (read-only copies for display)

  /* ---------- where the data lives ---------- */
  const get = (a, scope) => (scope === 'office' ? (a.office && a.office.data) || null : a.myData || null);
  function set(a, scope, v) {
    if (scope === 'office') {
      if (v) { a.office = a.office || { material: '', mode: '', rounds: [] }; a.office.data = v; }
      else if (a.office) { delete a.office.data; if (!a.office.rounds.length) a.office = null; }
    } else if (v) a.myData = v; else delete a.myData;
  }
  D.get = get;
  const current = (d) => (d && d.versions.find((v) => v.id === d.currentId)) || null;
  D.current = current;

  // Which reviews were given a version? (Reviews will record feedback.data = { datasetId, versionId } in a later step; this already honours it.)
  function reviewsUsing(a, versionId) {
    const subs = [a.work && a.work.first, a.work && a.work.final, ...((a.office && a.office.rounds) || [])].filter(Boolean);
    return subs.filter((s) => s.feedback && s.feedback.data && s.feedback.data.versionId === versionId);
  }
  D.reviewsUsing = reviewsUsing;

  /* ---------- reading a stored version back (defensive: it is stored data, so it is checked again) ---------- */
  const L = () => S.dataImport.limits();
  function clean(ex, i) {
    if (!ex || typeof ex !== 'object' || !ex.table || !Array.isArray(ex.table.columns) || !Array.isArray(ex.table.rows)) return null;
    const lim = L(), id = /^U\d{1,2}$/.test(String(ex.id)) ? String(ex.id) : 'U' + (i + 1);
    const cols = ex.table.columns.slice(0, lim.columns).filter((c) => c && /^[a-z][a-z0-9_]{0,23}$/.test(String(c.key))).map((c) => ({ key: String(c.key), label: String(c.label || c.key).slice(0, 80), kind: S.dataImport.KINDS.includes(c.kind) ? c.kind : 'text', unit: '' }));
    if (!cols.length) return null;
    const rows = ex.table.rows.slice(0, lim.rows).map((r, n) => { const cells = {}; for (const c of cols) { const v = r && r.cells ? r.cells[c.key] : ''; cells[c.key] = v == null || typeof v === 'object' ? '' : String(v).slice(0, lim.cell); } return { id: id + '-' + (n + 1), cells }; });
    return { id, origin: 'user', type: 'table', title: String(ex.title || 'Your data').slice(0, 120), source: String(ex.source || '').slice(0, 200), fictional: false, purpose: '', table: { columns: cols, rows } };
  }
  D.load = async function (ver) {
    if (D.cache.has(ver.id)) return D.cache.get(ver.id);
    let rec = null; try { rec = await S.files.get(ver.dataKey); } catch (e) { /* not available */ }
    const list = rec && Array.isArray(rec.exhibits) ? rec.exhibits.map(clean).filter(Boolean) : null;
    if (list && list.length) D.cache.set(ver.id, list);
    return list && list.length ? list : null;
  };

  /* ---------- changing it ---------- */
  const dropBlobs = (v) => { S.files.del(v.source.fileId); S.files.del(v.dataKey); D.cache.delete(v.id); };
  D.purgeData = (d) => { if (d) d.versions.forEach(dropBlobs); };

  // res: { file, items:[{exhibit, report}] } from S.dataImport.dialog. Saves a NEW version and makes it current. Nothing else is changed.
  D.add = async function (a, scope, res, note) {
    const ex = res.items.map((i) => i.exhibit), id = S.uid(), dataKey = KEY + id, fileId = S.uid();
    try { await S.files.put(fileId, res.file); await S.files.put(dataKey, { exhibits: ex }); }
    catch (e) { S.files.del(fileId); S.files.del(dataKey); throw new Error('Your data could not be saved on this device. Free some browser storage and try again.'); }
    const lines = (k) => res.items.flatMap((i) => i.report[k].map((t) => (res.items.length > 1 ? i.exhibit.import.sheet + ': ' : '') + t));
    const ver = { id, at: new Date().toISOString(), note: String(note || '').slice(0, 200), source: { name: res.file.name, size: res.file.size, type: res.file.type || '', fileId }, dataKey,
      sheets: ex.map((e) => ({ name: e.import.sheet, exhibitId: e.id, rows: e.table.rows.length, cols: e.table.columns.length })), left: lines('left').slice(0, 20), notes: lines('notes').slice(0, 20) };
    const cur = get(a, scope) || { id: S.uid(), currentId: '', versions: [] };
    cur.versions.push(ver); cur.currentId = id;
    while (cur.versions.length > MAX_VERSIONS) { // keep the newest; never drop the current one or one a review used
      const i = cur.versions.findIndex((v) => v.id !== cur.currentId && !reviewsUsing(a, v.id).length);
      if (i < 0) break; dropBlobs(cur.versions[i]); cur.versions.splice(i, 1);
    }
    set(a, scope, cur); D.cache.set(id, ex.map(clean).filter(Boolean)); S.save();
  };

  // Stop using the data. Versions a review used are kept (read-only); the rest are deleted from this device.
  D.removeCurrent = function (a, scope) {
    const d = get(a, scope); if (!d) return;
    d.currentId = '';
    d.versions = d.versions.filter((v) => { if (reviewsUsing(a, v.id).length) return true; dropBlobs(v); return false; });
    set(a, scope, d.versions.length ? d : null); S.save();
  };
  D.deleteVersion = function (a, scope, id, force) {
    const d = get(a, scope), v = d && d.versions.find((x) => x.id === id); if (!v || d.currentId === id) return false;
    const used = reviewsUsing(a, id); if (used.length && !force) return false;
    used.forEach((s) => { s.feedback.data.removed = true; }); // the review keeps its record that data was used; the data itself is gone
    dropBlobs(v); d.versions = d.versions.filter((x) => x.id !== id); S.save(); return true;
  };
  // Office Hours: make a COPY of the assignment's current dataset inside the session. They never affect each other.
  D.copyToOffice = async function (a) {
    const src = current(a.myData); if (!src) throw new Error('There is no data on this assignment to copy.');
    const rec = await S.files.get(src.dataKey), blob = await S.files.get(src.source.fileId);
    if (!rec || !blob) throw new Error('That data is not available on this device.');
    const id = S.uid(), dataKey = KEY + id, fileId = S.uid();
    await S.files.put(fileId, blob); await S.files.put(dataKey, rec);
    const ver = { ...JSON.parse(JSON.stringify(src)), id, at: new Date().toISOString(), note: 'Copied from the assignment', dataKey, source: { ...src.source, fileId } };
    const cur = get(a, 'office') || { id: S.uid(), currentId: '', versions: [] };
    cur.versions.push(ver); cur.currentId = id; set(a, 'office', cur); S.save();
  };

  /* ---------- the panel ---------- */
  const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  function exhibitsBox(ver, key) {
    const box = h('div', { class: 'md-ex' }, h('p', { class: 'small muted', role: 'status' }, 'Opening your data…'));
    const show = (list) => { box.replaceChildren(...(list ? [S.exhibitsView.packet(list, { key })] : [h('p', { class: 'small', role: 'status' }, 'The data for this version is not on this device. Uploaded files are kept in the browser that added them and are not part of backups.')])); };
    const hit = D.cache.get(ver.id); if (hit) show(hit); else D.load(ver).then(show);
    return box;
  }

  // scope: 'assignment' (Demonstrate Materials tab) or 'office' (the practice session)

  /* ---------- sending it to a review: only with the learner's explicit agreement for that one review (Phase 2D-3) ---------- */
  const INTRO = 'LEARNER-PROVIDED DATA (stored exactly as the learner imported it; "(blank)" means an empty cell; ids in brackets are the app’s own row references):';
  const BUDGET = 8000;
  D.prep = new Map(); // versionId -> what would be sent (versions never change, so this is safe to keep)

  // The learner's current dataset, if this review can offer it: Demonstrate assignments (graded flow) or the Office Hours session.
  D.eligible = function (a, scope) {
    if (scope === 'assignment' && !(a.kind === 'demonstrate' && !a.realEvidence)) return null;
    if (scope !== 'assignment' && scope !== 'office') return null;
    return current(get(a, scope));
  };
  // Exactly what would be sent, as text, plus a plain description of it. Sampling is by whole rows and is stated ("first N of M rows").
  D.prepareSend = async function (ver) {
    const ex = await D.load(ver); if (!ex) return null;
    const r = S.exhibits.asText({ exhibits: ex }, BUDGET, { intro: INTRO });
    const lines = r.text.split('\n'), rowsOf = (id) => lines.filter((l) => l.indexOf('[' + id + '-') === 0);
    const sheets = ex.map((e) => ({ name: (ver.sheets.find((s) => s.exhibitId === e.id) || {}).name || e.title, id: e.id, sent: (r.shown[e.id] || [0, 0])[0], total: e.table.rows.length, cols: e.table.columns.length }));
    return { text: r.text, chars: r.text.length, cut: r.cut, sheets, rows: sheets.reduce((t, s) => t + s.sent, 0), preview: sheets.flatMap((s) => rowsOf(s.id).slice(0, 3)).slice(0, 8) };
  };
  // Called at send time, only if the box was ticked. Re-checks that the dataset is still the one the learner saw described.
  D.forReview = async function (a, scope, seenId) {
    const ver = D.eligible(a, scope);
    if (!ver) throw new Error('Your data is no longer available for this review. Untick “Include my dataset” or add it again.');
    if (seenId && ver.id !== seenId) throw new Error('Your data changed after you ticked the box. Please read the description again and tick it again.');
    const p = D.prep.get(ver.id) || await D.prepareSend(ver);
    if (!p) throw new Error('The data for this version is not on this device, so it cannot be sent.');
    return { text: p.text, ref: { datasetId: (get(a, scope) || {}).id || '', versionId: ver.id, sent: p.sheets.filter((s) => s.sent).map((s) => s.name), rows: p.rows, chars: p.chars, at: new Date().toISOString() } };
  };
  // The authorization box shown above the usual "send it?" consent. Unticked by default, never remembered, and shown only when it can work.
  D.authBox = function (a, scope, d) {
    const ver = D.eligible(a, scope); if (!ver || !scope) return null;
    if (!(S.ai && S.ai.ready && S.ai.ready())) return null;
    if (!S.ai.workerVersion) { if (!D.asked) { D.asked = true; S.ai.ensureVersion(a).then(() => S.render(false)); } return null; }
    const box = (...k) => h('div', { class: 'md-auth' }, h('p', { class: 'md-auth-h' }, 'Your own data (optional)'), ...k);
    if (!S.ai.learnerOk()) return box(h('p', { class: 'small muted' }, 'Your data stays on this device. Including it in a review needs the AI service to be version 17 or newer (yours is version ' + S.ai.workerVersion + '), so this review will not use it.'));
    const p = D.prep.get(ver.id);
    if (!p) { D.prepareSend(ver).then((x) => { D.prep.set(ver.id, x || { missing: true }); S.render(false); }); return box(h('p', { class: 'small muted', role: 'status' }, 'Checking your data…')); }
    if (p.missing) return box(h('p', { class: 'small muted' }, 'The data for this version is not on this device (uploaded files are not part of backups), so it cannot be included.'));
    d.sendVer = ver.id;
    const on = !!d.sendData;
    return box(
      h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: on, disabled: d.busy, onchange: (e) => { d.sendData = e.target.checked; S.render(false); } }), h('span', {}, h('b', {}, 'Include my dataset in this review'), ' (off unless you tick it, and asked again for every review)')),
      on ? h('div', { class: 'md-auth-detail' },
        h('p', { class: 'small' }, 'If you send this review, the AI service will receive, for this review only and not kept by the service:'),
        h('ul', { class: 'plain small' },
          h('li', {}, 'Your dataset “' + ver.source.name + '”, added ' + when(ver.at) + '.'),
          p.sheets.map((s) => h('li', {}, s.name + ': ' + (s.sent < s.total ? 'the first ' + s.sent + ' of ' + s.total + ' rows (the rest will not be sent)' : s.total + ' row' + (s.total === 1 ? '' : 's')) + ', ' + s.cols + ' column' + (s.cols === 1 ? '' : 's') + '.')),
          h('li', {}, 'About ' + p.chars.toLocaleString() + ' characters of text in all, with row ids so the review can point to a row.')),
        p.cut ? h('p', { class: 'small' }, h('b', {}, 'Some rows are left out. '), 'The AI will be told it saw only part of the data and should make no claims about the rest.') : null,
        h('p', { class: 'small muted' }, 'This is your own data. The AI cannot tell whether it is real or correct; it checks your work against it. Your original file never leaves this device.'),
        p.preview.length ? h('details', { class: 'inspect' }, h('summary', {}, 'Preview of the first rows that will be sent'), h('pre', { class: 'small md-prev' }, p.preview.join('\n'))) : null)
      : h('p', { class: 'small muted' }, 'Not included: this review will run without your data and will not refer to it.'));
  };

  /* ---------- Phase 2D-4: show the cited row from the version the review was given ---------- */
  const findVer = (a, id) => { const all = [].concat((a.myData && a.myData.versions) || [], (a.office && a.office.data && a.office.data.versions) || []); return all.find((v) => v.id === id) || null; };
  // A review that cited a row of the learner's own data shows that row as it was in the version the AI received, even after the data was replaced.
  D.refRow = function (a, data, ref) {
    if (!ref || !/^U\d$/.test(ref.exhibit || '') || !ref.row) return null;
    const box = h('div', { class: 'md-refrow small', role: 'status' }, 'Opening the cited row of your data…');
    const say = (t) => { box.replaceChildren(t); };
    if (!data || !data.versionId) { say('This citation points to your own data, but this review did not record which version it used.'); return box; }
    const ver = findVer(a, data.versionId);
    if (data.removed || !ver) { say('The data version this review was given has been deleted from this device, so the row can no longer be shown.'); return box; }
    D.load(ver).then((list) => {
      const ex = list && list.find((e) => e.id === ref.exhibit), row = ex && ex.table.rows.find((r) => r.id === ref.row);
      if (!row) { say('That row is not available in the data version this review was given.'); return; }
      const cells = ex.table.columns.map((c) => h('span', { class: 'md-cell' + (ref.column && ref.column === c.label ? ' md-hit' : '') }, h('b', {}, c.label + ': '), row.cells[c.key] === '' ? '(blank)' : row.cells[c.key]));
      box.replaceChildren(h('b', {}, row.id + ' in your data'), ' (the version you sent on ' + when(data.at || ver.at) + '): ', ...cells.flatMap((c, i) => (i ? [' · ', c] : [c])));
    });
    return box;
  };

  D.panel = function (c, m, a, scope) {
    const d = get(a, scope), cur = current(d), office = scope === 'office';
    const inp = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', class: 'sr-only', 'aria-label': 'Choose a CSV or Excel file', tabindex: '-1' });
    const choose = (note) => { inp.dataset.note = note || ''; inp.click(); };
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      const startAt = 0;
      try {
        const res = await S.dataImport.dialog(f, { startAt }); if (!res) return;
        await D.add(a, scope, res, inp.dataset.note || ''); S.toast('Your data was added. It stays on this device.'); S.render(false);
      } catch (e) { S.toast(e && e.message ? e.message : 'Your data could not be added.'); }
    });
    const intro = office
      ? 'Optional. Add a CSV or Excel file for this practice session only. It stays with this session, separate from your graded work.'
      : 'Optional. This assignment already has everything you need. You can add a CSV or Excel file of your own to personalize or extend it. It does not replace the supplied materials above.';
    const nodes = [h('div', { class: 'md-head' }, h('h3', { class: 'md-h' }, 'Your data'), h('span', { class: 'ex-tag ex-mine' }, 'Optional · Added by you')), h('p', { class: 'small muted' }, intro), inp];
    if (!cur) {
      nodes.push(h('div', { class: 'btn-row' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => choose('') }, 'Add your own data'),
        office && current(a.myData) ? h('button', { class: 'linkbtn', type: 'button', onclick: async () => { try { await D.copyToOffice(a); S.toast('Copied into this session.'); S.render(false); } catch (e) { S.toast(e.message); } } }, 'Use a copy of my assignment data') : null));
      if (d && d.versions.length) nodes.push(h('p', { class: 'small muted' }, 'Earlier versions used in reviews are kept below.'));
    } else {
      nodes.push(h('p', { class: 'small' }, h('b', {}, cur.source.name), ' · ' + kb(cur.source.size) + ' · added ' + when(cur.at) + (cur.note ? ' · ' + cur.note : '')), exhibitsBox(cur, (office ? 'od-' : 'md-') + a.id));
      if (cur.left.length || cur.notes.length) nodes.push(h('details', { class: 'inspect' }, h('summary', {}, 'What was left out or changed when this was added'), cur.left.length ? h('ul', { class: 'plain small' }, cur.left.map((x) => h('li', {}, x))) : h('p', { class: 'small' }, 'Nothing was left out.'), cur.notes.length ? h('ul', { class: 'plain small muted' }, cur.notes.map((x) => h('li', {}, x))) : null));
      nodes.push(h('p', { class: 'small muted' }, 'Stays on this device and is never sent to the AI service in this version of the app. Your original file is kept unchanged.'),
        h('div', { class: 'btn-row' }, h('button', { class: 'linkbtn', type: 'button', onclick: () => choose('Replaced the earlier file') }, 'Replace with a new file'),
          h('button', { class: 'linkbtn danger', type: 'button', onclick: () => { if (!window.confirm('Remove your data from this ' + (office ? 'session' : 'assignment') + '? Your supplied materials, submissions and grades are not affected. Versions that a review used are kept.')) return; D.removeCurrent(a, scope); S.toast('Your data was removed.'); S.render(false); } }, 'Remove my data')));
    }
    if (d && d.versions.length > (cur ? 1 : 0)) {
      const older = d.versions.filter((v) => v.id !== d.currentId).slice().reverse();
      nodes.push(h('details', { class: 'inspect md-vers' }, h('summary', {}, (cur ? 'Earlier versions' : 'Versions kept') + ' (' + older.length + ')'),
        h('p', { class: 'small muted' }, 'An earlier version is kept as long as a review used it, so that review can still be explained. Replacing your data never changes an earlier review.'),
        h('ul', { class: 'plain' }, older.map((v) => { const used = reviewsUsing(a, v.id).length;
          return h('li', {}, h('p', { class: 'small' }, h('b', {}, v.source.name), ' · ' + when(v.at) + ' · ' + v.sheets.map((s) => s.name + ' (' + s.rows + ' rows)').join(', ')),
            used ? h('p', { class: 'small muted' }, 'Used in ' + used + ' review' + (used === 1 ? '' : 's') + '. Read-only.') : null,
            h('details', { class: 'inspect' }, h('summary', {}, 'Show this version'), exhibitsBox(v, 'mdv-' + v.id)),
            h('button', { class: 'linkbtn danger', type: 'button', onclick: () => { const msg = used ? 'This version was used in ' + used + ' review' + (used === 1 ? '' : 's') + '. The review' + (used === 1 ? '' : 's') + ' will keep the record that data was used, but its rows will no longer open. Delete it?' : 'Delete this version from this device?'; if (!window.confirm(msg)) return; D.deleteVersion(a, scope, v.id, true); S.render(false); } }, 'Delete this version'));
        }))));
    }
    return h('section', { class: 'md', 'aria-label': 'Your data (optional)' }, nodes);
  };
})(window.Sovereign);
