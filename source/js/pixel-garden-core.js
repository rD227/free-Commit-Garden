/* SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 rD227 (XvSu)
 * This program is free software: you can redistribute it and/or modify it
 * under the GNU General Public License, version 3 or any later version.
 * This program is distributed WITHOUT ANY WARRANTY; see the component LICENSE.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PixelGarden = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY = 86400000;
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const STAGES = ['Seed', 'Sprout', 'Leaves', 'Bud', 'Bloom'];
  const VIEW_TITLES = { week: 'Weekly Garden', month: 'Monthly Garden' };
  const PALETTES = {
    spring: { label: 'Spring · Bloom', sky: '#eaf4ef', mist: '#d2e8d9', hill: '#bad4bc', grass: '#8cae79', soil: '#bda385', deep: '#9b8069', stem: '#477759', leaf: '#75a965', light: '#afd183', flower: '#df8fa3', petal: '#f5c3ca', sun: '#f5db9b' },
    summer: { label: 'Summer · Thrive', sky: '#e5f2ee', mist: '#c8e5dd', hill: '#a4cbbb', grass: '#6aab78', soil: '#b69d7e', deep: '#917861', stem: '#2b6952', leaf: '#4f9c68', light: '#8cc577', flower: '#eabc58', petal: '#f7dc86', sun: '#f5d887' },
    autumn: { label: 'Autumn · Harvest', sky: '#faf0df', mist: '#efe1c7', hill: '#d9c9a9', grass: '#b3ae77', soil: '#b99a7b', deep: '#96775f', stem: '#7d7150', leaf: '#bc8c54', light: '#ddb76b', flower: '#c8754b', petal: '#e8ac67', sun: '#efcc83' },
    winter: { label: 'Winter · Rest', sky: '#ebf0f5', mist: '#d9e3ec', hill: '#bdcdd7', grass: '#d3dfe3', soil: '#a6aba8', deep: '#858f91', stem: '#587774', leaf: '#7b9d94', light: '#adc5b7', flower: '#8499b8', petal: '#c6d4e9', sun: '#f0ddae' }
  };

  function escape(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function dateKey(now, timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now || new Date());
    const pick = type => parts.find(part => part.type === type).value;
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  }

  function shiftDate(date, days) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
  }

  function seasonFor(date, hemisphere) {
    const month = Number(date.slice(5, 7));
    let index = Math.floor((month % 12) / 3);
    if (hemisphere === 'south') index = (index + 2) % 4;
    return ['winter', 'spring', 'summer', 'autumn'][index];
  }

  function stageFor(count) {
    if (count === null) return null;
    return count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;
  }

  // A rare monthly accent for a day with at least 15 contributions.
  function decorationFor(day, season) {
    if (!day || day.future || day.count === null || day.count < 15) return null;
    if (season === 'winter') return 'lights';
    if (season === 'spring') return 'sparrow';
    if (season === 'autumn') return 'squirrel';
    if (season === 'summer') return Math.floor(Date.parse(`${day.date}T00:00:00Z`) / DAY) % 2 ? 'frog' : 'lemonade';
    return null;
  }

  function specialDatesFor(month) {
    return month.days.filter(day => decorationFor(day, month.season))
      .sort((left, right) => right.count - left.count || left.date.localeCompare(right.date))
      .slice(0, 4).map(day => day.date);
  }

  // Missing dates stay unknown. Future dates are never treated as zero contributions.
  function countMap(contributions) {
    const counts = new Map();
    for (const item of contributions || []) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isSafeInteger(item.count) && item.count >= 0) {
        counts.set(item.date, item.count);
      }
    }
    return counts;
  }

  function makeDay(date, today, counts) {
    const future = date > today;
    const count = !future && counts.has(date) ? counts.get(date) : null;
    const label = WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
    return { date, label, count, future, today: date === today, stage: stageFor(count) };
  }

  // The viewed date and actual today are independent when browsing history.
  function makeWeek(contributions, today, hemisphere, anchor) {
    const viewed = anchor || today;
    const day = new Date(`${viewed}T00:00:00Z`).getUTCDay();
    const start = shiftDate(viewed, -((day + 6) % 7));
    const counts = countMap(contributions);
    const days = WEEKDAYS.map((label, index) => {
      const date = shiftDate(start, index);
      return makeDay(date, today, counts);
    });
    const elapsed = days.filter(item => !item.future);
    const complete = elapsed.length > 0 && elapsed.every(item => item.count !== null);
    const total = elapsed.reduce((sum, item) => sum + (item.count || 0), 0);
    const previousDates = elapsed.map(item => shiftDate(item.date, -7));
    const previousComplete = previousDates.length > 0 && previousDates.every(date => counts.has(date));
    const previous = previousComplete ? previousDates.reduce((sum, date) => sum + counts.get(date), 0) : null;
    return { start, end: shiftDate(start, 6), today, days, complete, total, previous,
      delta: complete && previous !== null ? total - previous : null,
      season: seasonFor(viewed, hemisphere) };
  }

  function shiftMonth(date, offset) {
    const [year, month] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
  }

  function makeMonth(contributions, today, hemisphere, anchor) {
    const start = shiftMonth(anchor || today, 0);
    const end = shiftDate(shiftMonth(start, 1), -1);
    const counts = countMap(contributions);
    const days = Array.from({ length: Number(end.slice(8)) }, (_, index) => makeDay(shiftDate(start, index), today, counts));
    const leading = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
    const cells = Array.from({ length: 42 }, (_, index) => days[index - leading] || null);
    const elapsed = days.filter(day => !day.future);
    const complete = elapsed.length > 0 && elapsed.every(day => day.count !== null);
    const total = elapsed.reduce((sum, day) => sum + (day.count || 0), 0);
    const previousStart = shiftMonth(start, -1);
    const previousEnd = shiftDate(start, -1);
    const previousDays = Math.min(elapsed.length, Number(previousEnd.slice(8)));
    const previousDates = Array.from({ length: previousDays }, (_, index) => shiftDate(previousStart, index));
    const comparableDays = elapsed.slice(0, previousDays);
    const previousComplete = previousDays > 0 && previousDates.every(date => counts.has(date));
    const previous = previousComplete ? previousDates.reduce((sum, date) => sum + counts.get(date), 0) : null;
    const comparedTotal = comparableDays.reduce((sum, day) => sum + (day.count || 0), 0);
    return { start, end, today, days, cells, total, complete, previous,
      delta: complete && previous !== null ? comparedTotal - previous : null,
      season: seasonFor(start, hemisphere) };
  }

  function dayDescription(day) {
    if (day.future) return `${day.date} ${day.label}: Not yet`;
    if (day.count === null) return `${day.date} ${day.label}: Contributions unavailable`;
    return `${day.date} ${day.label}: ${day.count} ${day.count === 1 ? 'contribution' : 'contributions'} · ${STAGES[day.stage]}`;
  }

  // Decorative seasonal atmosphere, independent of live weather or location.
  function renderWeather(season, width, height) {
    const types = {
      spring: { kind: 'rain', count: 12, color: '#769fa6', duration: 2.6 },
      autumn: { kind: 'leaves', count: 7, color: '#96775f', duration: 7 },
      winter: { kind: 'snow', count: 11, color: '#ffffff', duration: 6 }
    };
    const weather = types[season];
    if (!weather) return '';
    let particles = '';
    for (let index = 0; index < weather.count; index++) {
      const x = 5 + (index * 37 + index % 3 * 11) % (width - 10);
      const duration = weather.duration + index % 4 * .45;
      const drift = weather.kind === 'rain' ? -8 : 8 + index % 4 * 5;
      const size = weather.kind === 'rain' ? 1 : 1 + index % 2;
      const particleHeight = weather.kind === 'rain' ? 4 : size;
      const delay = -((index + 1) * 1.31 % duration).toFixed(2);
      const pixel = `<rect width="${size}" height="${particleHeight}" fill="${weather.color}"/>`;
      const shape = weather.kind === 'leaves' ? `<g class="pg-leaf-flutter" style="--pg-flutter-width:${5 + index % 3 * 2}px;--pg-flutter-duration:${2.8 + index % 4 * .4}s">${pixel}</g>` : pixel;
      particles += `<g transform="translate(${x} -6)"><g class="pg-weather-particle pg-weather-${weather.kind}" style="--pg-fall-distance:${height + 12}px;--pg-fall-drift:${drift}px;--pg-fall-duration:${duration}s;--pg-fall-delay:${delay}s;opacity:0">${shape}</g></g>`;
    }
    return `<g class="pg-weather" data-weather="${weather.kind}" aria-hidden="true" pointer-events="none">${particles}</g>`;
  }

  function spriteFrame(sheet, stage) {
    if (!sheet || !sheet.url || !(sheet.width > 0 && sheet.height > 0)) return null;
    if (sheet.frames && sheet.frames[stage - 1]) return sheet.frames[stage - 1];
    const w = sheet.width / 2, h = sheet.height / 2, slot = stage - 1;
    return { x: slot % 2 * w, y: Math.floor(slot / 2) * h, width: w, height: h };
  }
  function renderSprite(sheet, frame, x, y, width, height) {
    return `<svg class="pg-sprite" x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}" overflow="hidden" aria-hidden="true"><image href="${escape(sheet.url)}" width="${sheet.width}" height="${sheet.height}" image-rendering="pixelated"/></svg>`;
  }
  function renderScene(week, sheet, options) {
    const plantScale = options && Number.isFinite(options.plantScale) && options.plantScale > 0 ? options.plantScale : 1;
    const p = PALETTES[week.season];
    const winter = week.season === 'winter';
    const rect = (x, y, w, h, fill, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra || ''}/>`;
    let art = rect(0, 0, 224, 112, p.sky);
    // Stepped hills, a small sun and pixel clouds use integer coordinates throughout.
    art += rect(177, 14, 12, 12, p.sun) + rect(173, 18, 20, 4, p.sun);
    art += `<path d="M0 60h16v-6h16v-6h24v-6h24v6h24v6h16v6h32v-6h24v-8h24v8h24v58H0z" fill="${p.mist}"/>`;
    art += `<path d="M0 78h24v-6h24v-6h32v6h32v6h32v-6h32v-4h24v4h24v40H0z" fill="${p.hill}"/>`;
    art += rect(25, 20, 24, 4, '#ffffff', ' opacity=".65"') + rect(31, 16, 12, 4, '#ffffff', ' opacity=".65"');
    art += rect(113, 30, 18, 3, '#ffffff', ' opacity=".55"') + rect(119, 27, 6, 3, '#ffffff', ' opacity=".55"');
    art += rect(0, 89, 224, 5, p.grass) + rect(0, 94, 224, 18, p.soil) + rect(0, 108, 224, 4, p.deep);
    for (let x = 3; x < 224; x += 13) {
      art += rect(x, 98 + (x % 3), 3, 2, p.deep, ' opacity=".45"');
      if (!winter) art += rect(x + 3, 85 + (x % 2), 2, 5, p.grass);
    }
    if (winter) {
      art += rect(0, 88, 224, 4, '#f8fbff');
      for (const [x, y] of [[14, 36], [63, 29], [98, 47], [146, 18], [205, 43]]) {
        art += rect(x, y, 2, 2, '#ffffff');
      }
    }
    week.days.forEach((day, index) => {
      const frame = day.count > 0 && !day.future ? spriteFrame(sheet, day.stage) : null;
      let x = 16 + index * 32;
      let width, height;
      if (frame) {
        height = Math.min([0, 12, 23, 34, 43][day.stage], [0, 9, 15, 22, 27][day.stage] * frame.height / frame.width) * plantScale;
        width = height * frame.width / frame.height;
        // Keep enlarged edge plants inside the scene, with room for the wind.
        x = Math.max(width / 2 + 2, Math.min(x, 224 - width / 2 - 2));
      }
      const soil = rect(x - 9, 92, 18, 3, p.deep, ' opacity=".35"');
      let plant = '';
      if (day.future || day.count === null) {
        plant += rect(x - 4, 88, 8, 2, p.deep, ' opacity=".4"');
        if (!day.future) plant += `<text x="${x}" y="82" text-anchor="middle" fill="${p.stem}" font-size="9" font-family="monospace">?</text>`;
      } else if (day.stage === 0) {
        plant += rect(x - 2, 86, 4, 3, p.deep) + rect(x - 1, 85, 2, 1, p.light);
      } else if (frame) {
        plant = renderSprite(sheet, frame, x - width / 2, 89 - height, width, height);
      } else {
        const heights = [0, 12, 23, 34, 43];
        const top = 89 - heights[day.stage];
        plant += rect(x - 1, top, 2, 89 - top, p.stem);
        const leaf = (y, right) => {
          const lx = right ? x + 1 : x - 9;
          return rect(lx, y, 8, 4, p.leaf) + rect(lx + (right ? 0 : 2), y - 2, 6, 2, p.light) + rect(lx + (right ? 0 : 4), y + 4, 4, 2, p.leaf);
        };
        plant += leaf(81, false) + leaf(day.stage === 1 ? 78 : 73, true);
        if (day.stage >= 2) plant += leaf(top + 4, false);
        if (day.stage >= 3) plant += leaf(top + 12, true);
        if (day.stage === 3) {
          plant += rect(x - 3, top - 3, 6, 6, p.flower) + rect(x - 1, top - 5, 2, 2, p.light);
        }
        if (day.stage === 4) {
          plant += rect(x - 3, top - 7, 6, 14, p.flower) + rect(x - 7, top - 3, 14, 6, p.flower);
          plant += rect(x - 5, top - 5, 4, 4, p.petal) + rect(x + 1, top + 1, 4, 4, p.petal);
          plant += rect(x - 2, top - 2, 4, 4, p.sun);
          if (week.season === 'autumn') plant += rect(x + 7, 76, 4, 4, p.flower) + rect(x + 8, 74, 2, 2, p.stem);
        }
        if (winter) plant += rect(x - 8, 79, 6, 2, '#f8fbff');
      }
      if (day.count > 0 && !day.future) {
        if (!frame && plantScale !== 1) plant = `<g transform="translate(${x} 89) scale(${plantScale}) translate(${-x} -89)">${plant}</g>`;
        plant = `<g class="pg-plant" style="transform-origin:${x}px 89px;--pg-wind-delay:-${index * .63}s;--pg-wind-duration:${4.2 + index % 3 * .6}s">${plant}</g>`;
      }
      const marker = day.today ? rect(x - 3, 104, 6, 2, p.light) : '';
      art += `<g><title>${escape(dayDescription(day))}</title>${soil}${plant}${marker}</g>`;
    });
    if (week.season === 'autumn') art += rect(52, 43, 3, 2, p.flower) + rect(158, 54, 2, 3, p.light);
    art += renderWeather(week.season, 224, 112);
    return `<svg xmlns="http://www.w3.org/2000/svg" class="pg-scene" viewBox="0 0 224 112" role="img" aria-label="${escape(`${p.label}, Monday to Sunday contribution garden`)}" shape-rendering="crispEdges"><title>${escape(`${p.label} · ${VIEW_TITLES.week}`)}</title>${art}</svg>`;
  }

  // Paint all ground first so enlarged crowns can overlap neighboring plots.
  function renderMonth(month, sheet, options) {
    const plantScale = options && Number.isFinite(options.plantScale) && options.plantScale > 0 ? options.plantScale : 1;
    const decorationSprites = options && options.decorationSprites;
    const p = PALETTES[month.season];
    const rows = month.cells.length / 7;
    const specialDates = new Set(specialDatesFor(month));
    const rect = (x, y, w, h, fill, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra || ''}/>`;
    let art = rect(0, 0, 224, rows * 32, p.sky);
    let plants = '';
    let decorations = '';
    month.cells.forEach((day, index) => {
      if (!day) return;
      const x = index % 7 * 32, y = Math.floor(index / 7) * 32;
      let tile = rect(x + 1, y + 1, 30, 30, month.season === 'winter' ? p.mist : p.soil);
      tile += `<path d="M${x + 2} ${y + 8}h4v-2h3 M${x + 22} ${y + 27}h3v-2h4" stroke="${p.deep}" opacity=".35" fill="none"/>`;
      tile += rect(x + 26, y + 4, 2, 1, p.deep, ' opacity=".4"') + rect(x + 4, y + 23, 2, 1, p.light, ' opacity=".45"');
      if (day.today) tile += `<rect x="${x + 1}" y="${y + 1}" width="30" height="30" rx="2" fill="none" stroke="${p.stem}"/>`;
      const cx = x + 16, cy = y + 14;
      let shrub = '';
      let crown = null;
      const decoration = specialDates.has(day.date) ? decorationFor(day, month.season) : null;
      if (day.count === 0) shrub = rect(cx - 1, cy, 3, 2, p.deep) + rect(cx, cy - 1, 1, 1, p.light);
      else if (day.count > 0) {
        if (spriteFrame(sheet, day.stage)) {
          const size = (sheet.frames ? [0, 8, 13, 19, 24][day.stage] : 24) * plantScale;
          const centerX = Math.max(size / 2 + 1, Math.min(cx, 223 - size / 2));
          const centerY = Math.max(size / 2 + 1, Math.min(cy, rows * 32 - 1 - size / 2));
          crown = { x: centerX, y: centerY, size };
          const winterLit = decoration === 'lights' && decorationSprites && decorationSprites.winterLit;
          const sprite = winterLit
            ? `<image href="${escape(decorationSprites.winterLit)}" x="${centerX - size / 2}" y="${centerY - size / 2}" width="${size}" height="${size}" image-rendering="pixelated" preserveAspectRatio="xMidYMid meet"/>`
            : renderSprite(sheet, spriteFrame(sheet, day.stage), centerX - size / 2, centerY - size / 2, size, size);
          shrub = `<g class="pg-shrub"><g class="${month.season === 'spring' ? 'pg-sakura-canopy' : 'pg-shrub-canopy'}">${sprite}</g></g>`;
        } else {
          shrub = `<text class="pg-month-value" x="${cx}" y="${cy + 3}" text-anchor="middle" font-family="monospace" font-size="8" fill="${p.stem}">${day.count}</text>`;
        }
      } else if (!day.future) shrub = `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-family="monospace" font-size="8" fill="${p.stem}">?</text>`;
      art += `<g${day.future ? ' opacity=".45"' : ''}><title>${escape(dayDescription(day))}</title>${tile}</g>`;
      plants += shrub;
      if (crown && decoration && decoration !== 'lights' && decorationSprites && decorationSprites[decoration]) {
        const iconSize = Math.min(30, 28 * plantScale);
        const iconX = Math.max(x + 1, Math.min(x + 31 - iconSize, crown.x + 1 - iconSize / 2));
        const iconY = Math.max(y + 1, Math.min(y + 31 - iconSize, crown.y - 3 - iconSize / 2));
        const kind = decoration === 'lemonade' ? 'pg-month-lemonade' : 'pg-month-visitor';
        decorations += `<g class="pg-month-decoration ${kind}" data-date="${day.date}" style="--pg-visitor-delay:-${index % 5 * .41}s"><image href="${escape(decorationSprites[decoration])}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" image-rendering="pixelated" preserveAspectRatio="xMidYMid meet"/></g>`;
      }
    });
    art += `<g class="pg-month-plants" aria-hidden="true">${plants}</g>`;
    art += `<g class="pg-month-decorations" aria-hidden="true">${decorations}</g>`;
    art += renderWeather(month.season, 224, rows * 32);
    return `<svg xmlns="http://www.w3.org/2000/svg" class="pg-scene pg-month-scene" viewBox="0 0 224 ${rows * 32}" role="img" aria-label="${escape(`${month.start.slice(0, 7)} · ${p.label}, top-down shrub contribution garden`)}" shape-rendering="crispEdges">${art}</svg>`;
  }

  function renderBadge(week, username) {
    const date = `${week.start.slice(5).replace('-', '/')} — ${week.end.slice(5).replace('-', '/')}`;
    const total = week.complete ? `${week.total} contributions this week` : 'Contributions unavailable';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="208" viewBox="0 0 280 208" role="img" aria-label="${escape(`${username} · ${total}`)}"><rect width="280" height="208" rx="12" fill="#fffaf3"/><g font-family="system-ui, sans-serif" fill="#655a47"><text x="16" y="26" font-size="14" font-weight="600">${VIEW_TITLES.week}</text><text x="264" y="25" font-size="11" text-anchor="end">${PALETTES[week.season].label}</text><text x="16" y="45" font-size="10">${date}</text></g><svg x="16" y="55" width="248" height="124" viewBox="0 0 224 112">${renderScene(week).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg><text x="16" y="196" font-family="system-ui, sans-serif" font-size="11" fill="#655a47">${escape(total)} · @${escape(username)}</text></svg>`;
  }

  return { PALETTES, STAGES, VIEW_TITLES, WEEKDAYS, escape, dateKey, shiftDate, shiftMonth, seasonFor, stageFor, decorationFor, specialDatesFor, makeWeek, makeMonth, dayDescription, renderScene, renderMonth, renderWeather, renderBadge };
});
