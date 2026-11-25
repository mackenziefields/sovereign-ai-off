/* sovereign. — shell: router, navigation drawer, service worker registration. */
(function (S) {
  'use strict';
  const app = document.getElementById('app');
  const main = document.getElementById('main');
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const menuBtn = document.getElementById('menu-btn');
  const V = S.views;

  // Routes: #/  #/work  #/data  #/new-ai  #/course/<id>[/announcements|syllabus|modules[/<moduleId>]|assignments[/<assignmentId>]|grades|portfolio]
  S.render = function (reset) {
    const y = window.scrollY;
    S.finalizeExpired();
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    let route = 'dash', view, title = 'Dashboard';

    if (!S.state.setup) { route = 'welcome'; view = V.firstRun(); title = 'Welcome'; }
    else if (parts[0] === 'work') { route = 'work'; view = V.work(); title = 'My Work'; }
    else if (parts[0] === 'new-ai') { route = 'dash'; view = V.newAI(); title = 'Build with AI'; }
    else if (parts[0] === 'data') { route = 'data'; view = V.data(); title = 'Data & Backup'; }
    else if (parts[0] === 'course' && S.course(parts[1])) {
      const c = S.course(parts[1]);
      view = V.course(c, parts[2] || 'home', parts[3], parts[4]);
      title = c.code + ' · ' + V.sectionLabel(parts[2] || 'home');
    } else view = V.dashboard();

    document.body.classList.toggle('firstrun', !S.state.setup);
    app.replaceChildren(...[
      S.loadWarning ? S.h('p', { class: 'banner error', role: 'alert' }, S.loadWarning) : null,
      !S.storageOK && route !== 'data' ? S.h('p', { class: 'banner error', role: 'alert' }, 'Your browser is blocking local storage, so progress will not be saved. See Data & Backup.') : null,
      view,
    ].filter(Boolean));
    document.title = title + ' · sovereign. (AI-off copy)';

    sidebar.querySelectorAll('a[data-route]').forEach((a) => {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    // Course list in the sidebar: jump between courses; the current one is marked and the sidebar picks up its design.
    const current = route === 'dash' && parts[0] === 'course' && S.course(parts[1]) ? S.course(parts[1]) : null;
    const sc = document.getElementById('side-courses');
    sc.parentElement.hidden = !S.state.setup || !S.state.courses.length;
    sc.replaceChildren(...S.state.courses.map((c) => S.h('li', {}, S.h('a', { href: '#/course/' + c.id, 'aria-current': current && current.id === c.id ? 'page' : null, title: c.title },
      S.h('span', { class: 'cdot', 'data-theme': c.designTheme, 'aria-hidden': 'true' }), S.h('span', { class: 'cname' }, c.code)))));
    if (current) { sidebar.dataset.theme = current.designTheme; sidebar.querySelector('a[data-route="dash"]').removeAttribute('aria-current'); } else delete sidebar.dataset.theme;
    window.scrollTo(0, reset ? 0 : y);

    // On phones the Course Menu is a swipeable row: keep the current tab visible.
    const cur = document.querySelector('.course-menu [aria-current]');
    if (cur && cur.parentElement.parentElement.scrollWidth > cur.parentElement.parentElement.clientWidth) {
      const row = cur.parentElement.parentElement;
      row.scrollLeft = cur.offsetLeft - 20;
    }
  };

  /* ----- mobile navigation drawer ----- */
  function setMenu(open) {
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'Close' : 'Menu';
  }
  menuBtn.addEventListener('click', () => {
    const open = !sidebar.classList.contains('open');
    setMenu(open);
    if (open) sidebar.querySelector('a[data-route]').focus();
  });
  scrim.addEventListener('click', () => setMenu(false));
  sidebar.addEventListener('click', (e) => { if (e.target.closest('a[data-route], #side-courses a')) setMenu(false); });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', () => setMenu(false));

  /* ----- G1: desktop overlay navigation (edge handle, hover, pin) ----- */
  const shell = document.querySelector('.shell');
  const edge = document.getElementById('nav-edge');
  const pinBtn = document.getElementById('nav-pin');
  const PIN_KEY = 'sovereign.aioff.navPinned';
  const OPEN_DELAY = 140, CLOSE_DELAY = 450;
  let openTimer = 0, closeTimer = 0;
  const wide = window.matchMedia('(min-width: 1024px)');
  const isPinned = () => shell.hasAttribute('data-pinned');
  const overlayMode = () => wide.matches && !isPinned();
  function setEdgeOpen(open) { edge.setAttribute('aria-expanded', String(open)); }
  const origSetMenu = setMenu;
  setMenu = function (open) { origSetMenu(open); setEdgeOpen(open); };
  function setPinned(on, save) {
    shell.toggleAttribute('data-pinned', on);
    pinBtn.setAttribute('aria-pressed', String(on));
    pinBtn.textContent = on ? 'Unpin menu' : 'Pin menu open';
    if (save) { try { localStorage.setItem(PIN_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: the choice lasts until reload */ } }
    setMenu(false);
  }
  let saved = null; try { saved = localStorage.getItem(PIN_KEY); } catch (e) { /* ignore */ }
  setPinned(saved === '1', false);
  pinBtn.addEventListener('click', () => { setPinned(!isPinned(), true); (isPinned() ? pinBtn : edge).focus(); });

  const clearTimers = () => { clearTimeout(openTimer); clearTimeout(closeTimer); };
  const keyboardInside = () => !!sidebar.querySelector(':focus-visible');
  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (overlayMode() && !keyboardInside()) setMenu(false); }, CLOSE_DELAY);
  }
  edge.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !overlayMode()) return;
    clearTimers(); openTimer = setTimeout(() => { if (overlayMode()) setMenu(true); }, OPEN_DELAY);
  });
  edge.addEventListener('pointerleave', () => clearTimeout(openTimer));
  edge.addEventListener('click', () => {
    clearTimers();
    setMenu(true);
    sidebar.querySelector('a[data-route]').focus();
  });
  sidebar.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') clearTimeout(closeTimer); });
  sidebar.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && overlayMode() && sidebar.classList.contains('open')) scheduleClose(); });
  // Keyboard: leaving the menu with Tab closes it; Escape closes and returns to the handle.
  sidebar.addEventListener('focusout', (e) => {
    if (overlayMode() && sidebar.classList.contains('open') && e.relatedTarget && !sidebar.contains(e.relatedTarget)) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      clearTimers(); setMenu(false);
      (overlayMode() ? edge : menuBtn).focus();
    }
  });

  /* ----- routing ----- */
  window.addEventListener('hashchange', () => {
    S.ui.edit = null; S.ui.dataMsg = null; S.ui.design = false;
    S.render(true);
    main.focus({ preventScroll: true });
  });

  // Icons on the three fixed links (the markup stays plain text if scripts fail).
  sidebar.querySelectorAll('a[data-icon]').forEach((a) => { const t = a.textContent; a.replaceChildren(S.icon(a.dataset.icon), S.h('span', {}, t)); });

  S.load();
  S.render(true);

  // Offline support / installability. Needs https or localhost; silently skipped otherwise.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})(window.Sovereign);
