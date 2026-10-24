// Ayar sağlık raporu: her taktik ayarının her kademesi gerçekten bir şey değiştiriyor mu?
//
//   node saglik.js            # tüm ayarlar, kademe×rakip başına 40 maç
//   node saglik.js --n 20     # daha hızlı, daha gürültülü
//   node saglik.js --only press,line
//
// Her ayar için üç test:
//  A. Mekanizma: ayarın doğrudan etkilediği ölçüm, her kademede bir öncekinden
//     beklenen yönde ve gürültüden (2 standart hata) büyük şekilde değişmeli.
//  B. Bedel: ayarı uca çekmenin beklenen bir bedeli olmalı (en düşük → en yüksek kademe).
//  C. Takas: ayar bir rakibe karşı işe yarayıp başka bir rakibe karşı zarar vermeli.
//     Puan çok gürültülü olduğu için xG farkıyla ölçülür (en yüksek - en düşük kademe).
//     Hep işe yarayan ayar bir meta, hep zarar veren ayar bir tuzaktır.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const E = require('./engine.js');

// Her ayarın mekanizma ölçümü ve bedeli. dir: +1 kademe artınca artmalı, -1 azalmalı.
const CHECKS = {
  mentality: { mech: ['up', 'Hücumda rakip yarı sahadaki oyuncu', +1], cost: ['xa', 'Yenen xG', +1] },
  line: { mech: ['line', 'Savunurken son savunmacının kaleye uzaklığı (m)', +1], cost: ['oppThr', 'Rakibin tamamladığı ara pas', +1] },
  press: { mech: ['oppPossDur', 'Rakibin topla kalma süresi, atak başına (sn)', -1], cost: ['energy', 'Maç sonu kondisyon (%)', -1] },
  width: { mech: ['width', 'Hücumda takım genişliği (m)', +1], cost: ['passPct', 'Pas isabeti (%)', -1] },
  direct: { mech: ['passLen', 'Ortalama pas uzunluğu (m)', +1], cost: ['passPct', 'Pas isabeti (%)', -1] },
  tempo: { mech: ['hold', 'Topun oyuncuda kalma süresi (sn)', -1], cost: ['passPct', 'Pas isabeti (%)', -1] },
};

function play(j) {
  const flip = j.seed % 2 === 1;
  const me = Object.assign({}, E.PRESETS[j.base], { [j.key]: j.v }), opp = Object.assign({}, E.PRESETS[j.opp]);
  const m = new E.Match({ cfg: j.cfg, seed: j.seed, home: { tactic: flip ? opp : me }, away: { tactic: flip ? me : opp } });
  m.simulate();
  const Tm = m.teams[flip ? 1 : 0], a = Tm.stats, b = m.teams[flip ? 0 : 1].stats;
  return { key: j.key, v: j.v, opp: j.opp,
    pts: a.goals > b.goals ? 3 : a.goals === b.goals ? 1 : 0, xgd: a.xg - b.xg, xa: b.xg,
    up: a.upSum / (a.atkN || 1), line: a.lineSum / (a.lineN || 1), width: a.widthSum / (a.atkN || 1),
    passLen: a.passLen / (a.passAtt || 1), hold: a.holdSum / (a.holdN || 1), passPct: 100 * a.passCmp / (a.passAtt || 1),
    winHigh: a.winOpp, oppPossDur: b.poss / Math.max(1, b.possN), energy: 100 * E.avgEnergy(Tm), oppThr: b.thrCmp };
}

