/* SPDX-License-Identifier: GPL-3.0-or-later — Copyright (C) 2026 rD227 (XvSu) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, build } = require('../scripts/build.cjs');
const { createServer } = require('../scripts/serve.cjs');

test('standalone options support deployment prefixes and reject unsafe or incomplete inputs', () => {
  const options = parseArgs(['--username', 'octocat', '--root', '/my-garden', '--hemisphere', 'south']);
  assert.equal(options.root, '/my-garden/');
  assert.equal(options.hemisphere, 'south');
  for (const args of [['--root', '/../'], ['--root', 'https://example.com/'], ['--username'], ['--hemisphere', 'west'], ['--demo', '--input', 'data.json']]) assert.throws(() => parseArgs(args));
});

test('offline build generates a deployable garden with local artwork and explicit demo data', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'free-garden-build-'));
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Offline builds must not request the network'); };
  t.after(async () => { global.fetch = originalFetch; await fs.rm(directory, { recursive: true, force: true }); });
  const result = await build(parseArgs(['--demo', '--root', '/garden-project/', '--out', directory]));
  assert.equal(result.unavailable, false);
  const config = JSON.parse(await fs.readFile(path.join(directory, 'garden/config.json')));
  const data = JSON.parse(await fs.readFile(path.join(directory, 'garden/data.json')));
  assert.equal(data.source, 'demo');
  assert.equal(data.contributions.length, 370);
  assert.equal(config.liveRefresh, false);
  assert.equal(config.snapshotUrl, '/garden-project/garden/data.json');
  const html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
  assert.ok(html.includes('DEMO DATA'));
  assert.ok(html.includes('data-target="#garden"'));
  assert.ok(html.includes('/garden-project/js/pixel-garden.js'));
  assert.ok((await fs.readFile(path.join(directory, 'LICENSE'), 'utf8')).includes('GNU GENERAL PUBLIC LICENSE'));
  assert.ok((await fs.readFile(path.join(directory, 'NOTICE'), 'utf8')).includes('rD227'));
  for (const sheets of [config.spriteSheets, config.weeklySpriteSheets]) for (const sheet of Object.values(sheets)) {
    const file = sheet.url.replace('/garden-project/', '');
    const png = await fs.readFile(path.join(directory, file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
});

test('invalid offline input is rejected instead of falling through to a network request', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'free-garden-invalid-'));
  const input = path.join(directory, 'data.json');
  await fs.writeFile(input, 'null');
  const originalFetch = global.fetch;
  let requested = false;
  global.fetch = async () => { requested = true; throw new Error('unexpected fetch'); };
  t.after(async () => { global.fetch = originalFetch; await fs.rm(directory, { recursive: true, force: true }); });
  await assert.rejects(build(parseArgs(['--input', input, '--out', path.join(directory, 'out')])), /Invalid contribution snapshot/);
  assert.equal(requested, false);
});

test('preview serves a deployment prefix and prevents encoded Windows path traversal', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'free-garden-server-'));
  const root = path.join(directory, 'public');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'index.html'), 'garden');
  await fs.writeFile(path.join(directory, 'private.txt'), 'private');
  const server = createServer(root, '/demo/');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(`${url}/demo/`)).text(), 'garden');
  assert.equal((await fetch(`${url}/index.html`)).status, 404);
  const traversal = await fetch(`${url}/demo/..%5Cprivate.txt`);
  assert.ok([403, 404].includes(traversal.status));
  assert.ok(!(await traversal.text()).includes('private'));
});
