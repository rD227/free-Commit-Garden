/* SPDX-License-Identifier: GPL-3.0-or-later — Copyright (C) 2026 rD227 (XvSu) */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('../source/js/pixel-garden-core');
const { generate } = require('./pixel-garden');
const project = path.resolve(__dirname, '..');

function parseArgs(args) {
  const result = { username: 'rD227', timezone: 'Asia/Shanghai', hemisphere: 'north', root: '/', out: 'dist' };
  const values = new Set(['username', 'timezone', 'hemisphere', 'root', 'out', 'input']);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--demo') { result.demo = true; continue; }
    const name = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !values.has(name) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown option or missing value: ${args[i]}`);
    result[name] = args[++i];
  }
  if (result.demo && result.input) throw new Error('--demo and --input cannot be combined');
  if (!['north', 'south'].includes(result.hemisphere)) throw new Error('--hemisphere must be north or south');
  result.root = result.root.endsWith('/') ? result.root : `${result.root}/`;
  if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(result.root) || result.root.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('--root must be an absolute URL path, such as / or /garden/');
  core.dateKey(new Date(), result.timezone); // Reject an invalid IANA timezone.
  return result;
}

function demoSnapshot(options, now = new Date()) {
  const today = core.dateKey(now, options.timezone);
  return {
    username: options.username, updatedAt: now.toISOString(), source: 'demo',
    contributions: Array.from({ length: 370 }, (_, index) => ({
      date: core.shiftDate(today, index - 369),
      count: [0, 1, 3, 6, 12, 2, 15, 0, 5, 10][index % 10]
    }))
  };
}

function page(options) {
  const root = core.escape(options.root);
  const label = options.demo ? '<p class="notice">DEMO DATA · Generated examples, not actual GitHub activity.</p>' : `<p>A seasonal contribution garden for @${core.escape(options.username)}.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>free-Commit-Garden</title><link rel="icon" href="data:,"><link rel="stylesheet" href="${root}css/pixel-garden.css">
<style>
* { box-sizing: border-box; } body { margin: 0; background: #f7f4ed; color: #665e4d; font: 16px/1.6 system-ui, sans-serif; }
main { max-width: 980px; margin: 56px auto; padding: 0 24px; } h1 { font-size: clamp(26px, 4vw, 38px); margin: 0; letter-spacing: -.04em; }
header p { color: #8d8577; margin: 8px 0; } a { color: #698d6a; } .notice { font-size: 13px; }
#garden { margin: 28px 0; padding: 0 28px; background: #fffdf8; border-radius: 16px; box-shadow: 0 6px 30px #665e4d0d; }
.pixel-garden[data-placement="main"] { border: 0; } footer { color: #8d8577; font-size: 13px; }
@media(max-width:600px) { main { margin: 24px auto; padding: 0 14px; } #garden { padding: 0 14px; } }
</style>
<script src="${root}js/pixel-garden-core.js" defer></script>
<script src="${root}js/pixel-garden.js" data-target="#garden" data-config="${root}garden/config.json" defer></script>
</head><body><main><header><h1>free-Commit-Garden</h1>${label}</header>
<div id="garden"></div><noscript>This interactive garden needs JavaScript. <a href="${root}garden/week.svg">View the static garden badge</a>.</noscript>
<footer>Drag or swipe to browse. Switch between Week and Month below.<br>
<a href="https://github.com/rD227/free-Commit-Garden">Source code</a> · <a href="${root}LICENSE">GNU GPL v3 or later</a> · Artwork by rD227 (XvSu)</footer>
</main></body></html>`;
}

async function build(options) {
  const dest = path.resolve(options.out);
  const relative = path.relative(project, dest);
  if (!relative || ['source', 'scripts', 'tests', 'docs', 'examples', '.github', '.git'].includes(relative.split(path.sep)[0])) throw new Error('Choose a separate output directory');
  const snapshot = options.demo ? demoSnapshot(options) : options.input ? JSON.parse(await fs.readFile(options.input, 'utf8')) : undefined;
  const routes = await generate({
    base_dir: project, source_dir: path.join(project, 'source'),
    config: { root: options.root, timezone: options.timezone, pixel_garden: {
      username: options.username, timezone: options.timezone, hemisphere: options.hemisphere,
      live_refresh: !options.demo && !options.input
    } }, log: { warn: message => process.stderr.write(`${message}\n`) }
  }, snapshot !== undefined ? { snapshot } : {});
  for (const folder of ['js', 'css', 'garden/sprites']) {
    await fs.mkdir(path.join(dest, folder), { recursive: true });
    await fs.cp(path.join(project, 'source', folder), path.join(dest, folder), { recursive: true });
  }
  for (const route of routes) await fs.writeFile(path.join(dest, route.path), route.data);
  await fs.copyFile(path.join(project, 'LICENSE'), path.join(dest, 'LICENSE'));
  await fs.copyFile(path.join(project, 'NOTICE'), path.join(dest, 'NOTICE'));
  await fs.writeFile(path.join(dest, 'index.html'), page(options));
  return { directory: dest, demo: Boolean(options.demo), unavailable: JSON.parse(routes.find(route => route.path === 'garden/data.json').data).unavailable === true };
}

if (require.main === module) {
  build(parseArgs(process.argv.slice(2))).then(result => {
    console.log(`Built ${result.demo ? 'offline demo' : 'garden'} in ${result.directory}`);
    if (result.unavailable) console.warn('GitHub data is unavailable. The page labels the missing data explicitly.');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { parseArgs, demoSnapshot, page, build };
