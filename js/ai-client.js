/* sovereign. (AI-off copy) — replaces the AI client of the full app.
   This file has no network code at all: no fetch, no service address, no access code. What is left are the two small helpers
   that work on data already on this device (restoring an assignment's earlier wording, removing an evidence packet).
   ai.ready() is always false. js/ai-off.js still loads last as a second switch. */
(function (S) {
  'use strict';
  const ai = (S.ai = {});
  ai.ready = () => false;

  // Restores the wording an assignment had before a revision that was approved in the full app. Points, rubric, work and grades are never touched.
  ai.restoreRevision = function (a) {
    const v = a.revisions && a.revisions.pop(); if (!v) return false;
    a.description = v.before.description; a.parts = v.before.parts; a.materials = v.before.materials;
    S.save(); return true;
  };
  // Removes an assignment's evidence packet. The instructions, supplied text and any submitted work are not affected.
  ai.removePacket = function (a) { a.exhibits = []; a.packet = null; S.save(); };
})(window.Sovereign = window.Sovereign || {});
