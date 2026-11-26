/* sovereign. (AI-off copy) — replaces the full app's syllabus tools.
   In the full app these buttons send a syllabus or a reading's link to the AI service to read or check. That needs the AI, so this copy
   has none of them. Syllabi you add stay on the module as plain references (title, link, note); add the readings you need yourself. */
(function (S) {
  'use strict';
  S.syl = { checkButton: () => null, button: () => null, paste: () => null, panel: () => null };
})(window.Sovereign = window.Sovereign || {});
