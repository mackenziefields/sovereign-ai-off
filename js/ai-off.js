/* AI-off copy: every AI feature is switched off. This file loads after the AI code and replaces its entry points, so nothing can reach an AI service.
   The page also sets a Content-Security-Policy (connect-src 'self' blob: data:) so the browser itself refuses any request to another address. */
(function (S) {
  'use strict';
  const OFF = 'AI is switched off in this copy.';
  const ai = S.ai || (S.ai = {});
  const refuse = () => Promise.reject(new Error(OFF));
  ai.ready = () => false;
  ai.settings = () => ({ url: '', code: '' });
  ai.saveSettings = () => false;
  ai.call = refuse;
  ai.health = refuse;
  S.aiOff = true;
  S.aiSettingsBox = () => null;
  S.aiDataSection = function () { return S.h('section', {}, S.h('div', { class: 'section-head' }, S.h('h2', {}, 'AI')), S.h('p', { class: 'muted small' }, 'This is the AI-off copy of Sovereign, made for a class project. Every AI feature is switched off, and nothing in this app contacts an AI service. Build courses manually.')); };
  S.newCourseChooser = function () {
    const ui = S.ui;
    return S.h('div', { class: 'panel' },
      S.h('h3', {}, 'Start a course'),
      S.h('div', { class: 'choices' }, S.h('div', { class: 'choice' }, S.h('h2', {}, 'Build manually'), S.h('p', {}, 'Create an empty course and fill it in yourself. Everything in this copy works without any AI service.'),
        S.h('button', { class: 'btn', type: 'button', onclick: () => { ui.edit = 'newCourseForm'; S.render(false); } }, 'Build manually'))),
      S.h('button', { class: 'linkbtn', type: 'button', onclick: () => { ui.edit = null; S.render(false); } }, 'Cancel'));
  };
  const V = (S.views = S.views || {});
  V.newAI = function () { location.replace('#/'); return S.h('p', {}, 'AI is switched off in this copy. Returning to the Dashboard.'); };
})(window.Sovereign = window.Sovereign || {});
