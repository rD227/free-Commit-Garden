/* SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 rD227 (XvSu)
 * This program is free software: you can redistribute it and/or modify it
 * under the GNU General Public License, version 3 or any later version.
 * This program is distributed WITHOUT ANY WARRANTY; see the component LICENSE.
 */
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const garden = require('../source/js/pixel-garden-core');

// Read GitHub's public calendar directly at build time; no token or paid service.
function parseCalendar(html) {
  const tips = new Map();
  for (const match of html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g)) {
    const id = match[1].match(/\bfor="([^"]+)"/);
    const text = match[2].replace(/<[^>]*>/g, '').trim();
    const count = text.match(/^(No|[\d,]+) contributions?\b/i);
    if (id && count) tips.set(id[1], count[1].toLowerCase() === 'no' ? 0 : Number(count[1].replace(/,/g, '')));
  }
  const contributions = [];
  for (const match of html.matchAll(/<td\b[^>]*\bdata-date="\d{4}-\d{2}-\d{2}"[^>]*>/g)) {
    const date = match[0].match(/\bdata-date="([^"]+)"/)[1];
    const id = match[0].match(/\bid="([^"]+)"/);
    if (id && tips.has(id[1])) contributions.push({ date, count: tips.get(id[1]) });
  }
  if (contributions.length < 7) throw new Error('GitHub calendar format is unavailable');
  return contributions.sort((a, b) => a.date.localeCompare(b.date));
}

function validSnapshot(data, username) {
  return data && data.username === username && Number.isFinite(Date.parse(data.updatedAt)) &&
    Array.isArray(data.contributions) && data.contributions.length >= 7 &&
    data.contributions.every(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isSafeInteger(item.count) && item.count >= 0);
}

async function generate(hexo, options = {}) {
  const settings = hexo.config.pixel_garden;
  if (!settings || settings.enable === false) return [];
  const username = String(settings.username || '');
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) throw new Error('pixel_garden.username must be a GitHub username');
  const timezone = settings.timezone || hexo.config.timezone || 'Asia/Shanghai';
  const hemisphere = settings.hemisphere === 'south' ? 'south' : 'north';
  const today = garden.dateKey(new Date(), timezone);
  const cachePath = path.join(hexo.base_dir, '.cache', 'pixel-garden', `${username}.json`);
  let snapshot = { username, updatedAt: null, source: 'github', contributions: [], unavailable: true };
  // Standalone builds can supply an offline snapshot without requesting GitHub.
  if (options.snapshot !== undefined) {
    if (!validSnapshot(options.snapshot, username)) throw new Error('Invalid contribution snapshot');
    snapshot = options.snapshot;
  } else {
    try {
      const response = await fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'Hexo-Pixel-Garden' },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      snapshot = { username, updatedAt: new Date().toISOString(), source: 'github', contributions: parseCalendar(await response.text()) };
    } catch (error) {
      hexo.log.warn(`[pixel-garden] ${error.message}; using cache if available`);
      try {
        const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
        if (validSnapshot(cached, username)) snapshot = { ...cached, stale: true };
      } catch (_) { /* The widget explicitly labels unavailable data. */ }
    }
  }
  if (options.snapshot === undefined && !snapshot.unavailable && !snapshot.stale) {
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(snapshot));
    } catch (error) { hexo.log.warn(`[pixel-garden] Could not save cache: ${error.message}`); }
  }
  const root = hexo.config.root || '/';
  async function readSheets(filename) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(hexo.source_dir || path.join(hexo.base_dir, 'source'), 'garden', 'sprites', filename), 'utf8'));
      return Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => {
        const sheet = manifest[season];
        if (!sheet || !/^[a-z0-9-]+\.png$/.test(sheet.file) || !Number.isInteger(sheet.width) || !Number.isInteger(sheet.height) || sheet.width <= 0 || sheet.height <= 0) throw new Error('Invalid sprite manifest');
        if (sheet.frames && (sheet.frames.length !== 4 || sheet.frames.some(frame => !['x', 'y', 'width', 'height'].every(key => Number.isInteger(frame[key])) || frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0 || frame.x + frame.width > sheet.width || frame.y + frame.height > sheet.height))) throw new Error('Invalid sprite frames');
        return [season, { url: `${root}garden/sprites/${sheet.file}`, width: sheet.width, height: sheet.height, frames: sheet.frames }];
      }));
    } catch (_) { return undefined; /* Renderers handle missing artwork. */ }
  }
  const spriteSheets = await readSheets('manifest.json');
  const weeklySpriteSheets = await readSheets('weekly-manifest.json');
  let decorationSprites;
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(hexo.source_dir || path.join(hexo.base_dir, 'source'), 'garden', 'sprites', 'decoration-manifest.json'), 'utf8'));
    decorationSprites = Object.fromEntries(['sparrow', 'frog', 'squirrel', 'lemonade'].map(name => {
      const file = manifest[name];
      if (!/^[a-z0-9-]+\.png$/.test(file)) throw new Error('Invalid decoration manifest');
      return [name, `${root}garden/sprites/${file}`];
    }));
  } catch (_) { /* The garden still renders when optional decorations are unavailable. */ }
  const config = { enable: true, username, timezone, hemisphere, liveRefresh: settings.live_refresh !== false,
    snapshotUrl: `${root}garden/data.json`, spriteSheets, weeklySpriteSheets, decorationSprites };
  return [
    { path: 'garden/config.json', data: JSON.stringify(config) },
    { path: 'garden/data.json', data: JSON.stringify(snapshot) },
    { path: 'garden/week.svg', data: garden.renderBadge(garden.makeWeek(snapshot.contributions, today, hemisphere), username) }
  ];
}

if (typeof hexo !== 'undefined') hexo.extend.generator.register('pixel-garden', () => generate(hexo));
module.exports = { parseCalendar, validSnapshot, generate };
