/* SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 rD227 (XvSu)
 * This program is free software: you can redistribute it and/or modify it
 * under the GNU General Public License, version 3 or any later version.
 * This program is distributed WITHOUT ANY WARRANTY; see the component LICENSE.
 */
(function () {
  'use strict';
  const core = window.PixelGarden;
  if (!core) return;
  const script = document.currentScript;
  const configUrl = script && script.dataset.config || '/garden/config.json';
  // An explicit target makes the same component usable without a blog theme.
  const targetSelector = script && script.dataset.target;
  const CACHE_TTL = 60 * 60 * 1000;
  // Side-view plants in the avatar card, on desktop and mobile. Main view uses 1.
  const SIDEBAR_WEEKLY_PLANT_SCALE = 2;
  // Top-down shrubs in the avatar card. Main monthly view uses 1.
  const SIDEBAR_MONTHLY_PLANT_SCALE = 1.5;
  const states = new WeakMap();
  const history = new Map();
  const historyRequests = new Map();
  const desktop = window.matchMedia('(min-width: 901px)');
  let preferredPosition = readStorage('pixel-garden-position') === 'main' ? 'main' : 'sidebar';
  let config, data, loading, currentDay, activeWidget;

  async function readJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { value: await response.json(), age: Number(response.headers.get('age') || 0) };
    } finally { clearTimeout(timeout); }
  }
  function valid(value) {
    return value && value.username === config.username && Number.isFinite(Date.parse(value.updatedAt)) &&
      Array.isArray(value.contributions) && value.contributions.length >= 7 &&
      value.contributions.every(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isSafeInteger(item.count) && item.count >= 0);
  }
  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Storage may be disabled. */ }
  }
  function cacheKey() { return `pixel-garden-v1:${config.username}`; }
  function cachedData() {
    const cached = readStorage(cacheKey());
    return valid(cached) ? cached : null;
  }
  function allContributions() {
    const counts = new Map();
    history.forEach(value => value.contributions.forEach(day => counts.set(day.date, day)));
    // The latest rolling snapshot takes precedence over archived years.
    (data && data.contributions || []).forEach(day => counts.set(day.date, day));
    return Array.from(counts.values());
  }
  function model(state, offset) {
    const today = core.dateKey(new Date(), config.timezone);
    if (!state.models || state.modelDay !== today) {
      state.models = new Map();
      state.modelDay = today;
    }
    if (state.models.has(offset)) return state.models.get(offset);
    const anchor = state.mode === 'week' ? core.shiftDate(state.anchor, offset * 7) : core.shiftMonth(state.anchor, offset);
    const period = state.mode === 'week' ? core.makeWeek(allContributions(), today, config.hemisphere, anchor) : core.makeMonth(allContributions(), today, config.hemisphere, anchor);
    state.models.set(offset, period);
    return period;
  }
  function dayButton(day, month) {
    const classes = `pg-day${month ? ' pg-month-day' : ''}${day.today ? ' is-today' : ''}${day.future ? ' is-future' : ''}`;
    const label = core.escape(core.dayDescription(day));
    const content = month ? `<span class="pg-month-number">${Number(day.date.slice(8))}</span>` : `<span>${day.label}</span><span class="pg-count">${day.future ? '·' : day.count === null ? '?' : day.count}</span>`;
    return `<button type="button" class="${classes}" data-date="${day.date}" aria-label="${label}" title="${label}"${day.today ? ' aria-current="date"' : ''}>${content}</button>`;
  }
  function panelHtml(period, mode, placement) {
    const visual = mode === 'week' ? `<div class="pg-landscape">${core.renderScene(period, config.weeklySpriteSheets && config.weeklySpriteSheets[period.season], { plantScale: placement === 'sidebar' ? SIDEBAR_WEEKLY_PLANT_SCALE : 1 })}</div><div class="pg-week" role="group" aria-label="Daily contributions">${period.days.map(day => dayButton(day, false)).join('')}</div>` :
      `<div class="pg-month-weekdays" aria-hidden="true">${core.WEEKDAYS.map(day => `<span>${day}</span>`).join('')}</div><div class="pg-month-map">${core.renderMonth(period, config.spriteSheets && config.spriteSheets[period.season], { plantScale: placement === 'sidebar' ? SIDEBAR_MONTHLY_PLANT_SCALE : 1, decorationSprites: config.decorationSprites })}<div class="pg-month-grid" role="group" aria-label="${period.start.slice(0, 7)} Daily contributions">${period.cells.map(day => day ? dayButton(day, true) : '<span aria-hidden="true"></span>').join('')}</div></div>`;
    return visual;
  }
  // Empty shells preserve scroll geometry; only intersecting panels get artwork.
  function syncPanels(widget) {
    const state = states.get(widget);
    const viewport = widget.querySelector('.pg-viewport');
    const width = viewport.getBoundingClientRect().width;
    const active = state.inView && !document.hidden && width > 0;
    widget.dataset.paused = String(!active);
    viewport.querySelectorAll('.pg-panel').forEach((panel, index) => {
      const visible = active && index * width < viewport.scrollLeft + width - .5 && (index + 1) * width > viewport.scrollLeft + .5;
      panel.dataset.visible = String(visible);
      panel.inert = !visible;
      if (visible && !panel.hasChildNodes()) {
        const period = model(state, Number(panel.dataset.offset));
        panel.dataset.season = period.season;
        panel.innerHTML = panelHtml(period, state.mode, widget.dataset.placement);
      } else if (!visible && panel.hasChildNodes()) panel.replaceChildren();
    });
  }
  function makeShells(widget, reuse) {
    const state = states.get(widget);
    const track = widget.querySelector('.pg-track');
    const existing = new Map(reuse ? Array.from(track.children, panel => [Number(panel.dataset.offset), panel]) : []);
    track.replaceChildren(...state.offsets.map(offset => {
      if (existing.has(offset)) return existing.get(offset);
      const panel = document.createElement('div');
      panel.className = 'pg-panel';
      panel.dataset.offset = offset;
      panel.inert = true;
      return panel;
    }));
    if (state.models) for (const offset of state.models.keys()) {
      if (!state.offsets.includes(offset)) state.models.delete(offset);
    }
  }
  function freshLabel(period) {
    if (!data) return 'Loading GitHub contributions…';
    if (!valid(data)) return 'Contributions unavailable. Try refreshing.';
    const updated = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(data.updatedAt));
    const stale = data.stale || Date.now() - Date.parse(data.updatedAt) > 2 * CACHE_TTL;
    if (!period.complete && period.start <= currentDay) {
      const years = period.days.filter(day => !day.future && day.count === null).map(day => day.date.slice(0, 4));
      if (years.some(year => historyRequests.get(year) === 'loading')) return 'Loading historical contributions…';
      return `${stale ? 'Cached · ' : ''}Updated ${updated} · Selected dates pending`;
    }
    return `${stale ? 'Cached · ' : ''}Updated ${updated}`;
  }
  function updateControls(widget) {
    const state = states.get(widget);
    const viewport = widget.querySelector('.pg-viewport');
    const width = viewport.getBoundingClientRect().width;
    if (!width) return;
    const index = Math.max(0, Math.min(state.offsets.length - 1, Math.floor((viewport.scrollLeft + width / 2) / width)));
    const offset = state.offsets[index];
    const period = model(state, offset);
    state.active = period;
    state.activeOffset = offset;
    widget.dataset.season = period.season;
    widget.querySelector('.pg-title-text').textContent = core.VIEW_TITLES[state.mode];
    widget.querySelector('.pg-season').textContent = core.PALETTES[period.season].label;
    const label = state.mode === 'week' ? `${period.start.slice(0, 4)} · ${period.start.slice(5).replace('-', '.')} — ${period.end.slice(5).replace('-', '.')}` : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period.start}T00:00:00Z`));
    widget.querySelector('.pg-range-label').textContent = label;
    widget.querySelector('.pg-total').innerHTML = period.start > currentDay ? 'Not yet' : period.complete ? `<strong>${period.total}</strong> ${period.total === 1 ? 'contribution' : 'contributions'}` : 'Contributions unavailable';
    const previous = state.mode === 'week' ? 'week' : 'month';
    const trendLabel = previous === 'month' ? 'same days last month' : 'last week';
    const trend = period.delta === null ? '' : period.delta === 0 ? previous === 'month' ? 'No change vs same days last month' : 'Same as last week' : `${period.delta > 0 ? '+' : '−'}${Math.abs(period.delta)} vs ${trendLabel}`;
    widget.querySelector('.pg-trend').textContent = trend;
    widget.querySelector('.pg-freshness').textContent = freshLabel(period);
    const max = viewport.scrollWidth - width;
    const scrollbar = widget.querySelector('.pg-scrollbar');
    if (!state.scrubbing) scrollbar.value = max ? Math.round(viewport.scrollLeft / max * 1000) : 0;
    scrollbar.setAttribute('aria-valuetext', label);
    widget.querySelector('.pg-now').hidden = period.days.some(day => day.today);
    widget.querySelector('.pg-detail').hidden = !state.detail;
    widget.querySelector('.pg-detail').textContent = state.detail || '';
    syncPanels(widget);
    if (state.lastPeriod !== period.start) {
      state.lastPeriod = period.start;
      state.detail = '';
      widget.querySelector('.pg-detail').hidden = true;
      requestHistory(period);
    }
  }
  function paint(widget, reset) {
    const state = states.get(widget);
    const viewport = widget.querySelector('.pg-viewport');
    const left = viewport.scrollLeft;
    widget.dataset.view = state.mode;
    widget.querySelectorAll('.pg-view-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.mode)));
    state.models = new Map();
    makeShells(widget, false);
    viewport.scrollLeft = reset ? 3 * viewport.getBoundingClientRect().width : left;
    updateControls(widget);
  }
  // Seven panels form a moving window. Recycle the distant end without snapping.
  function extendTimeline(widget) {
    const state = states.get(widget);
    const viewport = widget.querySelector('.pg-viewport');
    const width = viewport.getBoundingClientRect().width;
    if (!width || state.scrubbing) return;
    const left = viewport.scrollLeft;
    let shift = 0;
    if (left < width * .65) {
      const first = state.offsets[0];
      state.offsets = [first - 2, first - 1, ...state.offsets.slice(0, -2)];
      shift = 2 * width;
    } else if (left > viewport.scrollWidth - width * 1.65) {
      const last = state.offsets[state.offsets.length - 1];
      state.offsets = [...state.offsets.slice(2), last + 1, last + 2];
      shift = -2 * width;
    }
    if (shift) {
      makeShells(widget, true);
      viewport.scrollLeft = left + shift;
      if (state.drag) state.drag.left += shift;
    }
  }
  function resetTo(widget, date, mode) {
    const state = states.get(widget);
    state.anchor = date;
    state.mode = mode;
    state.offsets = [-3, -2, -1, 0, 1, 2, 3];
    state.detail = '';
    state.lastPeriod = null;
    paint(widget, true);
  }
  function bindTimeline(widget) {
    const state = states.get(widget);
    const viewport = widget.querySelector('.pg-viewport');
    const scrollbar = widget.querySelector('.pg-scrollbar');
    viewport.addEventListener('scroll', () => {
      if (state.frame) return;
      state.frame = requestAnimationFrame(() => {
        state.frame = null;
        extendTimeline(widget);
        updateControls(widget);
      });
    }, { passive: true });
    viewport.addEventListener('wheel', event => {
      if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        viewport.scrollLeft += event.deltaY;
      }
    }, { passive: false });
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') resetTo(widget, currentDay, state.mode);
      else viewport.scrollLeft += (event.key === 'ArrowLeft' ? -1 : 1) * viewport.getBoundingClientRect().width / 5;
    });
    viewport.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      state.drag = { id: event.pointerId, x: event.clientX, left: viewport.scrollLeft, moved: false };
    });
    viewport.addEventListener('pointermove', event => {
      const drag = state.drag;
      if (!drag || event.pointerId !== drag.id) return;
      const distance = event.clientX - drag.x;
      if (!drag.moved && Math.abs(distance) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging');
      }
      event.preventDefault();
      viewport.scrollLeft = drag.left - distance;
    });
    const endDrag = () => {
      if (state.drag && state.drag.moved) state.suppressClickUntil = Date.now() + 200;
      state.drag = null;
      viewport.classList.remove('is-dragging');
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('lostpointercapture', endDrag);
    viewport.addEventListener('pointerleave', () => { if (state.drag && !state.drag.moved) endDrag(); });
    viewport.addEventListener('click', event => {
      if (Date.now() < (state.suppressClickUntil || 0)) return;
      const button = event.target.closest('.pg-day');
      if (!button) return;
      const day = model(state, Number(button.closest('.pg-panel').dataset.offset)).days.find(day => day.date === button.dataset.date);
      state.detail = core.dayDescription(day);
      widget.querySelector('.pg-detail').textContent = state.detail;
      widget.querySelector('.pg-detail').hidden = false;
    });
    scrollbar.addEventListener('pointerdown', () => { state.scrubbing = true; });
    scrollbar.addEventListener('input', () => {
      viewport.scrollLeft = Number(scrollbar.value) / 1000 * (viewport.scrollWidth - viewport.clientWidth);
      updateControls(widget);
    });
    const finishScrubbing = () => { state.scrubbing = false; extendTimeline(widget); updateControls(widget); };
    scrollbar.addEventListener('change', finishScrubbing);
    scrollbar.addEventListener('pointerup', finishScrubbing);
    scrollbar.addEventListener('pointercancel', finishScrubbing);
    widget.querySelectorAll('.pg-view-button').forEach(button => button.addEventListener('click', () => {
      if (state.mode === button.dataset.view) return;
      const date = state.active.days.some(day => day.today) ? currentDay : state.active.start;
      resetTo(widget, date, button.dataset.view);
      writeStorage('pixel-garden-view', button.dataset.view);
    }));
    widget.querySelector('.pg-now').addEventListener('click', () => resetTo(widget, currentDay, state.mode));
    if (typeof IntersectionObserver === 'function') {
      state.visibility = new IntersectionObserver(entries => {
        state.inView = entries[0].isIntersecting;
        syncPanels(widget);
      });
      state.visibility.observe(viewport);
    }
    if (typeof ResizeObserver === 'function') {
      state.resize = new ResizeObserver(() => {
        const width = viewport.getBoundingClientRect().width;
        if (state.width && width !== state.width) {
          viewport.scrollLeft = (state.activeOffset - state.offsets[0]) * width;
          updateControls(widget);
        }
        state.width = width;
      });
      state.resize.observe(viewport);
    }
  }
  function update(value) {
    data = value;
    document.querySelectorAll('.pixel-garden').forEach(widget => paint(widget, false));
  }
  async function requestHistory(period) {
    if (!config.liveRefresh || !data || !valid(data)) return;
    const oldest = data.contributions.reduce((date, day) => day.date < date ? day.date : date, currentDay);
    const years = new Set(period.days.filter(day => !day.future && day.count === null && day.date < oldest).map(day => day.date.slice(0, 4)));
    for (const year of years) {
      if (Number(year) < 2008 || historyRequests.has(year)) continue;
      const key = `pixel-garden-history:${config.username}:${year}`;
      const cached = readStorage(key);
      if (valid(cached)) {
        history.set(year, cached);
        if (Date.now() - Date.parse(cached.updatedAt) < 24 * CACHE_TTL) {
          historyRequests.set(year, 'ready');
          document.querySelectorAll('.pixel-garden').forEach(widget => paint(widget, false));
          continue;
        }
      }
      historyRequests.set(year, 'loading');
      document.querySelectorAll('.pixel-garden').forEach(updateControls);
      try {
        const result = await readJson(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(config.username)}?y=${year}`);
        const archive = { username: config.username, updatedAt: new Date().toISOString(), contributions: result.value.contributions };
        if (!valid(archive)) throw new Error('Unavailable calendar');
        history.set(year, archive);
        writeStorage(key, archive);
        historyRequests.set(year, 'ready');
      } catch (_) { historyRequests.set(year, 'unavailable'); }
      document.querySelectorAll('.pixel-garden').forEach(widget => paint(widget, false));
    }
  }
  async function loadData() {
    const cached = cachedData();
    if (cached) update(cached);
    try {
      const snapshot = (await readJson(config.snapshotUrl)).value;
      if (valid(snapshot) && (!data || !valid(data) || Date.parse(snapshot.updatedAt) > Date.parse(data.updatedAt))) update(snapshot);
    } catch (_) { /* A local or live copy may still be usable. */ }
    const freshCache = cached && Date.now() - Date.parse(cached.updatedAt) < CACHE_TTL && core.makeWeek(cached.contributions, currentDay, config.hemisphere).complete;
    if (config.liveRefresh && !freshCache) {
      try {
        const response = await readJson(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(config.username)}?y=last`);
        const live = { username: config.username, source: 'contributions-api', updatedAt: new Date(Date.now() - Math.max(0, response.age) * 1000).toISOString(), contributions: response.value.contributions };
        if (valid(live) && (!data || !valid(data) || Date.parse(live.updatedAt) >= Date.parse(data.updatedAt)) &&
          (!data || !core.makeWeek(data.contributions, currentDay, config.hemisphere).complete || core.makeWeek(live.contributions, currentDay, config.hemisphere).complete)) update(live);
      } catch (_) { /* Keep the GitHub snapshot or cached calendar. */ }
    }
    if (!data) update({ username: config.username, contributions: [], unavailable: true });
    else if (valid(data)) writeStorage(cacheKey(), data);
    document.querySelectorAll('.pixel-garden').forEach(widget => { const state = states.get(widget); requestHistory(state.active); });
  }
  function mainLocation() {
    const post = document.querySelector('#post');
    if (post) {
      const comments = post.querySelector('#post-comment');
      const separator = comments && comments.previousElementSibling;
      return { parent: post, before: separator && separator.matches('hr.custom-hr') ? separator : comments };
    }
    const recent = document.querySelector('#recent-posts');
    return recent ? { parent: recent, before: recent.firstElementChild } : null;
  }
  function placeGarden(widget, reveal) {
    if (targetSelector) return;
    const card = document.querySelector('#aside-content .card-info');
    const main = desktop.matches && preferredPosition === 'main' && mainLocation();
    const placement = main ? 'main' : 'sidebar';
    if (card && (widget.dataset.placement !== placement || widget.parentElement !== (main ? main.parent : card))) {
      const state = states.get(widget);
      const viewport = widget.querySelector('.pg-viewport');
      const oldWidth = viewport.getBoundingClientRect().width;
      const position = oldWidth ? viewport.scrollLeft / oldWidth : state.activeOffset - state.offsets[0];
      widget.dataset.placement = placement;
      if (main) main.parent.insertBefore(widget, main.before);
      else card.appendChild(widget);
      widget.querySelectorAll('.pg-panel').forEach(panel => panel.replaceChildren());
      const width = viewport.getBoundingClientRect().width;
      state.width = width;
      viewport.scrollLeft = position * width;
      const bounds = viewport.getBoundingClientRect();
      state.inView = typeof IntersectionObserver !== 'function' || bounds.top < innerHeight && bounds.bottom > 0;
      updateControls(widget);
    }
    const button = document.querySelector('#pixel-garden-position');
    if (button) {
      button.hidden = !mainLocation();
      const expanded = widget.dataset.placement === 'main';
      button.setAttribute('aria-pressed', String(expanded));
      button.title = expanded ? 'Move garden to avatar card' : 'Expand garden in main content';
      button.setAttribute('aria-label', button.title);
    }
    if (reveal) widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function installPositionButton(widget) {
    if (targetSelector) return;
    const menu = document.querySelector('#rightside-config-hide');
    if (!menu || document.querySelector('#pixel-garden-position')) return;
    const button = document.createElement('button');
    button.id = 'pixel-garden-position';
    button.type = 'button';
    button.setAttribute('aria-controls', 'pixel-garden');
    button.innerHTML = '<i class="fas fa-seedling" aria-hidden="true"></i>';
    button.addEventListener('click', () => {
      if (!desktop.matches || !activeWidget || !activeWidget.isConnected) return;
      preferredPosition = activeWidget.dataset.placement === 'main' ? 'sidebar' : 'main';
      writeStorage('pixel-garden-position', preferredPosition);
      placeGarden(activeWidget, true);
    });
    menu.appendChild(button);
    placeGarden(widget);
  }
  async function mount() {
    const card = document.querySelector(targetSelector || '#aside-content .card-info');
    if (!card) return;
    if (activeWidget && !activeWidget.isConnected) {
      const previous = states.get(activeWidget);
      if (previous.resize) previous.resize.disconnect();
      if (previous.visibility) previous.visibility.disconnect();
      if (previous.frame) cancelAnimationFrame(previous.frame);
      states.delete(activeWidget);
      activeWidget = null;
    }
    if (activeWidget && activeWidget.isConnected) {
      installPositionButton(activeWidget);
      placeGarden(activeWidget);
      return;
    }
    try {
      if (!config) config = (await readJson(configUrl)).value;
      if (config.enable === false || !card.isConnected || document.querySelector('.pixel-garden')) return;
      currentDay = core.dateKey(new Date(), config.timezone);
      const widget = document.createElement('section');
      widget.id = 'pixel-garden';
      widget.className = 'pixel-garden';
      widget.dataset.placement = targetSelector ? 'main' : 'sidebar';
      widget.setAttribute('aria-label', 'GitHub pixel garden');
      widget.innerHTML = `
        <div class="pg-heading"><span class="pg-title"><span class="pg-leaf" aria-hidden="true"></span><span class="pg-title-text"></span></span><span class="pg-season"></span></div>
        <div class="pg-subheading"><span class="pg-range-label"></span><a class="pg-profile" href="https://github.com/${encodeURIComponent(config.username)}" target="_blank" rel="noopener noreferrer">@${core.escape(config.username)}</a></div>
        <div class="pg-viewport" tabindex="0" role="region" aria-label="Drag, swipe or Shift-scroll to browse dates"><div class="pg-track"></div></div>
        <input class="pg-scrollbar" type="range" min="0" max="1000" step="1" value="500" aria-label="Scroll through garden dates" title="Drag to browse continuously in either direction">
        <div class="pg-summary"><span class="pg-total"></span><span class="pg-trend"></span></div>
        <p class="pg-detail" aria-live="polite" hidden></p>
        <div class="pg-freshness" role="status"></div>
        <div class="pg-footer"><button type="button" class="pg-now" hidden>Today</button><div class="pg-view-switch" role="group" aria-label="Garden view"><button type="button" class="pg-view-button" data-view="week" aria-pressed="true">Week</button><button type="button" class="pg-view-button" data-view="month" aria-pressed="false">Month</button></div></div>`;
      const savedMode = readStorage('pixel-garden-view');
      states.set(widget, { mode: savedMode === 'month' ? 'month' : 'week', anchor: currentDay, offsets: [-3, -2, -1, 0, 1, 2, 3], detail: '', inView: typeof IntersectionObserver !== 'function' });
      card.appendChild(widget);
      activeWidget = widget;
      paint(widget, true);
      bindTimeline(widget);
      installPositionButton(widget);
      placeGarden(widget);
      if (!loading) loading = loadData().finally(() => { loading = null; });
      await loading;
    } catch (_) { /* Missing config leaves the author card usable. */ }
  }
  function refreshDay() {
    if (!config || document.hidden) return;
    const today = core.dateKey(new Date(), config.timezone);
    if (today !== currentDay) {
      const previousToday = currentDay;
      currentDay = today;
      document.querySelectorAll('.pixel-garden').forEach(widget => {
        const state = states.get(widget);
        if (state.active.days.some(day => day.date === previousToday)) resetTo(widget, today, state.mode);
        else paint(widget, false);
      });
      if (!loading) loading = loadData().finally(() => { loading = null; });
    }
  }
  if (document.readyState === 'complete') mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  document.addEventListener('pjax:complete', mount);
  desktop.addEventListener('change', () => {
    if (activeWidget && activeWidget.isConnected) placeGarden(activeWidget);
  });
  document.addEventListener('visibilitychange', () => {
    refreshDay();
    document.querySelectorAll('.pixel-garden').forEach(syncPanels);
  });
  setInterval(refreshDay, 60000);
})();
