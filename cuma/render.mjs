// node render.mjs [--frames a,b,c --out dir] | [--video out.mp4] ; renders index.html frames in parallel
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const A = Object.fromEntries(process.argv.slice(2).map((a, i, r) => a.startsWith('--') ? [a.slice(2), r[i + 1]] : null).filter(Boolean));
const S = 1080, MB = +(A.mb || 6), WORKERS = +(A.workers || 4);
const frames = A.frames ? A.frames.split(',').map(Number) : [...Array(300).keys()];
const held = new Map(); let next = 0; let ff = null;
if (A.video) ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${S}x${S}`, '-framerate', '60', '-i', '-',
  '-i', path.join(ROOT, 'build/cuma_audio.wav'), '-map', '0:v', '-map', '1:a',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', A.video], { stdio: ['pipe', 'inherit', 'inherit'] });
const pending = [];
const srv = http.createServer((req, res) => {
  if (req.method === 'POST') {
    const f = +new URL(req.url, 'http://x').searchParams.get('f'); const ch = [];
    req.on('data', (c) => ch.push(c)); req.on('end', async () => {
      const raw = Buffer.concat(ch);
      if (A.out) { fs.mkdirSync(A.out, { recursive: true }); pending.push(new Promise((r) => { const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${S}x${S}`, '-i', '-', '-frames:v', '1', path.join(A.out, `f${String(f).padStart(3, '0')}.png`)]); p.on('close', r); p.stdin.end(raw); })); }
      if (ff) { held.set(f, raw); while (held.has(frames[next])) { const b = held.get(frames[next]); held.delete(frames[next++]); if (!ff.stdin.write(b)) await new Promise((r) => ff.stdin.once('drain', r)); } }
      res.end('ok');
    }); return;
  }
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'font/ttf' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/index.html`;
const queue = frames.slice(); const t0 = Date.now();
await Promise.all([...Array(Math.min(WORKERS, frames.length))].map(async () => {
  const b = await chromium.launch({ args: ['--disable-accelerated-2d-canvas', '--force-color-profile=srgb'] });
  const pg = await b.newPage({ viewport: { width: S, height: S } });
  pg.on('pageerror', (e) => console.error('pageerror', e.message));
  await pg.goto(url); await pg.evaluate(() => window.ready);
  while (queue.length) { const f = queue.shift(); await pg.evaluate(([f, m]) => window.renderFrame(f, m), [f, MB]); await pg.evaluate((f) => window.capture(f), f); }
  await b.close();
}));
await Promise.all(pending);
if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
console.log(`done ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`); srv.close();
