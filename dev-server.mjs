// dev-server.mjs —— 零依赖本地开发服务器
//
// 用途:在没有 vercel CLI 的环境里也能本地预览(服务静态文件 + 代理 /api/generate)。
// 生产环境请用 Vercel,这个文件仅用于本地开发。
//
// 用法:
//   1. 复制 .env.example 为 .env,填入 LLM_API_KEY
//   2. node dev-server.mjs
//   3. 浏览器打开 http://localhost:3000

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(url.fileURLToPath(import.meta.url));

// 读取 .env(简单的 KEY=VALUE 解析,无需依赖 dotenv)
function loadEnv() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim();
    }
  }
}
loadEnv();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

// 复用 api/generate.js 的逻辑(动态 import)
const generateHandler = (await import('./api/generate.js')).default;

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsed.pathname);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // /api/* 交给 generate handler
  if (pathname.startsWith('/api/')) {
    // 收集 body
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsedBody = {};
    if (body) {
      try { parsedBody = JSON.parse(body); } catch {}
    }
    // 适配 Vercel handler 的 req/res 形状
    const fakeReq = { method: req.method, body: parsedBody, query: parsed.query };
    const chunks = [];
    const fakeRes = {
      statusCode: 200,
      _headers: {},
      setHeader(k, v) { this._headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(obj) {
        const payload = JSON.stringify(obj);
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...this._headers });
        res.end(payload);
      },
      end() { res.end(); },
    };
    try {
      await generateHandler(fakeReq, fakeRes);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    }
    return;
  }

  // 静态文件
  if (pathname === '/') pathname = '/index.html';
  // 防路径穿越
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  // SPA 回退:非文件请求一律返回 index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const idx = path.join(ROOT, 'index.html');
    if (fs.existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(idx));
    }
    res.writeHead(404);
    return res.end('Not Found');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  Vibe Forum dev server running:`);
  console.log(`  → http://localhost:${PORT}\n`);
  if (!process.env.LLM_API_KEY) {
    console.log(`  ⚠️  未检测到 LLM_API_KEY。请复制 .env.example 为 .env 并填入你的 API Key。\n`);
  }
});
