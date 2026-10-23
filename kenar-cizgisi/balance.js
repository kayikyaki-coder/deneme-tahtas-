// Denge testi: hazır taktikleri kendi aralarında çok sayıda maçta karşılaştırır.
// Kullanım: node balance.js [maç_sayısı_eşleşme_başına] [--random N]
// Tüm oyuncular aynı yetenekte olduğundan sonuç farkı sadece taktikten gelir.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const E = require('./engine.js');

function play(job) {
  const m = new E.Match({ seed: job.seed, home: { tactic: job.a }, away: { tactic: job.b } });
  m.simulate();
  const [h, a] = m.teams.map(T => T.stats);
  return { i: job.i, j: job.j, hg: h.goals, ag: a.goals, hs: h.shots, as: a.shots, hp: h.poss, ap: a.poss, he: h.energy, ae: a.energy, hx: h.xg, ax: a.xg };
}

function runJobs(jobs) {
  const cpu = Math.max(1, os.cpus().length);
  const chunks = Array.from({ length: cpu }, () => []);
  jobs.forEach((j, k) => chunks[k % cpu].push(j));
  return Promise.all(chunks.map(c => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { jobs: c } });
    w.on('message', res); w.on('error', rej);
  }))).then(p => p.flat());
}

// Havuz modu: herkes herkesle oynar. Her taktik için en iyi karşı taktiği bulunur.
// "Meta yok" = her taktiğin, ona karşı belirgin şekilde kazanan bir karşı taktiği vardır.
function poolMode(R, N) {
  const pool = Object.keys(E.PRESETS).map(n => ({ name: n, tac: E.PRESETS[n] }));
  const rnd = E.mulberry32(777), forms = Object.keys(E.FORMATIONS);
  for (let r = 0; r < R; r++) {
    const t = { formation: forms[(rnd() * forms.length) | 0] };
    for (const k of E.TACTIC_KEYS) t[k] = Math.round(rnd() * 10) / 10;
    pool.push({ name: 'R' + r, tac: t });
  }
  const P = pool.length, jobs = [];
  let seed = 1;
  for (let i = 0; i < P; i++) for (let j = i + 1; j < P; j++) for (let s = 0; s < N; s++)
    jobs.push(s % 2 ? { i: j, j: i, a: pool[j].tac, b: pool[i].tac, seed: seed++ } : { i, j, a: pool[i].tac, b: pool[j].tac, seed: seed++ });
  const t0 = Date.now();
  runJobs(jobs).then(res => {
    const pts = Array.from({ length: P }, () => new Array(P).fill(0)), n = Array.from({ length: P }, () => new Array(P).fill(0));
    for (const r of res) {
      const a = r.hg > r.ag ? 3 : r.hg === r.ag ? 1 : 0, b = r.hg < r.ag ? 3 : r.hg === r.ag ? 1 : 0;
      pts[r.i][r.j] += a; n[r.i][r.j]++; pts[r.j][r.i] += b; n[r.j][r.i]++;
    }
    const ppg = (i, j) => pts[i][j] / n[i][j];
    const rows = pool.map((p, i) => {
      let tot = 0, cnt = 0, best = -1, bv = -1;
      for (let j = 0; j < P; j++) if (j !== i) { tot += ppg(i, j); cnt++; if (ppg(j, i) > bv) { bv = ppg(j, i); best = j; } }
      return { i, name: p.name, avg: tot / cnt, counter: pool[best].name, cv: bv };
    }).sort((a, b) => b.avg - a.avg);
    console.log(`\n${res.length} maç, ${((Date.now() - t0) / 1000).toFixed(1)} sn. ${P} taktik, eşleşme başına ${N} maç.\n`);
    console.log('Taktik  Ort.puan  En iyi karşı taktik (ona karşı puan/maç)');
    for (const r of rows) console.log(`${r.name.padEnd(16)} ${r.avg.toFixed(2)}     ${r.counter.padEnd(16)} ${r.cv.toFixed(2)}`);
    const top = rows[0];
    console.log(`\nZirvedeki taktik: ${top.name} ${JSON.stringify(pool[top.i].tac)}`);
    console.log(`Ona karşı 1.5+ puan/maç alan taktik sayısı: ${pool.filter((p, j) => j !== top.i && ppg(j, top.i) >= 1.5).length} / ${P - 1}`);
  });
}

