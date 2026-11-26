/* sovereign. (AI-off copy) — labels for readings and syllabi that were found by the AI in the full app and arrived in an imported backup.
   The full app's course builder, AI settings box and cost summaries are not part of this copy. */
(function (S) {
  'use strict';
  const { h } = S;

  /* ---------- resource labels (shown on each reading) ---------- */

  const VERIFY_TEXT = {
    reachable: ['Link responded', 'ok'], unreachable: ['Link not reachable', 'warn'], blocked: ['Site blocks checks', 'warn'],
    broken: ['Link broken', 'warn'], 'not-checked': ['Link not checked', ''],
  };

  // Result of "Check content": a program fetched the page text and an AI judged what kind of page it is. Neither is a human review.
  const CONTENT_TEXT = {
    matched: ['Content matched', 'ok', 'The page appears to contain this work. Checked by a program and an AI reading the start of the page; it is not a human review.'],
    about: ['About the work, not the work', 'warn', 'The page describes the work (a listing, abstract, review or summary) but does not appear to be the work itself.'],
    mismatch: ['Doesn’t match', 'warn', 'The page does not appear to be this work.'],
    unreadable: ['Couldn’t check content', 'soft', 'The page could not be read or judged. Nothing is claimed; look at it yourself.'],
  };
  S.CONTENT_TEXT = CONTENT_TEXT;

  // Returns the extra labels for a reading, or null for plain (user-made) readings.
  S.readingLabels = function (r) {
    if (r.source === 'placeholder') return h('div', { class: 'ai-meta' }, h('span', { class: 'badge warn' }, 'Source needed'), h('span', { class: 'small muted' }, 'No verifiable source was found. Edit this to add your own.'));
    if (r.source !== 'ai') return null;
    const v = r.verification || {}, vt = !r.url ? ['Citation only: no link found', 'warn'] : (VERIFY_TEXT[v.status] || VERIFY_TEXT['not-checked']);
    const cc = r.contentCheck && r.url ? CONTENT_TEXT[r.contentCheck.status] : null;
    const tags = [
      h('span', { class: 'badge ' + vt[1], title: v.detail || '' }, vt[0]),
      cc ? h('span', { class: 'badge ' + cc[1], title: cc[2] + (r.contentCheck.detail ? ' ' + r.contentCheck.detail : '') }, cc[0]) : null,
      v.status === 'reachable' && v.titleMatch === true ? h('span', { class: 'badge', title: 'The page’s title resembles the expected title. This does not confirm the content.' }, 'Title matches') : null,
      v.status === 'reachable' && v.titleMatch === false ? h('span', { class: 'badge warn', title: 'The page’s title is different from what the search result said.' }, 'Title differs') : null,
      r.sourceType && r.sourceType !== 'web' ? h('span', { class: 'badge ok', title: 'Type of website, from its address' }, S.label(S.SOURCE_TYPES, r.sourceType)) : null,
      r.kind ? h('span', { class: 'badge' }, S.label(S.READING_KINDS, r.kind)) : null,
      r.access && r.access !== 'unknown' ? h('span', { class: 'badge' }, r.access === 'free' ? 'Free' : 'Paid') : null,
      h('span', { class: 'badge soft' }, 'AI-suggested'),
    ].filter(Boolean);
    return h('div', { class: 'ai-meta' }, tags,
      r.creator ? h('div', { class: 'small muted ai-line' }, 'By ' + r.creator) : null,
      r.derivedFrom ? h('div', { class: 'small ai-line' }, 'Derived from: ', r.derivedUrl ? h('a', { href: r.derivedUrl, target: '_blank', rel: 'noopener noreferrer' }, r.derivedFrom) : r.derivedFrom, '. Taken from that course’s reading list by AI.') : null,
      r.relevance ? h('div', { class: 'small ai-line' }, h('b', {}, 'Why it fits (AI’s opinion): '), r.relevance) : null,
      v.pageTitle ? h('div', { class: 'small muted ai-line' }, 'Page title: ' + v.pageTitle) : null,
      v.detail ? h('div', { class: 'small muted ai-line' }, v.detail) : null,
      cc && r.contentCheck.detail ? h('div', { class: 'small ai-line' }, h('b', {}, 'Content check: '), r.contentCheck.detail, ' (' + r.contentCheck.checkedAt.slice(0, 10) + ')') : null,
      v.checkedAt && r.url ? h('div', { class: 'small muted ai-line' }, 'Checked by a program on ' + v.checkedAt.slice(0, 10) + '. A working link does not guarantee it covers this topic well; please look it over.') : null);
  };

  S.syllabusLabels = function (y) {
    const v = y.verification || {}, vt = VERIFY_TEXT[v.status] || VERIFY_TEXT['not-checked'];
    return h('div', { class: 'ai-meta' },
      y.sourceType && y.sourceType !== 'web' ? h('span', { class: 'badge ok' }, S.label(S.SOURCE_TYPES, y.sourceType)) : null,
      h('span', { class: 'badge ' + vt[1], title: v.detail || '' }, vt[0]),
      h('span', { class: 'badge soft' }, y.source === 'ai' ? 'Found by AI' : 'Added by you'),
      y.note ? h('div', { class: 'small muted ai-line' }, y.note) : null,
      v.checkedAt ? h('div', { class: 'small muted ai-line' }, 'Link checked by a program on ' + v.checkedAt.slice(0, 10) + '.') : null);
  };

})(window.Sovereign = window.Sovereign || {});