if (!isMainThread) {
  parentPort.postMessage(workerData.map(play));
} else {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  const N = +opt('n', 40), base = opt('base', 'Dengeli');
  const keys = opt('only', E.TACTIC_KEYS.join(',')).split(',');
  const opps = Object.keys(E.PRESETS);
  const jobs = [];
  for (const key of keys) for (const v of E.LEVELS) for (const o of opps) for (let s = 0; s < N; s++)
    jobs.push({ key, v, opp: o, base, seed: 20000 + s });
  const cfg = require('./ayar.js').parseSet(args); jobs.forEach(j => { j.cfg = cfg; });
  const cpu = os.cpus().length, chunks = Array.from({ length: cpu }, () => []);
  jobs.forEach((j, i) => chunks[i % cpu].push(j));
  const t0 = Date.now();
  Promise.all(chunks.map(c => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: c }); w.on('message', res); w.on('error', rej); })))
    .then(parts => {
      const res = parts.flat();
      const stat = (rows, f) => { const n = rows.length, m = rows.reduce((s, r) => s + f(r), 0) / n;
        const sd = Math.sqrt(rows.reduce((s, r) => s + (f(r) - m) ** 2, 0) / Math.max(1, n - 1)); return { m, se: sd / Math.sqrt(n) }; };
      const NAMES = ['Çok düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok yüksek'];
      console.log(`\nAYAR SAĞLIK RAPORU · temel plan: ${base} · ${res.length} maç · ${((Date.now() - t0) / 1000).toFixed(0)} sn · kademe×rakip başına ${N} maç\n`);
      const summary = [];
      for (const key of keys) {
        const c = CHECKS[key], R = res.filter(r => r.key === key);
        const lv = E.LEVELS.map(v => R.filter(r => r.v === v));
        console.log(`■ ${key.toUpperCase()}`);
        // A. Mekanizma
        const [mk, mname, mdir] = c.mech;
        const ms = lv.map(rows => stat(rows, r => r[mk]));
        let mOk = 0;
        const steps = [];
        for (let i = 1; i < 5; i++) {
          const d = ms[i].m - ms[i - 1].m, se = Math.sqrt(ms[i].se ** 2 + ms[i - 1].se ** 2);
          const ok = d * mdir > 2 * se; if (ok) mOk++;
          steps.push(`${ok ? '✓' : '✗'} ${(d >= 0 ? '+' : '') + d.toFixed(2)}`);
        }
        console.log(`  A. Mekanizma — ${mname}: ${ms.map(x => x.m.toFixed(2)).join(' → ')}`);
        console.log(`     kademe adımları: ${steps.join('   ')}   ${mOk === 4 ? 'GEÇTİ' : 'KALDI (' + (4 - mOk) + ' adım hissedilmiyor)'}`);
        // B. Bedel
        const [ck, cname, cdir] = c.cost;
        const c0 = stat(lv[0], r => r[ck]), c4 = stat(lv[4], r => r[ck]);
        const cd = c4.m - c0.m, cOk = cd * cdir > 2 * Math.sqrt(c0.se ** 2 + c4.se ** 2);
        console.log(`  B. Bedel — ${cname}: ${c0.m.toFixed(2)} → ${c4.m.toFixed(2)}   ${cOk ? 'GEÇTİ' : 'KALDI'}`);
        // C. Takas: rakibe göre xG farkı değişimi (en yüksek - en düşük kademe)
        const sl = opps.map(o => {
          const lo = stat(lv[0].filter(r => r.opp === o), r => r.xgd), hi = stat(lv[4].filter(r => r.opp === o), r => r.xgd);
          return { o, d: hi.m - lo.m, se: Math.sqrt(lo.se ** 2 + hi.se ** 2) };
        });
        const pos = sl.filter(x => x.d > 2 * x.se), neg = sl.filter(x => x.d < -2 * x.se);
        const tOk = pos.length > 0 && neg.length > 0;
        const verdict = tOk ? 'GEÇTİ' : pos.length && !neg.length ? 'KALDI (hep işe yarıyor: meta riski)' : neg.length && !pos.length ? 'KALDI (hep zarar veriyor: tuzak)' : 'KALDI (hiçbir rakibe karşı belirgin etki yok)';
        console.log(`  C. Takas — xG farkı değişimi (çok yüksek − çok düşük): ${sl.map(x => `${x.o.slice(0, 8)} ${(x.d >= 0 ? '+' : '') + x.d.toFixed(2)}`).join(' · ')}   ${verdict}`);
        const pp = lv.map(rows => stat(rows, r => r.pts).m);
        console.log(`     puan/maç kademelere göre: ${pp.map((p, i) => NAMES[i] + ' ' + p.toFixed(2)).join(' · ')}\n`);
        summary.push(`${key.padEnd(10)} Mekanizma ${mOk === 4 ? '✓' : '✗ ' + mOk + '/4'}   Bedel ${cOk ? '✓' : '✗'}   Takas ${tOk ? '✓' : '✗'}`);
      }
      console.log('ÖZET'); summary.forEach(l => console.log('  ' + l));
    });
}
