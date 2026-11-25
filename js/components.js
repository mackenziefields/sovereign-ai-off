/* sovereign. — small DOM helpers shared by the views. */
(function (S) {
  'use strict';

  // h('div', {class:'x', onclick: fn}, child, 'text', [more]) -> element. Text is always inserted as text, never HTML.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else el.append(k.nodeType ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  }
  S.h = h;

  // o: value, required, placeholder, hint, multiline, rows, type ('text' | 'number' | 'date')
  S.field = function (label, name, o = {}) {
    const val = o.value == null ? '' : String(o.value);
    const control = o.multiline
      ? h('textarea', { name, value: val, required: o.required, placeholder: o.placeholder || '', rows: o.rows || 3 })
      : h('input', {
          type: o.type || 'text', name, value: val, required: o.required, placeholder: o.placeholder || '', autocomplete: 'off',
          min: o.type === 'number' ? '0' : null, step: o.type === 'number' ? 'any' : null, inputmode: o.type === 'number' ? 'decimal' : null,
        });
    return h('label', { class: 'field' }, h('span', {}, label), control, o.hint ? h('small', {}, o.hint) : null);
  };

  S.select = (label, name, options, value) =>
    h('label', { class: 'field' }, h('span', {}, label),
      h('select', { name }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));

  S.progressBar = (pct, label) =>
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label || 'Progress' },
      h('span', { style: 'width:' + pct + '%' }));

  S.checkbox = (checked, label, onChange) =>
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked, 'aria-label': label, onchange: (e) => onChange(e.target.checked) }),
      h('span', { class: 'box', 'aria-hidden': 'true' }));

  // Canvas-style picture tile: a patterned colour banner with a label, then title and progress bar.
  // o: href, color (0-5), label, title, meta, pct, badge
  S.tile = (o) =>
    h('a', { class: 'tile', href: o.href, 'data-theme': o.theme || null },
      h('div', { class: 'tile-art art-' + o.color, style: '--c:' + S.COLORS[o.color], 'aria-hidden': 'true' },
        h('span', { class: 'tile-label' }, o.label),
        o.num ? h('span', { class: 'tile-num' }, String(o.num).padStart(2, '0')) : null,
        o.badge ? h('span', { class: 'tile-badge' }, o.badge) : null),
      h('div', { class: 'tile-body' },
        h('h3', { class: 'tile-title' }, o.title),
        h('p', { class: 'tile-meta' }, o.meta),
        S.progressBar(o.pct, o.title + ' progress')));

  // The course title, split into words so each design can stack, italicise or size it. Long titles and long words shrink to fit
  // (the sizes use container-query units; see css/themes.css). The title is always the real course title.
  const CHAR_W = { modernist: .5, editorial: .46, intellectual: .38, institution: .8 };
  S.titleEl = (tag, cls, title, theme) => {
    const words = String(title || '').trim().split(/\s+/).filter(Boolean);
    const total = words.join(' ').length, longest = Math.max(1, ...words.map((w) => w.length));
    const k = total <= 12 ? 1 : total <= 22 ? .82 : total <= 34 ? .68 : total <= 52 ? .54 : .44;
    const wfit = Math.round(880 / (longest * (CHAR_W[theme] || .6))) / 10;
    const stack = words.length <= 4 && total <= 30;
    const el = h(tag, { class: ((cls || '') + (stack ? ' stack' : '')).trim() || null, style: '--k:' + k + ';--wfit:' + wfit });
    words.forEach((w, i) => { if (i) el.append(' '); el.append(h('span', { class: 'w' + (words.length > 1 && i === words.length - 1 ? ' tail' : '') }, w)); });
    return el;
  };

  // A course as a small publication in one of four designs (o.theme). o: href, theme, code, title, meta, pct, tag ('div' for a preview)
  S.cover = (o) => {
    const theme = o.theme || 'modernist';
    return h(o.tag || 'a', { class: 'cover', 'data-theme': theme, href: o.tag ? null : o.href },
      h('div', { class: 'cover-top' }, h('span', {}, o.code), h('span', {}, 'sovereign.')),
      S.titleEl('h3', 'cover-title', o.title, theme),
      h('div', { class: 'cover-foot' },
        h('div', { class: 'cover-pct' }, h('strong', {}, o.pct + '%'), h('span', {}, o.meta)),
        S.progressBar(o.pct, o.title + ' progress')));
  };

  // Learn (circle), Apply (square), Demonstrate (triangle): a shape and a word, never colour alone.
  S.KINDS = [['learn', 'Learn'], ['apply', 'Apply'], ['demonstrate', 'Demonstrate']];
  S.kindMark = (kind) => {
    const k = S.KINDS.find((x) => x[0] === kind);
    return k ? h('span', { class: 'kmark kmark-' + k[0] }, k[1]) : null;
  };

  // Small line icons for navigation (16px, drawn with the text colour). Fixed strings written here, never user content.
  const ICONS = {
    dash: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    work: '<path d="M9 4.5h6v3H9z"/><path d="M9 6H6.5v14h11V6H15"/><path d="m9.5 13.5 2 2 3.5-4"/>',
    data: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6"/><path d="M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/>',
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>',
    announcements: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
    syllabus: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12h6M9 15.5h6"/>',
    modules: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',
    assignments: '<path d="M5 20.5l1-4.5L16.5 5.5a2 2 0 0 1 3 3L9 19z"/><path d="m14.5 7.5 3 3"/>',
    grades: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    portfolio: '<rect x="3.5" y="7.5" width="17" height="12" rx="1.5"/><path d="M9 7.5V5h6v2.5"/><path d="M3.5 13h17"/>',
  };
  S.icon = (name) => {
    const s = document.createElement('span');
    s.className = 'ico'; s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
    return s;
  };

  S.badge = (text, kind) => h('span', { class: 'badge ' + (kind || '') }, text);
  S.plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  S.trunc = (t, n) => (t.length > n ? t.slice(0, n).trimEnd() + '…' : t);

  let timer;
  S.toast = function (msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.remove('show'), 3000);
  };

  // Navigate, forcing a re-render even if the hash is unchanged.
  S.go = function (hash) {
    if ((location.hash || '#/') === hash) S.render(true); else location.hash = hash;
  };

  S.commit = function () { S.save(); S.render(false); };
  // AI-written scenarios and documents are always labeled as fictional, in code, whatever the model wrote.
  S.FICTION_LABEL = 'FICTIONAL: written by AI for this exercise. All people, organizations, data, dates and quotations below are invented and are not real sources.';
  S.labelFiction = (t) => { t = String(t || '').trim(); return t && !/^\W*(fictional|hypothetical|fictitious)\b/i.test(t) ? S.FICTION_LABEL + '\n\n' + t : t; };
  // Real-evidence assignments: list the module's readings whose links responded and whose page title matched; otherwise "needed".
  S.verifiedSources = (m) => (m.readings || []).filter((r) => r.url && r.source !== 'placeholder' && r.verification && r.verification.status === 'reachable' && r.verification.titleMatch !== false).slice(0, 8).map((r) => ({ title: r.title, url: r.url }));
  S.setEvidence = (m, a) => { const sources = S.verifiedSources(m); a.evidence = { status: sources.length ? 'verified' : 'needed', sources }; };
})(window.Sovereign = window.Sovereign || {});
