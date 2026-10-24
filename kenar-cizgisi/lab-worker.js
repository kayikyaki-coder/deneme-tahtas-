// Laboratuvar işçisi: verilen taktiği verilen rakibe karşı durdurulana kadar oynatır.
// Her maçın sonucunu ana sayfaya gönderir. Ana sayfa işçiyi terminate() ile durdurur.
importScripts('engine.js');

function play(job, seed) {
  const E = self.Taktik;
  const m = new E.Match({ seed, home: { tactic: Object.assign({}, job.tac) }, away: { tactic: Object.assign({}, E.PRESETS[job.opp]) } });
  // Rakip menajer gerideyse devre arasında karşı taktiğe geçer (oyundaki gibi).
  m.simulate(mm => {
    const s = mm.teams.map(T => T.stats);
    if (s[1].goals < s[0].goals) mm.setTactic(1, Object.assign({}, E.PRESETS[E.counterTactic(job.tac)]));
  });
  const [a, b] = m.teams.map(T => T.stats);
  return { gf: a.goals, ga: b.goals, sf: a.shots, sa: b.shots, xf: a.xg, xa: b.xg };
}

self.onmessage = e => {
  const job = e.data;
  let seed = job.seedBase;
  for (;;) {
    self.postMessage(play(job, seed));
    seed += job.stride;
  }
};