if (!isMainThread) {
  parentPort.postMessage(workerData.jobs.map(play));
} else {
  const args = process.argv.slice(2);
  const N = +args[0] || 40;
  const ri = args.indexOf('--random');
  const R = ri >= 0 ? +args[ri + 1] || 30 : 0;
  const names = Object.keys(E.PRESETS);
  const pool = names.map(n => ({ name: n, tac: E.PRESETS[n] }));
  const rnd = E.mulberry32(12345);
  const forms = Object.keys(E.FORMATIONS);
  for (let r = 0; r < R; r++) {
    const t = { formation: forms[(rnd() * forms.length) | 0] };
    for (const k of E.TACTIC_KEYS) t[k] = Math.round(rnd() * 10) / 10;
    pool.push({ name: 'R' + r, tac: t, random: true });
  }
  const pi = args.indexOf('--pool');
  if (pi >= 0) return poolMode(+args[pi + 1] || 19, N);
  const jobs = [];
  let seed = 1;
  for (let i = 0; i < pool.length; i++) for (let j = 0; j < names.length; j++) {
    if (i === j || (i < names.length && j < i)) continue;
    const n = pool[i].random ? Math.ceil(N / 2) : N;
    for (let s = 0; s < n; s++) {
      const flip = s % 2 === 1;
      jobs.push(flip ? { i: j, j: i, a: pool[j].tac, b: pool[i].tac, seed: seed++ } : { i, j, a: pool[i].tac, b: pool[j].tac, seed: seed++ });
    }
  }
  const cpu = Math.max(1, os.cpus().length);
  const chunks = Array.from({ length: cpu }, () => []);
  jobs.forEach((j, k) => chunks[k % cpu].push(j));
  const t0 = Date.now();
  Promise.all(chunks.map(c => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { jobs: c } });
    w.on('message', res); w.on('error', rej);
  }))).then(parts => {
    const res = parts.flat();
    const P = pool.length;
    const rec = Array.from({ length: P }, () => Array.from({ length: P }, () => ({ w: 0, d: 0, l: 0, gf: 0, ga: 0, n: 0 })));
    const tot = Array.from({ length: P }, () => ({ pts: 0, n: 0, gf: 0, ga: 0, poss: 0, en: 0, sh: 0 }));
    for (const r of res) {
      const add = (x, y, gf, ga, poss, en, sh) => {
        const c = rec[x][y]; c.n++; c.gf += gf; c.ga += ga;
        if (gf > ga) c.w++; else if (gf === ga) c.d++; else c.l++;
        const t = tot[x]; t.n++; t.pts += gf > ga ? 3 : gf === ga ? 1 : 0; t.gf += gf; t.ga += ga; t.poss += poss; t.en += en; t.sh += sh;
      };
      const pt = r.hp + r.ap;
      add(r.i, r.j, r.hg, r.ag, r.hp / pt, r.he, r.hs);
      add(r.j, r.i, r.ag, r.hg, r.ap / pt, r.ae, r.as);
    }
    const pad = (s, n) => String(s).padEnd(n);
    console.log(`\n${res.length} maç, ${((Date.now() - t0) / 1000).toFixed(1)} sn\n`);
    console.log('Satır takımının sütun takımına karşı galibiyet-beraberlik-mağlubiyet yüzdesi:\n');
    console.log(pad('', 17) + names.map(n => pad(n.slice(0, 14), 16)).join(''));
    for (let i = 0; i < names.length; i++) {
      let line = pad(names[i], 17);
      for (let j = 0; j < names.length; j++) {
        const c = rec[i][j];
        line += pad(i === j ? '—' : `${Math.round(c.w / c.n * 100)}-${Math.round(c.d / c.n * 100)}-${Math.round(c.l / c.n * 100)}`, 16);
      }
      console.log(line);
    }
    console.log('\nTaktik            Puan/maç  Gol(A-Y)   Topla oynama  Şut   Son kondisyon');
    for (let i = 0; i < names.length; i++) {
      const t = tot[i];
      console.log(`${pad(names[i], 18)}${pad((t.pts / t.n).toFixed(2), 10)}${pad((t.gf / t.n).toFixed(2) + '-' + (t.ga / t.n).toFixed(2), 11)}${pad(Math.round(t.poss / t.n * 100) + '%', 14)}${pad((t.sh / t.n).toFixed(1), 6)}${Math.round(t.en / t.n * 100)}%`);
    }
    if (R) {
      const rs = pool.map((p, i) => ({ p, t: tot[i] })).filter(x => x.p.random).sort((a, b) => b.t.pts / b.t.n - a.t.pts / a.t.n);
      console.log(`\nRastgele ${R} taktiğin hazır taktiklere karşı puan/maç dağılımı (en iyi 5 / en kötü 3):`);
      const show = x => console.log(`  ${pad(x.p.name, 5)}${pad((x.t.pts / x.t.n).toFixed(2), 6)} ${JSON.stringify(x.p.tac)}`);
      rs.slice(0, 5).forEach(show); console.log('  ...'); rs.slice(-3).forEach(show);
      // Her ayarın puanla korelasyonu: tek bir ayarın "hep yüksek = iyi" olmaması gerekir.
      console.log('\nAyar ↔ puan korelasyonu (rastgele taktikler; |r| küçük olmalı):');
      for (const k of E.TACTIC_KEYS) {
        const xs = rs.map(x => x.p.tac[k]), ys = rs.map(x => x.t.pts / x.t.n);
        const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
        let sxy = 0, sxx = 0, syy = 0;
        for (let q = 0; q < xs.length; q++) { sxy += (xs[q] - mx) * (ys[q] - my); sxx += (xs[q] - mx) ** 2; syy += (ys[q] - my) ** 2; }
        const bucket = (lo, hi) => { const v = rs.filter(x => x.p.tac[k] >= lo && x.p.tac[k] <= hi).map(x => x.t.pts / x.t.n); return v.length ? (v.reduce((a, b) => a + b) / v.length).toFixed(2) : ' -  '; };
        console.log(`  ${pad(k, 10)} r = ${pad((sxy / Math.sqrt(sxx * syy)).toFixed(2), 6)} puan/maç  düşük ${bucket(0, 0.3)}  orta ${bucket(0.31, 0.69)}  yüksek ${bucket(0.7, 1)}`);
      }
    }
  });
}
