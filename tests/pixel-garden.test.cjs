/* SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 rD227 (XvSu)
 * This program is free software: you can redistribute it and/or modify it
 * under the GNU General Public License, version 3 or any later version.
 * This program is distributed WITHOUT ANY WARRANTY; see the component LICENSE.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../source/js/pixel-garden-core');
const { parseCalendar, generate } = require('../scripts/pixel-garden');

function calendar() {
  return Array.from({ length: 7 }, (_, index) => `<td id="day-${index}" data-level="2" data-date="2026-09-${21 + index}"></td><tool-tip for="day-${index}">${index === 0 ? 'No' : index === 6 ? '1,234' : index} contributions on September.</tool-tip>`).join('');
}

test('Shanghai date crosses midnight independently of the visitor timezone', () => {
  assert.equal(core.dateKey(new Date('2026-10-03T15:59:59Z'), 'Asia/Shanghai'), '2026-10-03');
  assert.equal(core.dateKey(new Date('2026-10-03T16:00:00Z'), 'Asia/Shanghai'), '2026-10-04');
  assert.equal(core.dateKey(new Date('2026-10-03T16:00:00Z'), 'America/Los_Angeles'), '2026-10-03');
});

test('Monday and Sunday boundaries also work across New Year', () => {
  const sunday = core.makeWeek([], '2026-10-04');
  assert.equal(sunday.start, '2026-09-28');
  assert.equal(sunday.end, '2026-10-04');
  assert.equal(sunday.days.filter(day => day.future).length, 0);
  const monday = core.makeWeek([], '2026-10-05');
  assert.equal(monday.start, '2026-10-05');
  assert.equal(monday.days.filter(day => day.future).length, 6);
  const newYear = core.makeWeek([], '2027-01-01');
  assert.equal(newYear.start, '2026-12-28');
  assert.equal(newYear.end, '2027-01-03');
});

test('all four seasons and southern hemisphere inversion', () => {
  for (const [month, north, south] of [['01', 'winter', 'summer'], ['03', 'spring', 'autumn'], ['06', 'summer', 'winter'], ['09', 'autumn', 'spring'], ['12', 'winter', 'summer']]) {
    assert.equal(core.seasonFor(`2026-${month}-01`, 'north'), north);
    assert.equal(core.seasonFor(`2026-${month}-01`, 'south'), south);
  }
});

test('missing, future, zero and growing days remain distinct', () => {
  const week = core.makeWeek([
    { date: '2026-09-28', count: 0 }, { date: '2026-09-29', count: 2 },
    { date: '2026-09-30', count: -1 }, { date: '2026-10-04', count: 99 }
  ], '2026-10-03');
  assert.equal(week.days[0].stage, 0);
  assert.equal(week.days[1].stage, 1);
  assert.equal(week.days[2].count, null);
  assert.equal(week.days[6].future, true);
  assert.equal(week.days[6].count, null);
  assert.equal(week.complete, false);
  assert.equal(week.delta, null);
  assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10, 100].map(core.stageFor), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('trend compares equal elapsed days, excluding the previous Sunday', () => {
  const counts = Array.from({ length: 14 }, (_, index) => ({ date: core.shiftDate('2026-09-21', index), count: index === 6 ? 100 : index < 7 ? 2 : 3 }));
  const week = core.makeWeek(counts, '2026-10-03');
  assert.equal(week.total, 18);
  assert.equal(week.previous, 12);
  assert.equal(week.delta, 6);
  assert.equal(week.complete, true);
});

test('GitHub tooltips are joined by cell ID, with zero and comma counts parsed', () => {
  const parsed = parseCalendar(calendar());
  assert.equal(parsed.length, 7);
  assert.deepEqual(parsed[0], { date: '2026-09-21', count: 0 });
  assert.deepEqual(parsed[6], { date: '2026-09-27', count: 1234 });
  assert.throws(() => parseCalendar('<html>Loading…</html>'), /format is unavailable/);
});

test('SVG escapes user labels and does not report missing contributions as zero', () => {
  const week = core.makeWeek([], '2026-10-03');
  const badge = core.renderBadge(week, '<script>');
  assert.ok(badge.includes('&lt;script&gt;'));
  assert.ok(!badge.includes('<script>'));
  assert.ok(badge.includes('Contributions unavailable'));
  assert.ok(!badge.includes('0 contributions this week'));
  assert.equal((core.renderScene(week).match(/<g>/g) || []).length, 7);
});

test('history browsing keeps real today separate and does not turn future weeks into zero', () => {
  const counts = Array.from({ length: 7 }, (_, i) => ({ date: core.shiftDate('2026-09-21', i), count: 2 }));
  const past = core.makeWeek(counts, '2026-10-03', 'north', '2026-09-23');
  assert.equal(past.start, '2026-09-21');
  assert.equal(past.total, 14);
  assert.equal(past.complete, true);
  assert.equal(past.days.some(day => day.today), false);
  const future = core.makeWeek(counts, '2026-10-03', 'north', '2026-10-12');
  assert.equal(future.complete, false);
  assert.equal(future.delta, null);
  assert.ok(future.days.every(day => day.future && day.count === null));
});

test('monthly calendar handles leap years, alignment and December rollover', () => {
  const leap = core.makeMonth([], '2026-10-03', 'north', '2024-02-15');
  assert.equal(leap.start, '2024-02-01');
  assert.equal(leap.end, '2024-02-29');
  assert.equal(leap.days.length, 29);
  assert.equal(leap.cells.length, 42);
  assert.equal(leap.cells[0], null);
  assert.equal(leap.cells[3].date, '2024-02-01');
  assert.equal(core.makeMonth([], '2026-10-03', 'north', '2025-02-15').days.length, 28);
  assert.equal(core.shiftMonth('2026-12-31', 1), '2027-01-01');
  assert.equal(core.shiftMonth('2027-01-31', -1), '2026-12-01');
});

test('monthly totals compare matching elapsed days and distinguish unknown from future', () => {
  const counts = [
    { date: '2026-09-01', count: 1 }, { date: '2026-09-02', count: 1 }, { date: '2026-09-03', count: 1 },
    { date: '2026-10-01', count: 5 }, { date: '2026-10-02', count: 2 }, { date: '2026-10-03', count: 10 }
  ];
  const month = core.makeMonth(counts, '2026-10-03');
  assert.equal(month.total, 17);
  assert.equal(month.previous, 3);
  assert.equal(month.delta, 14);
  assert.equal(month.days[3].future, true);
  assert.equal(month.days[3].count, null);
  const missing = core.makeMonth(counts.slice(0, -1), '2026-10-03');
  assert.equal(missing.complete, false);
  assert.equal(missing.days[2].future, false);
  assert.equal(missing.days[2].count, null);
  assert.equal(missing.delta, null);
});

test('a longer month compares only dates which exist in the preceding month', () => {
  const counts = [
    ...Array.from({ length: 28 }, (_, i) => ({ date: core.shiftDate('2026-02-01', i), count: 1 })),
    ...Array.from({ length: 31 }, (_, i) => ({ date: core.shiftDate('2026-03-01', i), count: i === 30 ? 100 : 2 }))
  ];
  const month = core.makeMonth(counts, '2026-10-03', 'north', '2026-03-15');
  assert.equal(month.total, 160);
  assert.equal(month.previous, 28);
  assert.equal(month.delta, 28);
});

test('wind applies only to living plants and monthly SVG retains all calendar cells', () => {
  const counts = [{ date: '2026-09-28', count: 0 }, { date: '2026-09-29', count: 1 }];
  const scene = core.renderScene(core.makeWeek(counts, '2026-10-03'));
  assert.equal((scene.match(/class="pg-plant"/g) || []).length, 1);
  assert.ok(scene.includes('transform-origin:48px 89px'));
  const month = core.makeMonth(counts, '2026-10-03', 'north', '2026-09-01');
  const svg = core.renderMonth(month, { url: '/spring.png', width: 1254, height: 1254 });
  assert.equal((svg.match(/<title>/g) || []).length, 30);
  assert.equal((svg.match(/class="pg-shrub"/g) || []).length, 1);
  assert.ok(svg.includes('viewBox="0 0 224 192"'));
});

test('weather follows the viewed season in both views, including hemisphere inversion', () => {
  for (const [date, kind] of [['2026-04-01', 'rain'], ['2026-07-01', null], ['2026-10-01', 'leaves'], ['2026-01-01', 'snow']]) {
    const week = core.makeWeek([], '2026-10-03', 'north', date);
    const month = core.makeMonth([], '2026-10-03', 'north', date);
    for (const [svg, distance] of [[core.renderScene(week), 124], [core.renderMonth(month), 204]]) {
      if (!kind) {
        assert.ok(!svg.includes('class="pg-weather"'));
        continue;
      }
      assert.ok(svg.includes(`data-weather="${kind}" aria-hidden="true" pointer-events="none"`));
      assert.ok(svg.includes(`--pg-fall-distance:${distance}px`));
      const particles = svg.match(/class="pg-weather-particle /g) || [];
      assert.ok(particles.length > 0 && particles.length <= 12);
    }
  }
  const south = core.makeMonth([], '2026-10-03', 'south');
  assert.ok(core.renderMonth(south).includes('data-weather="rain"'));
});

test('cherry canopies reflect growth without turning missing or future days into shrubs', async () => {
  const sheets = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'source', 'garden', 'sprites', 'manifest.json'), 'utf8'));
  const counts = [0, 1, 3, 6, 10].map((count, i) => ({ date: core.shiftDate('2026-04-01', i), count }));
  const spring = core.renderMonth(core.makeMonth(counts, '2026-04-07'), { ...sheets.spring, url: sheets.spring.file });
  assert.equal((spring.match(/class="pg-shrub"/g) || []).length, 4);
  assert.equal((spring.match(/class="pg-sakura-canopy"/g) || []).length, 4);
  assert.ok(!spring.includes('class="pg-shrub-canopy"'));
  assert.ok(spring.includes('2026-04-06 Mon: Contributions unavailable'));
  assert.ok(spring.includes('2026-04-08 Wed: Not yet'));
  assert.ok(spring.includes('2026-04-05 Sun: 10 contributions · Bloom'));
  const summer = core.renderMonth(core.makeMonth(counts.map(day => ({ ...day, date: day.date.replace('-04-', '-07-') })), '2026-07-07'), { ...sheets.summer, url: sheets.summer.file });
  assert.equal((summer.match(/class="pg-shrub-canopy"/g) || []).length, 4);
  assert.ok(!summer.includes('pg-sakura-canopy'));
});

test('monthly decorations use only the four busiest days at 15 or more contributions', async () => {
  const sheets = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'source', 'garden', 'sprites', 'manifest.json'), 'utf8'));
  const counts = [15, 16, 16, 20, 14, 25].map((count, index) => ({ date: core.shiftDate('2026-04-01', index), count }));
  const month = core.makeMonth(counts, '2026-04-07');
  assert.deepEqual(core.specialDatesFor(month), ['2026-04-06', '2026-04-04', '2026-04-02', '2026-04-03']);
  const svg = core.renderMonth(month, { ...sheets.spring, url: sheets.spring.file }, { decorationSprites: { sparrow: '/sparrow.png' } });
  assert.equal((svg.match(/class="pg-month-decoration pg-month-visitor"/g) || []).length, 4);
  assert.equal((svg.match(/href="\/sparrow.png"/g) || []).length, 4);
  assert.equal(core.specialDatesFor(core.makeMonth([{ date: '2026-04-01', count: 15 }], '2026-04-02')).length, 1);
});

test('summer alternates lemonade with an animal, while winter replaces its special shrub with lit artwork', async () => {
  const sheets = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'source', 'garden', 'sprites', 'manifest.json'), 'utf8'));
  const summer = core.makeMonth([{ date: '2026-07-01', count: 15 }, { date: '2026-07-02', count: 15 }], '2026-07-03');
  assert.notEqual(core.decorationFor(summer.days[0], 'summer'), core.decorationFor(summer.days[1], 'summer'));
  const summerSvg = core.renderMonth(summer, { ...sheets.summer, url: sheets.summer.file }, { decorationSprites: { frog: '/frog.png', lemonade: '/lemonade.png' } });
  assert.ok(summerSvg.includes('href="/frog.png"'));
  assert.ok(summerSvg.includes('href="/lemonade.png"'));
  assert.ok(!summerSvg.includes('pg-winter-lights'));
  const winter = core.makeMonth([{ date: '2026-01-01', count: 15 }, { date: '2026-01-02', count: 14 }], '2026-01-03');
  const winterSvg = core.renderMonth(winter, { ...sheets.winter, url: sheets.winter.file }, { decorationSprites: { sparrow: '/sparrow.png', winterLit: '/winter-lit.png' } });
  assert.equal((winterSvg.match(/href="\/winter-lit.png"/g) || []).length, 1);
  assert.equal((winterSvg.match(/href="winter-growth-v1.png"/g) || []).length, 1);
  assert.ok(!winterSvg.includes('pg-winter-lights'));
  assert.ok(!winterSvg.includes('href="/sparrow.png"'));
});

test('sprite atlas stages select separate cells without drawing zero, unknown or future plants', () => {
  const counts = [0, 1, 3, 6, 10].map((count, i) => ({ date: core.shiftDate('2026-04-01', i), count }));
  const month = core.makeMonth(counts, '2026-04-07');
  const svg = core.renderMonth(month, { url: '/blog/garden/sprites/spring.png?a=1&b=2', width: 1254, height: 1254 });
  assert.equal((svg.match(/<image /g) || []).length, 4);
  for (const slot of ['0 0', '627 0', '0 627', '627 627']) assert.ok(svg.includes(`viewBox="${slot} 627 627"`));
  assert.ok(svg.includes('href="/blog/garden/sprites/spring.png?a=1&amp;b=2"'));
  assert.ok(svg.includes('2026-04-06 Mon: Contributions unavailable'));
  assert.ok(svg.includes('2026-04-08 Wed: Not yet'));
});

test('weekly image plants stay rooted at the wind pivot and respect column width', () => {
  const counts = [0, 1, 3, 6, 10].map((count, i) => ({ date: core.shiftDate('2026-09-28', i), count }));
  const frames = Array.from({ length: 4 }, (_, i) => ({ x: i % 2 * 100, y: Math.floor(i / 2) * 100, width: 70, height: 90 }));
  const scene = core.renderScene(core.makeWeek(counts, '2026-10-03'), { url: '/tree.png', width: 200, height: 200, frames });
  assert.equal((scene.match(/<image /g) || []).length, 4);
  assert.equal((scene.match(/class="pg-plant"/g) || []).length, 4);
  for (const match of scene.matchAll(/class="pg-sprite" x="[^"]+" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)) {
    assert.ok(Math.abs(Number(match[1]) + Number(match[3]) - 89) < 1e-9);
    assert.ok(Number(match[2]) <= 27);
  }
  assert.ok(!core.renderBadge(core.makeWeek(counts, '2026-10-03'), 'rD227').includes('<image '));
});

test('side-view scale enlarges real seasonal sprites while keeping roots and edge crowns inside the scene', async () => {
  const sheets = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'source', 'garden', 'sprites', 'weekly-manifest.json'), 'utf8'));
  const dates = { spring: '2026-04-06', summer: '2026-07-06', autumn: '2026-09-07', winter: '2026-01-05' };
  const boxes = svg => Array.from(svg.matchAll(/class="pg-sprite" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g), match => match.slice(1).map(Number));
  for (const [season, date] of Object.entries(dates)) {
    const week = core.makeWeek(Array.from({ length: 7 }, (_, i) => ({ date: core.shiftDate(date, i), count: [10, 1, 3, 6, 10, 3, 10][i] })), '2026-10-03', 'north', date);
    const sheet = { ...sheets[season], url: sheets[season].file };
    const normal = boxes(core.renderScene(week, sheet));
    const larger = boxes(core.renderScene(week, sheet, { plantScale: 1.5 }));
    assert.equal(larger.length, 7);
    larger.forEach(([x, y, width, height], i) => {
      assert.ok(Math.abs(width - normal[i][2] * 1.5) < 1e-9);
      assert.ok(Math.abs(height - normal[i][3] * 1.5) < 1e-9);
      assert.ok(Math.abs(y + height - 89) < 1e-9);
      assert.ok(x >= 2 - 1e-9 && x + width <= 222 + 1e-9);
    });
  }
});

test('monthly scaling allows overlap above all ground tiles and retains complete edge crowns', async () => {
  const sheets = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'source', 'garden', 'sprites', 'manifest.json'), 'utf8'));
  const boxes = svg => Array.from(svg.matchAll(/class="pg-sprite" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g), match => match.slice(1).map(Number));
  const dates = { spring: '2026-04-01', summer: '2026-07-01', autumn: '2026-09-01', winter: '2026-01-01' };
  for (const [season, sheet] of Object.entries(sheets)) {
    const date = dates[season];
    const month = core.makeMonth(Array.from({ length: 30 }, (_, i) => ({ date: core.shiftDate(date, i), count: i < 5 ? [0, 1, 3, 6, 10][i] : 10 })), '2026-10-03', 'north', date);
    const artwork = { ...sheet, url: sheet.file };
    const normal = boxes(core.renderMonth(month, artwork));
    const svg = core.renderMonth(month, artwork, { plantScale: 1.5 });
    const larger = boxes(svg);
    assert.equal(larger.length, 29);
    larger.forEach(([x, y, width, height], i) => {
      assert.equal(width, normal[i][2] * 1.5);
      assert.equal(height, normal[i][3] * 1.5);
      assert.ok(x >= 1 && x + width <= 223 && y >= 1 && y + height <= 191);
    });
    assert.ok(larger.some(([, , width]) => width > 32));
    assert.ok(svg.lastIndexOf('</title>') < svg.indexOf('<g class="pg-month-plants"'));
  }
});

test('monthly artwork missing shows known counts separately from zero, unknown and future days', () => {
  const month = core.makeMonth([{ date: '2026-10-01', count: 0 }, { date: '2026-10-02', count: 7 }], '2026-10-03');
  const svg = core.renderMonth(month);
  assert.equal((svg.match(/class="pg-month-value"/g) || []).length, 1);
  assert.ok(/class="pg-month-value"[^>]+>7<\/text>/.test(svg));
  assert.ok(svg.includes('2026-10-01 Thu: 0 contributions'));
  assert.ok(svg.includes('2026-10-03 Sat: Contributions unavailable'));
  assert.ok(svg.includes('2026-10-04 Sun: Not yet'));
  assert.ok(!svg.includes('<image ') && !svg.includes('class="pg-shrub"'));
});

test('generator writes a real snapshot, reuses cache on failure, and handles no cache', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-garden-test-'));
  const originalFetch = global.fetch;
  const warnings = [];
  const hexo = { base_dir: base, config: { root: '/blog/', pixel_garden: { username: 'rD227', live_refresh: false } }, log: { warn: message => warnings.push(message) } };
  const cacheDir = path.join(base, '.cache', 'pixel-garden');
  const cache = path.join(cacheDir, 'rD227.json');
  t.after(async () => {
    global.fetch = originalFetch;
    await fs.unlink(cache).catch(() => {});
    await fs.rmdir(cacheDir).catch(() => {});
    await fs.rmdir(path.join(base, '.cache')).catch(() => {});
    await fs.rmdir(base);
  });
  global.fetch = async () => ({ ok: true, text: async () => calendar() });
  let routes = await generate(hexo);
  const route = name => routes.find(item => item.path === name);
  assert.equal(JSON.parse(route('garden/config.json').data).snapshotUrl, '/blog/garden/data.json');
  assert.equal(JSON.parse(route('garden/config.json').data).liveRefresh, false);
  assert.equal(JSON.parse(route('garden/config.json').data).spriteSheets, undefined);
  hexo.source_dir = path.join(__dirname, '..', 'source');
  routes = await generate(hexo);
  const sheets = JSON.parse(route('garden/config.json').data).spriteSheets;
  assert.deepEqual(Object.keys(sheets), ['spring', 'summer', 'autumn', 'winter']);
  assert.equal(sheets.spring.url, '/blog/garden/sprites/spring-growth-v1.png');
  assert.equal(sheets.spring.width, 1254);
  const weeklySheets = JSON.parse(route('garden/config.json').data).weeklySpriteSheets;
  assert.equal(weeklySheets.winter.url, '/blog/garden/sprites/winter-weekly-v1.png');
  assert.equal(weeklySheets.winter.frames.length, 4);
  assert.equal(JSON.parse(route('garden/data.json').data).contributions.length, 7);
  global.fetch = async () => { throw new Error('offline'); };
  routes = await generate(hexo);
  assert.equal(JSON.parse(route('garden/data.json').data).stale, true);
  await fs.unlink(cache);
  routes = await generate(hexo);
  assert.equal(JSON.parse(route('garden/data.json').data).unavailable, true);
  assert.ok(route('garden/week.svg').data.includes('Contributions unavailable'));
  assert.equal(warnings.length, 2);
  hexo.config.pixel_garden.enable = false;
  assert.deepEqual(await generate(hexo), []);
});
