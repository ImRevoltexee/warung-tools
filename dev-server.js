// Local dev server — mirrors Vercel's file-based routing so we can test /api/* offline.
// Usage: node dev-server.js  (default http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // ---- API routes
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice('/api/'.length).replace(/[^a-z0-9_-]/gi, '');
    const file = path.join(ROOT, 'api', `${name}.js`);
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, error: `Endpoint /api/${name} tidak ada` }));
    }
    try {
      delete require.cache[require.resolve(file)];
      const handler = require(file);
      return await handler(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ---- static
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  let target = path.join(ROOT, p);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) && fs.existsSync(target + '.html')) target += '.html';

  if (!target.startsWith(ROOT) || !fs.existsSync(target)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<h1>404</h1><p><a href="/">Balik ke home</a></p>');
  }

  res.setHeader('Content-Type', MIME[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});

server.listen(PORT, () => console.log(`dev server: http://localhost:${PORT}`));
