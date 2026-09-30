// Frame renderer: headless Chromium (WebGL2 via SwiftShader) -> PNG frames or piped to ffmpeg.
// Usage:
//   node render.mjs --frames 0,120,300 --out build/preview [--scale 0.5] [--mb 4]
//   node render.mjs --range 0:900:1 --video build/video_noaudio.mp4 [--mb 8]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const scale = parseFloat(args.scale || '1');
const mb = parseInt(args.mb || '8', 10);
const shutter = parseFloat(args.shutter || '0.5');

let frames = [];
if (args.frames) frames = args.frames.split(',').map(Number);
else if (args.range) {
  const [a, b, s = 1] = args.range.split(':').map(Number);
  for (let f = a; f < b; f += s) frames.push(f);
} else frames = [0];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.json': 'application/json', '.woff2': 'font/woff2' };
let onFrame = null;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/frame')) {
    const f = +new URL(req.url, 'http://x').searchParams.get('f');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      await onFrame(f, Buffer.concat(chunks));
      res.writeHead(200);
      res.end();
    });
    return;
  }
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const W = Math.round(1920 * scale), H = Math.round(1080 * scale);
const nWorkers = Math.max(1, Math.min(parseInt(args.workers || '1', 10), frames.length));
let stutter = null;
if (fs.existsSync(path.join(ROOT, 'build/stutter.json'))) stutter = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/stutter.json'), 'utf8'));
const browsers = [];
const pages = [];
for (let k = 0; k < nWorkers; k++) {
  const browser = await chromium.launch({
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--force-color-profile=srgb',
      '--disable-accelerated-2d-canvas',
      '--in-process-gpu',
    ],
  });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (!m.text().includes('GL Driver')) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.reel && window.reel.init);
  const info = await page.evaluate((o) => window.reel.init(o), { scale, stutter });
  if (k === 0) console.log('init', JSON.stringify(info), 'workers', nWorkers);
  pages.push(page);
}

// Raw RGBA (bottom-up) -> PNG via ffmpeg, for previews.
function writePNG(file, raw) {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-frames:v', '1', file]);
    p.on('close', resolve);
    p.stdin.end(raw);
  });
}

let ff = null;
if (args.video && args.lossless) {
  ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`,
    '-framerate', '60', '-i', '-', '-c:v', 'libx264rgb', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'rgb24', args.video],
    { stdio: ['pipe', 'inherit', 'inherit'] });
} else if (args.video) {
  const fps = parseFloat(args.fps || '60');
  const vargs = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', String(fps), '-i', '-',
    ...(args.audio ? ['-i', args.audio] : []),
    '-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', args.crf || '14',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'grain',
    '-x264-params', 'keyint=60:min-keyint=30',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
    ...(args.audio ? ['-c:a', 'aac', '-b:a', '320k', '-shortest'] : []),
    '-movflags', '+faststart',
    args.video,
  ];
  ff = spawn('ffmpeg', vargs, { stdio: ['pipe', 'inherit', 'inherit'] });
}
if (args.out) fs.mkdirSync(args.out, { recursive: true });
const pending = [];
// frames can arrive out of order from parallel workers; feed ffmpeg strictly in order
const order = frames.slice();
let nextIdx = 0;
const held = new Map();
async function flush() {
  while (nextIdx < order.length && held.has(order[nextIdx])) {
    const raw = held.get(order[nextIdx]);
    held.delete(order[nextIdx]);
    nextIdx++;
    if (ff && !ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once('drain', r));
  }
}
let flushing = Promise.resolve();
onFrame = async (f, raw) => {
  if (args.out) pending.push(writePNG(path.join(args.out, `f${String(f).padStart(4, '0')}.png`), raw));
  if (ff) {
    held.set(f, raw);
    flushing = flushing.then(flush);
    await flushing;
  }
};

const tStart = Date.now();
let rMs = 0, done = 0;
const queue = frames.slice();
async function worker(page) {
  while (queue.length) {
    const f = queue.shift();
    const a = Date.now();
    const r = await page.evaluate(([f, o]) => window.reel.render(f, o), [f, { mb, shutter }]);
    await page.evaluate((f) => window.reel.capture(f), f);
    rMs += Date.now() - a;
    done++;
    if (args.profile) console.log(f, r.sec, 'mb', r.mb, JSON.stringify(Object.fromEntries(Object.entries(r.prof).map(([k, v]) => [k, Math.round(v)]))));
    if (done % 30 === 0 || done === frames.length)
      console.log(`frame ${f} [${r.sec}] mb ${r.mb} ${done}/${frames.length}  avg ${(rMs / done).toFixed(0)}ms/frame/worker  elapsed ${((Date.now() - tStart) / 1000).toFixed(0)}s`);
  }
}
await Promise.all(pages.map(worker));
await Promise.all(pending);
if (ff) {
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
}
console.log(`done ${frames.length} frames in ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
for (const b of browsers) await b.close();
server.close();
