'use strict';
const { app, BrowserWindow, dialog, session, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createLocalAi, findSharedRuntime } = require('./local-ai.js');
const { createLocalAsr } = require('./local-asr.js');

const PORT = 49564;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const WEB_ROOT = path.join(__dirname, 'web');
// Only accept the documented extracted handoff layout; a standalone desktop
// archive still launches when the optional shared runtime is absent.
const AI_ROOT = findSharedRuntime(__dirname) || path.join(__dirname, '__missing-local-ai__');
const localAi = createLocalAi({ origin: ORIGIN, assetRoot: AI_ROOT });
const localAsr = createLocalAsr({ origin: ORIGIN, assetRoot: AI_ROOT });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};
let server;
function launchServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      if (req.headers.host !== `127.0.0.1:${PORT}`) {
        res.writeHead(403).end(); return;
      }
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname); }
      catch { res.writeHead(400).end(); return; }
      if (pathname.includes('\\') || pathname.includes('\0')) { res.writeHead(400).end(); return; }
      if (localAi.owns(pathname)) {
        void localAi.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
        return;
      }
      if (localAsr.owns(pathname)) {
        void localAsr.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(403).end(); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const target = path.resolve(WEB_ROOT, `.${pathname}`);
      const relative = path.relative(WEB_ROOT, target);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
      fs.stat(target, (error, stat) => {
        if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
          'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
        if (req.method === 'HEAD') { res.end(); return; }
        const file = fs.createReadStream(target);
        file.on('error', () => res.destroy());
        file.pipe(res);
      });
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
}
app.setName('Oki Doki');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });
  app.whenReady().then(async () => {
    try { await launchServer(); }
    catch (error) {
      dialog.showErrorBox('Oki Doki could not start', `The game needs local port ${PORT}. Close any other program using that port and try again.\n\n${error.message}`);
      app.quit(); return;
    }
    const currentSession = session.defaultSession;
    currentSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      const audioOnly = permission === 'media' && Array.isArray(details.mediaTypes) && details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === 'audio');
      callback(audioOnly && contents.getURL().startsWith(ORIGIN + '/'));
    });
    const window = new BrowserWindow({
      width: 1280, height: 800, minWidth: 800, minHeight: 600,
      title: 'Oki Doki', backgroundColor: '#141521',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(ORIGIN + '/')) return;
      event.preventDefault();
      if (url.startsWith('mailto:surelyitstimeyou@pm.me')) shell.openExternal(url).catch(() => {});
    });
    await window.loadURL(ORIGIN + '/');
  }).catch(error => { dialog.showErrorBox('Oki Doki could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { localAsr.close(); localAi.close(); if (server) server.close(); });
}
