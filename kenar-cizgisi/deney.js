// Ayar deneyi: tek bir taktik ayarını tarar, her değeri rakiplere karşı oynatır.
// Sonucun yanında mekanizmayı da ölçer (top nerede kazanılıyor, kondisyon, faul...).
//
// Kullanım:
//   node deney.js press                       # Dengeli'nin presini 0..1 taradır, tüm hazır planlara karşı
//   node deney.js press --base Gegenpress --n 60 --values 0,0.3,0.6,0.9
//   node deney.js line --vs "Otobüs & Kontra,Tiki-Taka"
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const E = require('./engine.js');

function play(j) {
  const flip = j.seed % 2 === 1; // taraf avantajı olmasın diye ev/deplasman değişir
  const me = Object.assign({}, j.tac), opp = Object.assign({}, E.PRESETS[j.opp]);
  const m = new E.Match({ seed: j.seed, home: { tactic: flip ? opp : me }, away: { tactic: flip ? me : opp } });
  m.simulate();
  const a = m.teams[flip ? 1 : 0].stats, b = m.teams[flip ? 0 : 1].stats;
  const myE = E.avgEnergy(m.teams[flip ? 1 : 0]);
  return { v: j.v, opp: j.opp, gf: a.goals, ga: b.goals, xf: a.xg, xa: b.xg, sf: a.shots, sa: b.shots,
    // Rakibin kendi üçte birinde kaybettiği top = bizim rakip kale önünde kazandığımız top
    winFin: b.lossOwn, winMid: b.lossMid, winOwn: b.lossFin,
    oppPass: b.passAtt ? b.passCmp / b.passAtt : 0, oppThr: b.thrCmp, fouls: a.fouls, energy: myE,
    poss: a.poss / (a.poss + b.poss) };
}

if (!isMainThread) {
  parentPort.postMessage(workerData.map(play));
} else {
  const args = process.argv.slice(2);
  const key = args[0];
  if (!E.TACTIC_KEYS.includes(key)) { console.log('Ayar adı: ' + E.TACTIC_KEYS.join(', ')); process.exit(1); }
  const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
  const base = opt('base', 'Dengeli');
  const N = +opt('n', 40);
  const values = opt('values', '0,0.25,0.5,0.75,1').split(',').map(Number);
  const opps = opt('vs', Object.keys(E.PRESETS).join(',')).split(',');
  const jobs = [];
  for (const v of values) for (const o of opps) for (let s = 0; s < N; s++)
    jobs.push({ v, opp: o, seed: 10000 + s, tac: Object.assign({}, E.PRESETS[base], { [key]: v }) });
  const cpu = os.cpus().length, chunks = Array.from({ length: cpu }, () => []);
  jobs.forEach((j, i) => chunks[i % cpu].push(j));
  const t0 = Date.now();
  Promise.all(chunks.map(c => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: c }); w.on('message', res); w.on('error', rej); })))
    .then(parts => {
      const res = parts.flat();
      const agg = (rows, f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
      const pts = r => (r.gf > r.ga ? 3 : r.gf === r.ga ? 1 : 0);
      console.log(`\n${base} planında "${key}" taranıyor. ${res.length} maç, ${((Date.now() - t0) / 1000).toFixed(0)} sn, değer×rakip başına ${N} maç.\n`);
      console.log('MEKANİZMA (tüm rakiplerin ortalaması)');
      console.log('değer  rakip-kale-önü  orta-saha  kendi-yarı   rakip-pas%  arkaya-yenen   faul   son-kondisyon  topla-oynama');
      console.log('       top kazanma     kazanma    kazanma                  ara-pas');
      for (const v of values) {
        const r = res.filter(x => x.v === v);
        console.log(`${String(v).padEnd(7)}${agg(r, x => x.winFin).toFixed(1).padEnd(16)}${agg(r, x => x.winMid).toFixed(1).padEnd(11)}${agg(r, x => x.winOwn).toFixed(1).padEnd(13)}${(agg(r, x => x.oppPass) * 100).toFixed(0).padEnd(12)}${agg(r, x => x.oppThr).toFixed(1).padEnd(15)}${agg(r, x => x.fouls).toFixed(1).padEnd(7)}${(agg(r, x => x.energy) * 100).toFixed(0).padEnd(15)}%${(agg(r, x => x.poss) * 100).toFixed(0)}`);
      }
      console.log('\nSONUÇ: puan/maç (gol atılan-yenen), rakibe göre');
      console.log('değer  ' + opps.map(o => o.slice(0, 15).padEnd(18)).join('') + 'ORTALAMA');
      for (const v of values) {
        let line = String(v).padEnd(7);
        for (const o of opps) { const r = res.filter(x => x.v === v && x.opp === o); line += `${agg(r, pts).toFixed(2)} (${agg(r, x => x.gf).toFixed(1)}-${agg(r, x => x.ga).toFixed(1)})`.padEnd(18); }
        const r = res.filter(x => x.v === v);
        const p = agg(r, pts), sd = Math.sqrt(agg(r, x => pts(x) ** 2) - p * p);
        console.log(line + `${p.toFixed(2)} ± ${(1.96 * sd / Math.sqrt(r.length)).toFixed(2)}`);
      }
      console.log('\n± : %95 güven aralığı. Rakip sütunlarında belirsizlik yaklaşık ±' + (1.96 * 1.2 / Math.sqrt(N)).toFixed(2) + ' puan.');
    });
}
