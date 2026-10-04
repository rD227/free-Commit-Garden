/* SPDX-License-Identifier: GPL-3.0-or-later — Copyright (C) 2026 rD227 (XvSu) */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

function createServer(directory, root = '/') {
  const base = path.resolve(directory);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (root !== '/' && pathname === root.slice(0, -1)) { response.writeHead(302, { Location: root }); response.end(); return; }
      if (!pathname.startsWith(root)) { response.writeHead(404); response.end(); return; }
      const relative = pathname.slice(root.length) || 'index.html';
      const file = path.resolve(base, relative);
      const within = path.relative(base, file);
      if (within.startsWith('..') || path.isAbsolute(within)) { response.writeHead(403); response.end(); return; }
      const data = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) { response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400); response.end(); }
  });
}

if (require.main === module) {
  const args = process.argv.slice(2), options = { dir: 'dist', host: '127.0.0.1', port: '4173', root: '/' };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!Object.hasOwn(options, key) || !args[i + 1]) throw new Error(`Unknown option or missing value: ${args[i]}`);
    options[key] = args[i + 1];
  }
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  if (!options.root.startsWith('/') || !options.root.endsWith('/')) throw new Error('--root must start and end with /');
  const server = createServer(options.dir, options.root);
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, options.host, () => console.log(`Garden preview: http://${options.host}:${port}${options.root}`));
}
module.exports = { createServer };
