/* sovereign. — Syllabus sourcing, reviewed (build 21).
   Read a syllabus (a link, or text you paste) -> see exactly what was found and how far each reading could be checked -> tick the ones to adopt
   -> optionally ask for PROPOSED revisions of assignments around them -> approve each one. Nothing is added or rewritten without a tick.
   Pasted text is sent only after you agree, is used for this reading only, and is not kept by this app or the service. */
(function (S) {
  'use strict';
  const { h, field, checkbox, plural, toast, commit } = S;
  const state = new Map(); // per syllabus id (this visit only): { busy, review, pick:Set, added:[], rev:{...}, error }
  const get = (id) => { if (!state.has(id)) state.set(id, { pick: new Set() }); return state.get(id); };
  const draft = new Map(); // pasted text kept in memory only, so a failed attempt can be retried
  const redraw = () => S.render(false);

  const STAGES = {
    'not-accessible': ['Could not open this syllabus', 'bad'],
    'no-readings': ['Opened, but no readings found for this module', 'warn'],
    'readings-found': ['Readings found. None could be independently checked', 'warn'],
    'verified': ['Readings found. Some links were checked by a program', 'ok'],
    'manual-review': ['Readings found. Check them against the syllabus yourself', 'warn'],
  };
  const KIND_NOTE = { page: 'Read from the web page.', pdf: 'Read from a document (for example a PDF).', pasted: 'Read from the text you pasted.' };
  const REVIEW = {
    'link-checked': ['Link checked', 'ok', 'A program opened the link and the page title matched. It did not review the content.'],
    'check-link': ['Link not confirmed', 'warn', 'The link could not be confirmed. Check it before you rely on it.'],
    'in-syllabus': ['Listed in the syllabus', 'soft', 'The title appears in the syllabus text. No link was found.'],
    'not-in-text': ['Not found in the syllabus text', 'warn', 'The AI found this by searching; its title does not appear in the syllabus text it read, so it may not be assigned there.'],
    'manual-review': ['Check manually', 'warn', 'Read by the AI from a document this service cannot search. Check it against the syllabus.'],
  };

  /* ----- reading a syllabus ----- */
  async function read(c, m, y, text) {
    const s = get(y.id);
    if (!S.ai.ready()) { toast('AI is switched off in this copy.'); return false; }
    s.busy = true; s.error = ''; s.review = null; s.added = null; s.rev = null; redraw();
    try {
      s.review = await S.ai.readSyllabus(c, m, y, text, {});
      s.pick = new Set(); s.review.items.forEach((x, i) => { if (!x.dup && (x.review === 'link-checked' || x.review === 'in-syllabus')) s.pick.add(i); });
      s.busy = false; redraw(); return true;
    } catch (e) { s.busy = false; s.error = e.message; redraw(); return false; }
  }

  /* ----- "Check content": does the page behind a link hold the reading? (AI service version 13) ----- */
  const CHECK_MAX = 5;
  const checking = new Set(); // module ids and syllabus ids with a check running
  const COST_NOTE = 'Opens each link and has the AI read the start of the page. About a few cents per reading.';
  const countStatus = (rs) => rs.reduce((t, x) => { if (x) t[x.status] = (t[x.status] || 0) + 1; return t; }, {});
  const summary = (t) => [t.matched && t.matched + ' matched', t.about && t.about + ' about the work only', t.mismatch && t.mismatch + ' didn’t match', t.unreadable && t.unreadable + ' couldn’t be checked'].filter(Boolean).join(', ') || 'nothing could be checked';

  S.syl = {
    // On the module's reading list: checks the readings that have a link (unchecked ones first, five at a time).
    checkButton(c, m) {
      const cand = (m.readings || []).filter((r) => r.source === 'ai' && r.url);
      if (!cand.length) return null;
      const pick = cand.filter((r) => !r.contentCheck).concat(cand.filter((r) => r.contentCheck)).slice(0, CHECK_MAX), key = 'check:' + m.id, busy = checking.has(key);
      return h('button', { class: 'btn ghost', type: 'button', disabled: busy, title: COST_NOTE, onclick: async () => {
        if (!S.ai.ready()) return toast('AI is switched off in this copy.');
        checking.add(key); redraw();
        try {
          const res = await S.ai.checkContent(c, m, pick.map((r) => ({ title: r.title, creator: r.creator, url: r.url })), {});
          pick.forEach((r, i) => { if (res[i]) r.contentCheck = res[i]; });
          S.save(); toast('Content check: ' + summary(countStatus(res)) + '.');
        } catch (e) { toast(e.message); }
        checking.delete(key); redraw();
      } }, busy ? 'Checking content…' : 'Check content' + (pick.length < cand.length ? ' (' + pick.length + ' of ' + cand.length + ')' : ' (' + pick.length + ')'));
    },

    // The button next to a syllabus that has a link.
    button(c, m, y) {
      const s = get(y.id);
      return y.url ? h('button', { class: 'btn ghost', type: 'button', disabled: !!s.busy, onclick: () => read(c, m, y, '') }, s.busy ? 'Reading the syllabus…' : (y.sourcedAt || s.review ? 'Read again' : 'Read this syllabus')) : null;
    },

    // Paste a syllabus instead of (or when) its link can't be opened.
    paste(c, m) {
      const key = 'paste:' + m.id, s = get(key);
      return h('details', { class: 'add' }, h('summary', {}, 'Paste a syllabus instead'),
        h('form', { class: 'syl-paste', onsubmit: async (e) => {
          e.preventDefault(); const f = new FormData(e.target);
          const text = String(f.get('text') || '').trim(), title = String(f.get('title') || '').trim() || 'Pasted syllabus';
          if (text.length < 80) return toast('Paste the reading list or schedule from the syllabus (at least a few lines).');
          draft.set(key, { text, title });
          const y = S.makeSyllabus({ title, url: '', note: 'Pasted text. The text itself is not kept.', source: 'user' });
          if (!S.ai.ready()) return toast('AI is switched off in this copy.');
          s.busy = true; s.error = ''; redraw();
          try {
            const review = await S.ai.readSyllabus(c, m, y, text, {});
            m.syllabi.push(y); S.save();
            const ys = get(y.id); ys.review = review; ys.pick = new Set(); review.items.forEach((x, i) => { if (!x.dup && (x.review === 'link-checked' || x.review === 'in-syllabus')) ys.pick.add(i); });
            draft.delete(key); s.busy = false; commit();
          } catch (err) { s.busy = false; s.error = err.message; redraw(); }
        } },
          h('p', { class: 'small muted' }, 'Use this when a syllabus is behind a login, is a file the service cannot open, or you have it as text. Paste the reading list or schedule (up to about 30,000 characters).'),
          field('Name it', 'title', { placeholder: 'e.g. WGS 101, Prof. Name, University', value: (draft.get(key) || {}).title || '' }),
          field('Syllabus text', 'text', { multiline: true, rows: 8, required: true, value: (draft.get(key) || {}).text || '' }),
          h('label', { class: 'consent' }, h('input', { type: 'checkbox', required: true }),
            h('span', {}, 'This text will be sent to the AI service to read. It is used for this reading only and is not kept by the service or saved in this app. Send it?')),
          s.error ? h('p', { class: 'banner error', role: 'alert' }, s.error) : null,
          h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'submit', disabled: !!s.busy }, s.busy ? 'Reading…' : 'Read pasted syllabus'))));
    },

    // The review panel under one syllabus: findings, ticks, adoption, then the optional revision step.
    panel(c, m, y) {
      const s = get(y.id);
      if (s.error) return h('div', { class: 'syl-review', role: 'alert' }, h('p', { class: 'banner error' }, s.error));
      const rv = s.review; if (!rv) return null;
      const [title, tone] = STAGES[rv.stage] || STAGES['no-readings'];
      const head = h('div', { class: 'syl-head' },
        h('span', { class: 'badge ' + (tone === 'ok' ? 'ok' : tone === 'bad' ? 'warn' : 'soft') }, rv.stage.replace('-', ' ')),
        h('strong', {}, title),
        rv.stage !== 'not-accessible' ? h('span', { class: 'small muted' }, KIND_NOTE[rv.kind] || '') : null);
      if (rv.stage === 'not-accessible') return h('div', { class: 'syl-review' }, head, h('p', {}, rv.reason),
        h('p', { class: 'small muted' }, 'Nothing was added. Try a different link, or use “Paste a syllabus instead” below.'));
      const skippedNote = rv.skipped ? h('p', { class: 'small muted' }, plural(rv.skipped, 'reading') + ' in this syllabus had no online link, so ' + (rv.skipped === 1 ? 'it was' : 'they were') + ' left out. Only readings with a link are listed.') : null;
      if (!rv.items.length) return h('div', { class: 'syl-review' }, head, h('p', {}, rv.reason), skippedNote, h('p', { class: 'small muted' }, 'Nothing was added.'));

      const list = h('ul', { class: 'syl-items' }, rv.items.map((x, i) => {
        const r = REVIEW[x.review] || REVIEW['check-link'];
        return h('li', { class: 'syl-item' },
          h('label', { class: 'checkline' },
            h('span', { class: 'check' }, h('input', { type: 'checkbox', disabled: x.dup || !!s.added, checked: s.pick.has(i), onchange: (e) => { e.target.checked ? s.pick.add(i) : s.pick.delete(i); redraw(); } }), h('span', { class: 'box', 'aria-hidden': 'true' })),
            h('span', {}, h('b', {}, x.title), x.creator ? ' · ' + x.creator : '')),
          h('div', { class: 'syl-meta' },
            h('span', { class: 'badge ' + r[1], title: r[2] }, r[0]),
            x.contentCheck && S.CONTENT_TEXT[x.contentCheck.status] ? h('span', { class: 'badge ' + S.CONTENT_TEXT[x.contentCheck.status][1], title: S.CONTENT_TEXT[x.contentCheck.status][2] + ' ' + (x.contentCheck.detail || '') }, S.CONTENT_TEXT[x.contentCheck.status][0]) : null,
            x.dup ? h('span', { class: 'badge soft' }, 'Already in this module') : null,
            x.url ? h('a', { class: 'small', href: x.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open link') : null),
          h('p', { class: 'small muted' }, r[2] + (x.relevance ? ' ' + x.relevance : '')),
          x.contentCheck && x.contentCheck.detail ? h('p', { class: 'small' }, h('b', {}, 'Content check: '), x.contentCheck.detail + (x.contentCheck.status === 'mismatch' ? ' It was unticked; tick it again if you disagree.' : '')) : null);
      }));
      const n = s.pick.size, linked = rv.items.filter((x) => x.url && !x.dup), ckey = 'check:' + y.id;
      const checkRow = !s.added && linked.length ? h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost', type: 'button', disabled: checking.has(ckey), title: COST_NOTE, onclick: async () => {
          if (!S.ai.ready()) return toast('AI is switched off in this copy.');
          const list = linked.slice(0, CHECK_MAX); checking.add(ckey); redraw();
          try {
            const res = await S.ai.checkContent(c, m, list, {});
            list.forEach((x, i) => { if (!res[i]) return; x.contentCheck = res[i]; if (res[i].status === 'mismatch') s.pick.delete(rv.items.indexOf(x)); });
            toast('Content check: ' + summary(countStatus(res)) + '.');
          } catch (e) { toast(e.message); }
          checking.delete(ckey); redraw();
        } }, checking.has(ckey) ? 'Checking content…' : 'Check content (' + Math.min(linked.length, CHECK_MAX) + ')'),
        h('span', { class: 'small muted' }, 'Reads the page behind each link. ' + COST_NOTE)) : null;
      const adopt = s.added ? h('p', { class: 'banner' }, 'Added ' + plural(s.added.length, 'reading') + ' to this module.')
        : h('div', { class: 'btn-row' },
            h('button', { class: 'btn', type: 'button', disabled: !n, onclick: () => { s.added = S.ai.adoptReadings(c, m, y, rv.items.filter((_, i) => s.pick.has(i))); toast('Added ' + plural(s.added.length, 'reading') + '.'); commit(); } }, n ? 'Add ' + plural(n, 'selected reading') : 'Tick readings to add'),
            h('span', { class: 'small muted' }, 'Only ticked readings are added. Your own readings are never changed.'));
      return h('div', { class: 'syl-review' }, head, rv.reason ? h('p', { class: 'small' }, rv.reason) : null, skippedNote, list, checkRow, adopt, s.added && s.added.length ? revisePanel(c, m, y, s) : null);
    },
  };

  /* ----- optional: revise assignments around the readings just added ----- */
  const touched = (a) => !!(a.work || a.done);

  function revisePanel(c, m, y, s) {
    const rv = s.rev = s.rev || { sel: new Set(), ok: new Set() };
    const as = m.assignments;
    if (!as.length) return null;
    if (!rv.list) {
      return h('div', { class: 'syl-rev' },
        h('h4', { class: 'minor' }, 'Update assignments to use these readings? (optional)'),
        h('p', { class: 'small muted' }, 'The AI proposes new wording for the ones you pick. You see each before and after and approve it. Points, grading criteria, submissions and grades never change, and the earlier wording is kept so you can restore it. Up to three at a time.'),
        h('ul', { class: 'syl-items' }, as.map((a) => h('li', { class: 'syl-item' },
          h('label', { class: 'checkline' },
            h('span', { class: 'check' }, h('input', { type: 'checkbox', checked: rv.sel.has(a.id), onchange: (e) => { if (e.target.checked && rv.sel.size >= 3) { e.target.checked = false; return toast('Pick up to three at a time.'); } e.target.checked ? rv.sel.add(a.id) : rv.sel.delete(a.id); redraw(); } }), h('span', { class: 'box', 'aria-hidden': 'true' })),
            h('span', {}, h('b', {}, a.title), ' · ' + S.stageOf(a))),
          touched(a) ? h('p', { class: 'small muted' }, a.work ? 'You have submitted work for this one. It stays as it is; only the assignment text would change.' : 'Marked complete. Only the assignment text would change.') : null))),
        rv.error ? h('p', { class: 'banner error', role: 'alert' }, rv.error) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', disabled: !rv.sel.size || !!rv.busy, onclick: async () => {
            rv.busy = true; rv.error = ''; redraw();
            try { rv.list = await S.ai.proposeRevisions(c, m, s.added, as.filter((a) => rv.sel.has(a.id)), {}); rv.ok = new Set(rv.list.filter((x) => x.rev && !touched(x.a)).map((x) => x.a.id)); }
            catch (e) { rv.error = e.message; }
            rv.busy = false; redraw();
          } }, rv.busy ? 'Writing proposals…' : 'Propose revisions' + (rv.sel.size ? ' for ' + rv.sel.size : ''))));
    }
    if (rv.done) return h('p', { class: 'banner' }, 'Applied ' + plural(rv.done, 'revision') + '. You can restore the earlier wording from each assignment’s Brief.');
    return h('div', { class: 'syl-rev' },
      h('h4', { class: 'minor' }, 'Proposed revisions'),
      h('p', { class: 'small muted' }, 'Nothing has changed yet. Tick the ones to apply.'),
      rv.list.map(({ a, rev }) => {
        if (!rev) return h('div', { class: 'rev-card' }, h('b', {}, a.title), h('p', { class: 'small muted' }, 'The AI could not write a revision for this one. It is unchanged.'));
        const steps = (ps) => h('ol', { class: 'plain' }, ps.map((p) => h('li', {}, h('b', {}, p.title), p.questions.length ? ': ' + p.questions.join(' / ') : '')));
        return h('div', { class: 'rev-card' },
          h('label', { class: 'checkline' },
            h('span', { class: 'check' }, h('input', { type: 'checkbox', checked: rv.ok.has(a.id), onchange: (e) => { e.target.checked ? rv.ok.add(a.id) : rv.ok.delete(a.id); redraw(); } }), h('span', { class: 'box', 'aria-hidden': 'true' })),
            h('span', {}, h('b', {}, a.title), ' · ' + S.stageOf(a))),
          rev.changeNote ? h('p', { class: 'small' }, rev.changeNote) : null,
          touched(a) ? h('p', { class: 'small muted' }, (a.work ? 'You have submitted work here' : 'This is marked complete') + '. Applying changes only the assignment wording; your work, score and history stay. Tick it to confirm.') : null,
          h('details', {}, h('summary', {}, 'Compare before and after'),
            h('div', { class: 'rev-cols' },
              h('div', {}, h('p', { class: 'wb-pane-k' }, 'Now'), h('p', { class: 'pre small' }, a.description), steps(a.parts)),
              h('div', {}, h('p', { class: 'wb-pane-k' }, 'Proposed'), h('p', { class: 'pre small' }, rev.description), steps(rev.parts),
                rev.materials && S.stageOf(a) !== 'learn' && !a.realEvidence && rev.materials !== a.materials ? h('p', { class: 'small muted' }, 'The supplied material would also change (it stays labelled fictional).') : null))));
      }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', disabled: !rv.ok.size, onclick: () => {
          const readings = s.added; let n = 0;
          rv.list.forEach(({ a, rev }) => { if (rev && rv.ok.has(a.id)) { S.ai.applyRevision(a, rev, readings); n++; } });
          rv.done = n; toast('Applied ' + plural(n, 'revision') + '.'); commit();
        } }, rv.ok.size ? 'Apply ' + plural(rv.ok.size, 'revision') : 'Tick to apply'),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { rv.list = null; rv.sel = new Set(); redraw(); } }, 'Back'),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { s.rev = null; redraw(); } }, 'Discard proposals')));
  }
})(window.Sovereign = window.Sovereign || {});
