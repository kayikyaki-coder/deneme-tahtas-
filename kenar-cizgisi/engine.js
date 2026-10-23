// Kenar Çizgisi — taktik odaklı futbol menajerliği simülasyon motoru.
// Tarayıcıda window.Taktik, Node'da require('./engine.js') olarak çalışır.
//
// Temel fikir: hiçbir taktiğin "gizli bonusu" yok. Taktik ayarları sadece
// oyuncuların NEREDE durduğunu ve NASIL karar verdiğini değiştirir; sonuçlar
// fizikten (top hızı, koşu mesafesi, kondisyon, ofsayt, pas koridorları) doğar.
// Bu yüzden her ayarın gerçek bir bedeli vardır.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Taktik = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Sabitler (metre / saniye) ----
  const L = 80, W = 50, GOAL_W = 7, DT = 1 / 30;
  const K = 0.8;           // top sürtünmesi: hız mesafeyle doğrusal azalır, v(s) = v0 - K*s
  const REACH = 0.95;      // oyuncunun topa ulaşma yarıçapı
  const GY0 = W / 2 - GOAL_W / 2, GY1 = W / 2 + GOAL_W / 2;
  const BOX_D = 14, BOX_HW = 15;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Dizilişler (kaleci + 6 oyuncu). l: hat (0 savunma, 1 orta, 2 forvet), y: 0..1 genişlik ----
  const FORMATIONS = {
    '2-3-1': [{ r: 'DEF', l: 0, y: 0.3 }, { r: 'DEF', l: 0, y: 0.7 }, { r: 'MID', l: 1, y: 0.12 }, { r: 'MID', l: 0.9, y: 0.5 }, { r: 'MID', l: 1, y: 0.88 }, { r: 'FWD', l: 2, y: 0.5 }],
    '3-2-1': [{ r: 'DEF', l: 0, y: 0.2 }, { r: 'DEF', l: 0, y: 0.5 }, { r: 'DEF', l: 0, y: 0.8 }, { r: 'MID', l: 1, y: 0.33 }, { r: 'MID', l: 1, y: 0.67 }, { r: 'FWD', l: 2, y: 0.5 }],
    '2-2-2': [{ r: 'DEF', l: 0, y: 0.3 }, { r: 'DEF', l: 0, y: 0.7 }, { r: 'MID', l: 0.9, y: 0.32 }, { r: 'MID', l: 0.9, y: 0.68 }, { r: 'FWD', l: 2, y: 0.3 }, { r: 'FWD', l: 2, y: 0.7 }],
    '3-1-2': [{ r: 'DEF', l: 0, y: 0.2 }, { r: 'DEF', l: 0, y: 0.5 }, { r: 'DEF', l: 0, y: 0.8 }, { r: 'MID', l: 0.8, y: 0.5 }, { r: 'FWD', l: 2, y: 0.33 }, { r: 'FWD', l: 2, y: 0.67 }],
    '2-1-2-1': [{ r: 'DEF', l: 0, y: 0.3 }, { r: 'DEF', l: 0, y: 0.7 }, { r: 'MID', l: 0.7, y: 0.5 }, { r: 'MID', l: 1.3, y: 0.22 }, { r: 'MID', l: 1.3, y: 0.78 }, { r: 'FWD', l: 2, y: 0.5 }],
  };

  // Taktik ayarları 0..1 arası.
  //  mentality: oyuncuların hücumda ne kadar öne çıktığı
  //  line:      savunma hattı yüksekliği (yüksek = alan daralır ama arkası boşalır)
  //  press:     pres yoğunluğu ve başladığı bölge (yüksek = top kazanır ama yorar ve boşluk bırakır)
  //  width:     hücumda genişlik
  //  direct:    pas tarzı (0 kısa/güvenli ... 1 uzun/riskli/havadan)
  //  tempo:     karar hızı (yüksek = hızlı ama aceleci, düşük = sabırlı ama presle sıkışır)
  const PRESETS = {
    'Dengeli': { formation: '2-3-1', mentality: 0.5, line: 0.5, press: 0.5, width: 0.5, direct: 0.5, tempo: 0.5 },
    'Gegenpress': { formation: '2-3-1', mentality: 0.65, line: 0.85, press: 0.92, width: 0.5, direct: 0.45, tempo: 0.85 },
    'Tiki-Taka': { formation: '3-2-1', mentality: 0.65, line: 0.75, press: 0.7, width: 0.9, direct: 0.3, tempo: 0.6 },
    'Otobüs & Kontra': { formation: '3-1-2', mentality: 0.25, line: 0.1, press: 0.15, width: 0.4, direct: 0.85, tempo: 0.8 },
    'Kanat Oyunu': { formation: '2-2-2', mentality: 0.55, line: 0.45, press: 0.4, width: 0.95, direct: 0.6, tempo: 0.6 },
  };

  const TACTIC_KEYS = ['mentality', 'line', 'press', 'width', 'direct', 'tempo'];

  // ---- Şut/değer modeli (takımın kendi koordinatında, rakip kale x = L) ----
  function xgRaw(lx, ly) {
    const dx = L - lx;
    if (dx <= 0.2) return 0.003;
    const a = Math.abs(Math.atan2(GY1 - ly, dx) - Math.atan2(GY0 - ly, dx));
    return clamp(0.5 * a * a, 0.003, 0.5);
  }
  // Bir noktada topa sahip olmanın değeri ~ yakın gelecekte gol olma olasılığı.
  function value(lx, ly) {
    const t = clamp(lx / L, 0, 1);
    return 0.6 * xgRaw(lx, ly) + 0.06 * t * t;
  }
  function timeAt(v0, s) {
    const q = 1 - (K * s) / v0;
    return q <= 0.02 ? 99 : -Math.log(q) / K;
  }
  function interceptProb(sp) {
    return sp < 11 ? 0.92 : clamp(0.92 - (sp - 11) / 11, 0.1, 0.92);
  }

  function makeSquad(base, spread, rng) {
    const r = rng || Math.random;
    const a = () => clamp(base + (r() - 0.5) * 2 * (spread || 0), 0.05, 1);
    const sq = [];
    for (let i = 0; i < 7; i++) sq.push({ pace: a(), pass: a(), shoot: a(), tackle: a(), tech: a(), stamina: a(), gk: a() });
    return sq;
  }

  function newStats() {
    return { goals: 0, shots: 0, onTarget: 0, xg: 0, poss: 0, passAtt: 0, passCmp: 0, thrAtt: 0, thrCmp: 0, lofted: 0, crosses: 0, headers: 0,
      lossOwn: 0, lossMid: 0, lossFin: 0, offsides: 0, tackles: 0, tacklesWon: 0, fouls: 0, saves: 0, energy: 1, highWins: 0 };
  }

  const NUMS = [1, 4, 5, 8, 6, 10, 9];

  class Match {
    constructor(o) {
      o = o || {};
      this.rng = mulberry32(o.seed != null ? o.seed : (Math.random() * 1e9) | 0);
      this.halfLen = o.halfLen || 300;
      this.teams = [this.mkTeam(0, o.home || {}), this.mkTeam(1, o.away || {})];
      this.all = this.teams[0].players.concat(this.teams[1].players);
      this.ball = { x: L / 2, y: W / 2, vx: 0, vy: 0, owner: null, lastTeam: 0, air: 0, type: 'loose', kicker: null, offside: null,
        tried: new Map(), flight: 0, through: false, landed: 0 };
      this.t = 0; this.half = 1; this.state = 'play';
      this.events = []; this.possTeam = 0; this.icpt = [null, null];
      this.kickoff(0);
    }

    mkTeam(idx, d) {
      const tactic = Object.assign({}, PRESETS['Dengeli'], d.tactic || {});
      const squad = d.squad || makeSquad(0.6, 0);
      const T = { idx, side: idx, name: d.name || (idx ? 'Deplasman' : 'Ev Sahibi'), color: d.color || (idx ? '#3d7bd9' : '#e0483e'),
        tactic, players: [], stats: newStats() };
      this.setFormation(T, tactic.formation, squad);
      return T;
    }

    setFormation(T, f, squad) {
      const slots = [{ r: 'GK', l: -1, y: 0.5 }].concat(FORMATIONS[f] || FORMATIONS['2-3-1']);
      if (!T.players.length) {
        slots.forEach((s, i) => T.players.push({ id: T.idx * 10 + i, team: T.idx, num: NUMS[i], slot: s, role: s.r, attrs: squad[i],
          x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, sprint: 0.7, energy: 1, stun: 0, protect: 0, cool: 0, decT: 0,
          intent: null, aggr: 0, chase: false, press: false, forceShot: false, noOffside: false, seekT: 0, run: 0, offX: 0, offY: 0, runT: 0, runX: 0, runY: 0 }));
      } else {
        T.players.forEach((p, i) => { p.slot = slots[i]; p.role = slots[i].r; });
      }
      T.tactic.formation = f;
    }

    // Taktik maç sırasında değiştirilebilir.
    setTactic(idx, tac) {
      const T = this.teams[idx];
      const f = tac.formation || T.tactic.formation;
      const changed = f !== T.tactic.formation;
      Object.assign(T.tactic, tac);
      if (changed) this.setFormation(T, f);
    }

    // Takım koordinatı <-> dünya koordinatı (180° dönme, kendi içinde tersi)
    loc(T, x, y) { return T.side === 0 ? { x, y } : { x: L - x, y: W - y }; }
    locV(T, vx, vy) { return T.side === 0 ? { x: vx, y: vy } : { x: -vx, y: -vy }; }

    maxSpeed(p) {
      return (5.4 + 2.6 * p.attrs.pace) * (0.68 + 0.32 * p.energy) * (p.stun > 0 ? 0.3 : 1);
    }

    event(type, team, text) { this.events.push({ t: this.t, min: this.minute(), type, team, text }); }
    minute() { return Math.min(90, Math.floor((this.t / (2 * this.halfLen)) * 90) + 1); }

    // ---------------- Ana döngü ----------------
    step() {
      if (this.state !== 'play') return;
      const dt = DT;
      for (const p of this.all) {
        p.seekT -= dt;
        if (p.runT > 0) p.runT -= dt;
        if (p.stun > 0) p.stun -= dt;
        if (p.protect > 0) p.protect -= dt;
        if (p.cool > 0) p.cool -= dt;
      }
      const b = this.ball;
      if (!b.owner) { this.icpt[0] = this.bestInterceptor(this.teams[0]); this.icpt[1] = this.bestInterceptor(this.teams[1]); }
      this.think(this.teams[0]);
      this.think(this.teams[1]);
      if (b.owner) {
        b.owner.decT -= dt;
        if (b.owner.decT <= 0) this.decide(b.owner);
      }
      for (const p of this.all) this.move(p, dt);
      this.collide();
      this.tackles(dt);
      this.updateBall(dt);
      this.teams[this.possTeam].stats.poss += dt;

      this.t += dt;
      if (this.half === 1 && this.t >= this.halfLen) {
        this.half = 2; this.state = 'halftime';
        for (const p of this.all) p.energy = Math.min(1, p.energy + 0.18);
        this.event('half', -1, 'Devre arası');
        this.kickoff(1);
      } else if (this.half === 2 && this.t >= 2 * this.halfLen) {
        this.state = 'ended';
        for (const T of this.teams) T.stats.energy = T.players.reduce((s, p) => s + p.energy, 0) / T.players.length;
        this.event('end', -1, 'Maç sona erdi');
      }
    }

    resume() { if (this.state === 'halftime') this.state = 'play'; }

    // Görüntüsüz tam maç; onHalftime(match) devre arasında çağrılır (yapay zekâ menajer taktik değiştirebilir).
    simulate(onHalftime) {
      while (this.state !== 'ended') {
        if (this.state === 'halftime') { if (onHalftime) onHalftime(this); this.state = 'play'; }
        this.step();
      }
      return this;
    }

    // ---------------- Takım zekâsı ----------------
    bestInterceptor(T) {
      const b = this.ball;
      let best = null;
      let tLand = 0;
      const sp0 = hyp(b.vx, b.vy);
      if (b.air > 0 && sp0 > 0.5) tLand = timeAt(sp0, b.air);
      // Ara pası okumak zaman alır: savunmacılar topun arkalarına atıldığını geç fark eder.
      const lag = b.through && T.idx !== b.lastTeam ? Math.max(0, 0.25 - b.flight) : 0;
      for (const p of T.players) {
        if (p.stun > 0.25 || (p === b.kicker && p.cool > 0)) continue;
        const ms = this.maxSpeed(p);
        const isGK = p.role === 'GK';
        for (let i = 0; i <= 30; i++) {
          const t = i * 0.1;
          if (t < tLand && !isGK) continue;
          const f = (1 - Math.exp(-K * t)) / K;
          const x = clamp(b.x + b.vx * f, 0, L), y = clamp(b.y + b.vy * f, 0, W);
          const d = hyp(x - p.x, y - p.y) - REACH;
          if (d <= ms * Math.max(0, t - 0.12 - (isGK ? 0 : lag))) {
            if (isGK) {
              const q = this.loc(T, x, y);
              const zone = 15 + 12 * T.tactic.line;
              if (!(q.x < zone && Math.abs(q.y - W / 2) < 17) && !(b.type === 'shot' && b.lastTeam !== T.idx)) break;
            }
            if (!best || t < best.t) best = { p, t, x, y };
            break;
          }
        }
      }
      if (!best) {
        let bd = 1e9;
        const f = (1 - Math.exp(-K * 3)) / K;
        const x = clamp(b.x + b.vx * f, 0, L), y = clamp(b.y + b.vy * f, 0, W);
        for (const p of T.players) {
          if (p.role === 'GK') continue;
          const d = hyp(x - p.x, y - p.y);
          if (d < bd) { bd = d; best = { p, t: 3 + d / 7, x, y }; }
        }
      }
      return best;
    }

    think(T) {
      const O = this.teams[1 - T.idx], b = this.ball;
      const bl = this.loc(T, b.x, b.y);
      const owner = b.owner;
      const attacking = owner ? owner.team === T.idx : b.lastTeam === T.idx;
      for (const p of T.players) { p.chase = false; p.press = false; p.aggr = 0; }
      if (attacking) this.shapeAttack(T, O, bl, owner);
      else this.shapeDefend(T, O, bl, owner);
      // Orta havadayken: hücumcular düşüş noktasına koşar, savunmacılar en yakın adamla topa gider.
      if (!owner && b.cross && b.air > 0) {
        const near = T.players.filter(p => p.role !== 'GK' && p !== b.kicker)
          .sort((a, c) => hyp(a.x - b.crossX, a.y - b.crossY) - hyp(c.x - b.crossX, c.y - b.crossY))
          .slice(0, attacking ? 3 : 2);
        near.forEach((p, i) => { p.tx = b.crossX + (i - 1) * 1.6; p.ty = b.crossY + (i === 2 ? 1.5 : 0); p.sprint = 1; p.chase = true; });
        return;
      }
      if (!owner) {
        const mine = this.icpt[T.idx], theirs = this.icpt[1 - T.idx];
        if (mine) {
          // Savunan takım her pasın peşine düşmez: ancak topu önce kapabilecekse,
          // top kendi yarısındaysa ya da pres zonu içindeyse koşar.
          const pressZone = bl.x <= lerp(0.42, 1.05, T.tactic.press) * L;
          const go = attacking || !theirs || mine.t < theirs.t + 0.15 || bl.x < L * 0.33 || (pressZone && mine.t < theirs.t + 0.25);
          if (go) { const p = mine.p; p.tx = mine.x; p.ty = mine.y; p.sprint = 1; p.chase = true; }
        }
      }
    }

    secondLastX(T, O) {
      // T'nin koordinatında rakibin sondan ikinci oyuncusunun x'i (ofsayt çizgisi)
      let a = -1, c = -1;
      for (const o of O.players) {
        const x = this.loc(T, o.x, o.y).x;
        if (x > a) { c = a; a = x; } else if (x > c) c = x;
      }
      return c;
    }

    setT(T, p, lx, ly, sprint) {
      const w = this.loc(T, clamp(lx, 0.5, L - 0.5), clamp(ly, 0.8, W - 0.8));
      p.tx = w.x; p.ty = w.y; p.sprint = sprint;
    }

    gkSpot(T, bl, attacking) {
      const line = T.tactic.line;
      if (attacking) return { x: clamp(4 + line * 12 + (bl.x - L / 2) * 0.1, 2, 18), y: W / 2 + (bl.y - W / 2) * 0.15 };
      // Açı kapatma: kale merkezi ile top arasındaki çizgide, top yaklaştıkça öne çıkar.
      const dx = bl.x, dy = bl.y - W / 2, d = hyp(dx, dy) || 1;
      const out = bl.x > L * 0.5 ? 1.5 + line * 8 : clamp(d * 0.12, 0.8, 3.2) + line * 1;
      return { x: Math.max(0.6, (dx / d) * out), y: clamp(W / 2 + (dy / d) * out, GY0 - 1, GY1 + 1) };
    }

    shapeAttack(T, O, bl, owner) {
      const tac = T.tactic;
      const wid = lerp(0.5, 0.96, tac.width), ment = tac.mentality, dir = tac.direct;
      const offX = Math.max(this.secondLastX(T, O), bl.x, L / 2);
      const dShift = bl.x - 0.5 * L;
      for (const p of T.players) {
        if (p === owner) continue;
        if (p.role === 'GK') { const g = this.gkSpot(T, bl, true); this.setT(T, p, g.x, g.y, 0.6); continue; }
        if (p.runT > 0) { this.setT(T, p, Math.min(p.runX, offX - 0.5), p.runY, 1); continue; }
        const s = p.slot;
        // Hücumda takım boyu: savunma topu takip eder, forvet ileride kalıp sahayı uzatır.
        let x = (0.24 + 0.2 * s.l) * L + dShift * (dShift > 0 ? lerp(0.85, 0.6, s.l / 2) : lerp(0.6, 0.3, s.l / 2)) + (ment - 0.5) * 0.16 * L;
        if (s.r === 'FWD') x -= (1 - dir) * 2.5;
        const wing = Math.abs(s.y - 0.5) > 0.25;
        if (wing && s.r !== "DEF") x += (tac.width - 0.5) * 6;
        if (s.r === 'DEF') x = Math.min(x, bl.x + 2 + ment * 6);
        let y = W / 2 + (s.y - 0.5) * W * wid + (bl.y - W / 2) * 0.12;
        // Forvetler son savunmacının omzunda bekler; zaman zaman koşuyu erken başlatıp ofsayta düşer.
        const lim = s.r === 'FWD' ? offX - 0.8 + p.run : offX - 0.8;
        x = clamp(x, 4, lim);
        // Boş alan arama: mevkisinin çevresinde rakipten en uzak cebe kayar (sabırlı oyunda daha çok).
        if (p.seekT <= 0) {
          p.seekT = 0.5 + this.rng() * 0.4;
          p.run = s.r === 'FWD' ? (this.rng() < 0.25 + 0.35 * dir ? 0.8 + this.rng() * 2 : -this.rng() * 1.5) : 0;
          const R = lerp(5, 2.5, tac.tempo);
          let bx = 0, by = 0, bs = -1e9;
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2, rr = k === 0 ? 0 : R;
            const cx = clamp(x + Math.cos(a) * rr, 4, lim), cy = clamp(y + Math.sin(a) * rr, 2, W - 2);
            let md = 9;
            for (const o of O.players) { const q = this.loc(T, o.x, o.y); md = Math.min(md, hyp(q.x - cx, q.y - cy)); }
            const sc = md - 0.15 * hyp(cx - x, cy - y);
            if (sc > bs) { bs = sc; bx = cx - x; by = cy - y; }
          }
          p.offX = bx; p.offY = by;
        }
        this.setT(T, p, clamp(x + p.offX, 4, lim), y + p.offY, s.r === 'FWD' ? lerp(0.75, 1, tac.tempo) : 0.75);
      }
      if (!owner) return;
      // Topa yakın oyuncular pas açısı yaratır; kısa pas oynayan takımlarda daha fazla oyuncu topa gelir.
      const ol = this.loc(T, owner.x, owner.y);
      const ds = lerp(8, 15, dir);
      const k = dir < 0.4 ? 3 : 2;
      const cand = T.players.filter(p => p !== owner && p.role !== 'GK')
        .map(p => { const q = this.loc(T, p.tx, p.ty); return { p, q, d: hyp(q.x - ol.x, q.y - ol.y) }; })
        .sort((a, c) => a.d - c.d).slice(0, k);
      for (const c of cand) {
        if (c.d <= ds) continue;
        const ux = (c.q.x - ol.x) / c.d, uy = (c.q.y - ol.y) / c.d;
        this.setT(T, c.p, Math.min(ol.x + ux * ds, offX - 0.8), ol.y + uy * ds, 0.85);
      }
    }

    shapeDefend(T, O, bl, owner) {
      const tac = T.tactic, line = tac.line, press = tac.press;
      let defX = lerp(0.17, 0.44, line) * L + (bl.x - 0.5 * L) * lerp(0.12, 0.35, line);
      defX = clamp(Math.min(defX, bl.x - 2), 4, 0.6 * L);
      const gap = lerp(7.5, 9.5, line);
      const spread = lerp(0.46, 0.62, line);
      const opps = [];
      for (const o of O.players) { if (o.role === 'GK') continue; const q = this.loc(T, o.x, o.y); opps.push({ o, x: q.x, y: q.y }); }
      for (const p of T.players) {
        if (p.role === 'GK') { const g = this.gkSpot(T, bl, false); this.setT(T, p, g.x, g.y, 0.8); continue; }
        const s = p.slot;
        let x = defX + s.l * gap + (s.r === 'FWD' ? press * 6 : 0);
        // Direkt oynayan takım bir forvetini savunmaya katmaz, uzun top için önde bırakır (savunmada bir adam eksik).
        if (s.r === 'FWD' && p === T.players.find(q => q.role === 'FWD')) x = Math.max(x, L * (0.25 + 0.3 * tac.direct));
        let y = W / 2 + (s.y - 0.5) * W * spread + (bl.y - W / 2) * 0.38;
        if (s.r !== 'FWD') {
          let m = null, md = 9;
          for (const q of opps) { const d = hyp(q.x - x, q.y - y); if (d < md) { md = d; m = q; } }
          if (m) {
            const gx = -m.x, gy = W / 2 - m.y, gd = hyp(gx, gy) || 1;
            const mx = m.x + (gx / gd) * 1.6, my = m.y + (gy / gd) * 1.6;
            const f = s.r === 'DEF' ? lerp(0.6, 0.3, line) : 0.45;
            x = lerp(x, mx, f); y = lerp(y, my, f);
          }
          if (s.r === 'DEF') x = Math.max(x, defX - 2 - (1 - line) * 6);
        }
        this.setT(T, p, x, y, 0.8);
      }
      if (!owner || owner.team === T.idx) return;
      const ol = this.loc(T, owner.x, owner.y);
      // Karşı pres: topu kaybettikten hemen sonra kısa bir süre her yerde basılır, sonra takım yerleşir.
      const cp = this.t - (T.lostAt ?? -99) < lerp(0.5, 4.5, press);
      const active = cp || ol.x <= lerp(0.42, 0.9, press) * L;
      const outs = T.players.filter(p => p.role !== 'GK' && p.stun <= 0)
        .sort((a, c) => hyp(a.x - owner.x, a.y - owner.y) - hyp(c.x - owner.x, c.y - owner.y));
      if (!outs.length) return;
      const gx = -ol.x, gy = W / 2 - ol.y, gd = hyp(gx, gy) || 1;
      if (active) {
        const n = 1 + (press > 0.5 ? 1 : 0) + (cp && press > 0.7 ? 1 : 0);
        const p0 = outs[0];
        this.setT(T, p0, ol.x + (gx / gd) * 0.6, ol.y + (gy / gd) * 0.6, 1);
        p0.aggr = 0.35 + 0.65 * press; p0.press = true;
        const recv = O.players.filter(o => o !== owner && o.role !== 'GK')
          .sort((a, c) => hyp(a.x - owner.x, a.y - owner.y) - hyp(c.x - owner.x, c.y - owner.y));
        // Ek presçiler sadece orta saha ve forvetlerden gelir; stoperler hattı bozmaz.
        const helpers = outs.slice(1).filter(p => p.role !== 'DEF' && hyp(p.x - owner.x, p.y - owner.y) < 15);
        for (let j = 1; j < n && j - 1 < helpers.length; j++) {
          const r = recv[j - 1]; if (!r) break;
          const hp = helpers[j - 1];
          // Diğer presçiler en yakın pas seçeneğini topun tarafından sıkı markaja alır (pas gölgesi).
          const rl = this.loc(T, r.x, r.y);
          const dx = ol.x - rl.x, dy = ol.y - rl.y, dd = hyp(dx, dy) || 1;
          this.setT(T, hp, rl.x + (dx / dd) * 1.5, rl.y + (dy / dd) * 1.5, 0.95);
          hp.aggr = 0.3; hp.press = true;
        }
      }
      // Kale ile top arasındaki en yakın oyuncu topçuyu karşılar; kaleye yaklaştıkça mesafeyi kapatır.
      let eng = null, ed = 1e9;
      for (const p of outs) {
        if (p.press) continue;
        const q = this.loc(T, p.x, p.y);
        if (q.x > ol.x + 1) continue;
        const d = hyp(p.x - owner.x, p.y - owner.y);
        if (d < ed) { ed = d; eng = p; }
      }
      if (eng && ol.x < L * 0.6) {
        const near = clamp((ol.x - 22) / 26, 0, 1);
        const cd = lerp(0.4, 2.6, near);
        const ov = this.locV(T, owner.vx, owner.vy);
        const fx = ol.x + ov.x * 0.1, fy = ol.y + ov.y * 0.1;
        this.setT(T, eng, fx + (gx / gd) * cd, fy + (gy / gd) * cd, 1);
        eng.aggr = Math.max(eng.aggr, lerp(0.55, 0.12, near));
        // Kendi yarısında topçunun yakınındaki, kale tarafında duran herkes araya girer.
        if (ol.x < L * 0.36) for (const p of outs) {
          if (p === eng || p.press) continue;
          const q = this.loc(T, p.x, p.y);
          if (q.x > ol.x + 0.5 || hyp(q.x - ol.x, q.y - ol.y) > 3.5) continue;
          this.setT(T, p, fx + (gx / gd) * 0.5, fy + (gy / gd) * 0.5, 1);
          p.aggr = Math.max(p.aggr, 0.45);
        }
        // Kendi üçte birinde ikinci adam da sıkıştırmaya gelir.
        if (ol.x < L * 0.36) {
          let sup = null, sd = 7;
          for (const p of outs) {
            if (p === eng || p.press) continue;
            const d = hyp(p.x - owner.x, p.y - owner.y);
            if (d < sd) { sd = d; sup = p; }
          }
          if (sup) { this.setT(T, sup, ol.x + (gx / gd) * 1.2 + (gy / gd) * 1.5, ol.y + (gy / gd) * 1.2 - (gx / gd) * 1.5, 0.95); sup.aggr = Math.max(sup.aggr, 0.4); }
        }
      }
    }

    // ---------------- Top sahibinin kararı ----------------
    decisionTime(p) {
      return lerp(0.8, 0.4, this.teams[p.team].tactic.tempo) * (0.7 + 0.6 * this.rng());
    }

    passSigma(p, pf, lofted) {
      return (0.02 + 0.045 * (1 - p.attrs.pass)) * (1 + 0.8 * pf) * (lofted ? 1.3 : 1) * (1 + (1 - p.energy) * 0.6) * (0.8 + 0.45 * this.teams[p.team].tactic.tempo);
    }

    laneRisk(c, cd, v0, lofted, opp) {
      const dx = cd.x - c.x, dy = cd.y - c.y, d = hyp(dx, dy);
      const ux = dx / d, uy = dy / d;
      let risk = 0;
      for (const o of opp) {
        const proj = (o.x - c.x) * ux + (o.y - c.y) * uy;
        if (proj > -1 && proj < 1.5 && !lofted) {
          // Pası atanın dibindeki rakip: ayağını uzatıp pası kesebilir.
          const pp = Math.abs((o.x - c.x) * uy - (o.y - c.y) * ux);
          if (pp < 1.3) risk = 1 - (1 - risk) * (1 - 0.22 * (1 - pp / 1.3));
          continue;
        }
        if (proj < 0.5 || proj > d - 0.5) continue;
        if (lofted && proj < d * 0.88) continue;
        const perp = Math.abs((o.x - c.x) * uy - (o.y - c.y) * ux);
        const tb = timeAt(v0, proj);
        const to = Math.max(0, perp - REACH) / o.s + 0.25;
        if (to < tb) {
          const r = interceptProb(v0 - K * proj) * clamp((tb - to) / 0.4, 0, 1);
          risk = 1 - (1 - risk) * (1 - r);
        }
      }
      return risk;
    }

    xgEff(c, opp, pf) {
      let xg = xgRaw(c.x, c.y);
      const a0 = Math.atan2(GY0 - c.y, L - c.x), a1 = Math.atan2(GY1 - c.y, L - c.x);
      const dg = hyp(L - c.x, W / 2 - c.y);
      for (const o of opp) {
        if (o.o.role === 'GK' || o.x <= c.x) continue;
        const a = Math.atan2(o.y - c.y, o.x - c.x);
        const dd = hyp(o.x - c.x, o.y - c.y);
        if (dd < dg && a > a0 - 0.08 && a < a1 + 0.08) xg *= 0.62;
      }
      return xg * (1 - 0.35 * pf);
    }

    // Konum değeri, o nokta ile kale arasındaki savunmacılarla düşer: dolu bir bloğun önü değersizdir.
    valueEff(x, y, opp) {
      let v = value(x, y);
      const a0 = Math.atan2(GY0 - 3 - y, L - x), a1 = Math.atan2(GY1 + 3 - y, L - x);
      const dg = hyp(L - x, W / 2 - y);
      for (const o of opp) {
        if (o.o.role === 'GK' || o.x <= x - 1) continue;
        const dd = hyp(o.x - x, o.y - y);
        if (dd > dg || dd > 10) continue;
        const a = Math.atan2(o.y - y, o.x - x);
        if (a > a0 - 0.15 && a < a1 + 0.15) v *= x > L - BOX_D ? 0.88 : 0.78;
      }
      return v;
    }

    decide(p) {
      const T = this.teams[p.team], O = this.teams[1 - p.team], tac = T.tactic;
      const c = this.loc(T, p.x, p.y);
      const opp = O.players.map(o => { const q = this.loc(T, o.x, o.y); return { o, x: q.x, y: q.y, s: this.maxSpeed(o) * 0.95 }; });
      let near = 1e9, no = null;
      for (const o of opp) { const d = hyp(o.x - c.x, o.y - c.y); if (d < near) { near = d; no = o; } }
      const pf = clamp((4.5 - near) / 3.5, 0, 1);
      const riskW = lerp(1.45, 0.65, 0.6 * tac.direct + 0.4 * tac.mentality);
      const fat = 1 + (1 - p.energy) * 0.6;
      const rng = this.rng;
      const noise = () => (rng() - 0.5) * (0.004 + 0.012 * tac.tempo) * fat;
      const Vc = this.valueEff(c.x, c.y, opp), Lc = value(L - c.x, W - c.y);
      const isGK = p.role === 'GK';

      let best = { k: 'hold', s: Vc * (1 - 0.45 * pf) - 0.45 * pf * Lc * riskW - tac.tempo * 0.008 + noise() };
      if (isGK) best.s -= 0.01;

      if (!isGK && (p.forceShot || xgRaw(c.x, c.y) > 0.04)) {
        const xg = this.xgEff(c, opp, pf);
        const s = p.forceShot ? 10 : xg + 0.012 + 0.01 * tac.mentality + noise(); // dönen top / korner şansı
        if (s > best.s) best = { k: 'shot', s, xg };
      }
      // Uzaklaştırma: baskı altında topu boşluğa, ileriye havadan göndermek.
      if (c.x < L * 0.33 && pf > 0.45) {
        const pt = { x: Math.min(c.x + 32, L - 6), y: clamp(c.y + (c.y < W / 2 ? -6 : 6), 4, W - 4) };
        // Düşüş noktasına kim daha yakın: kendi oyuncularımız mı, rakip mi?
        let na = 0, nd = 0;
        for (const m of T.players) { if (m === p) continue; const q = this.loc(T, m.x, m.y); if (hyp(q.x - pt.x, q.y - pt.y) < 8) na++; }
        for (const o of opp) if (hyp(o.x - pt.x, o.y - pt.y) < 8) nd++;
        const pw = 0.15 + 0.6 * na / (na + nd + 1);
        const s = pw * value(pt.x, pt.y) - (1 - pw) * value(L - pt.x, W - pt.y) * riskW + noise();
        if (s > best.s) best = { k: 'clear', s, x: pt.x, y: pt.y };
      }

      const offX = Math.max(this.secondLastX(T, O), c.x, L / 2);
      for (const m of T.players) {
        if (m === p || m.stun > 0.3) continue;
        const ml = this.loc(T, m.x, m.y), mv = this.locV(T, m.vx, m.vy), ms = this.maxSpeed(m);
        const onside = ml.x + (rng() - 0.5) * 4 <= offX + 0.2 || p.noOffside;
        if (!onside) continue;
        const cands = [{ x: ml.x + mv.x * 0.35, y: ml.y + mv.y * 0.35, thr: false }];
        if (m.role !== 'GK' && m.role !== 'DEF' && ml.x > c.x - 3 && ml.x < L - 8)
          cands.push({ x: Math.min(ml.x + lerp(5, 9, tac.direct), L - 4), y: ml.y + (W / 2 - ml.y) * 0.25, thr: true });
        // Savunma arkasına top: hattın omzundaki koşucu için ofsayt çizgisinin gerisindeki boşluğa.
        if (m.role !== 'GK' && m.role !== 'DEF' && ml.x > offX - 4 && offX < L - 14)
          cands.push({ x: Math.min(offX + lerp(7, 12, tac.direct), L - 5), y: ml.y + (W / 2 - ml.y) * 0.3, thr: true });
        for (const cd of cands) {
          cd.x = clamp(cd.x, 1, L - 1); cd.y = clamp(cd.y, 1, W - 1);
          const d = hyp(cd.x - c.x, cd.y - c.y);
          if (d < 3.5 || d > 42) continue;
          const lofts = d > 18 ? [false, true] : [false];
          for (const lofted of lofts) {
            const arrive = cd.thr ? 3.5 : lofted ? 4 : 5.5 + 3 * tac.tempo;
            const v0 = K * d + arrive;
            if (v0 > (lofted ? 34 : 30)) continue;
            const lane = this.laneRisk(c, cd, v0, lofted, opp);
            const tb = timeAt(v0, d);
            const tr = Math.max(0, hyp(ml.x - cd.x, ml.y - cd.y) - REACH) / ms + 0.1;
            const arr = Math.max(tb, tr);
            let cont = 0, rn = 1e9;
            for (const o of opp) {
              const od = hyp(o.x - cd.x, o.y - cd.y);
              if (od < rn) rn = od;
              const to = Math.max(0, od - REACH) / o.s + 0.25 + (cd.thr && o.o.role !== 'GK' ? 0.2 : 0);
              if (to < arr) cont = 1 - (1 - cont) * (1 - clamp((arr - to) / 0.6, 0, 0.9));
            }
            const sig = this.passSigma(p, pf, lofted);
            const miss = clamp((sig * d - 1.0) / 4, 0, 0.6);
            const succ = (1 - lane) * (1 - cont) * (1 - miss) * (lofted ? 0.92 : 1);
            const rp = clamp((5 - rn) / 4, 0, 1);
            const Vt = this.valueEff(cd.x, cd.y, opp) * (1 - 0.3 * rp);
            const lx = lane > cont ? (c.x + cd.x) / 2 : cd.x, ly = lane > cont ? (c.y + cd.y) / 2 : cd.y;
            let s = succ * Vt - (1 - succ) * value(L - lx, W - ly) * riskW;
            // Talimatın etkisi: direkt takımlar ileriyi ve havadan topu, kısa pasçılar yakın ve güvenli pası sever.
            // İleri gitme isteği mentaliteden, pasın uzunluğu ve riski pas tarzından gelir.
            const fwd = clamp((cd.x - c.x) / 25, -1, 1);
            s += (0.15 + 0.4 * tac.mentality + 0.25 * tac.tempo) * Math.max(fwd, 0) * 0.02 + (0.5 * tac.mentality + 0.5 * tac.direct) * Math.min(fwd, 0) * 0.012;
            s += (tac.direct - 0.5) * clamp((d - 15) / 15, -1, 1) * 0.008;
            if (lofted) s += (tac.direct - 0.5) * 0.01;
            if (cd.thr) s += (tac.direct - 0.4) * 0.008;
            if (m.role === 'GK') s -= 0.004;
            s += noise();
            if (s > best.s) best = { k: 'pass', s, x: cd.x, y: cd.y, v0, lofted, thr: cd.thr, m, succ, cross: lofted && c.x > L * 0.68 && Math.abs(c.y - W / 2) > 12 && cd.x > L - BOX_D };
          }
        }
      }

      // Orta: kanattan ceza sahasındaki boş alana. Değeri, düşüş noktasına kimin daha çok adamla geleceğine bağlı.
      if (!isGK && c.x > L * 0.58 && Math.abs(c.y - W / 2) > 8) {
        const side = c.y < W / 2 ? -1 : 1;
        const spots = [{ x: L - 5.5, y: W / 2 + side * 3 }, { x: L - 9, y: W / 2 }, { x: L - 6, y: W / 2 - side * 3 }];
        for (const sp of spots) {
          const d = hyp(sp.x - c.x, sp.y - c.y);
          if (d < 8 || d > 34) continue;
          let na = 0, nd = 0;
          for (const m of T.players) { if (m === p || m.role === 'GK') continue; const q = this.loc(T, m.x, m.y); const dd = hyp(q.x - sp.x, q.y - sp.y); if (dd < 12) na += dd < 5 ? 1 : 0.6; }
          for (const o of opp) { const dd = hyp(o.x - sp.x, o.y - sp.y); if (dd < 5) nd += o.o.role === 'GK' ? 1.6 : 1.1; }
          if (na < 0.6) continue;
          const pw = na / (na + nd + 0.6);
          const hx = xgRaw(sp.x, sp.y) * 0.55;
          const s = pw * (0.75 * hx + 0.25 * value(sp.x, sp.y)) - (1 - pw) * value(L - sp.x, W - sp.y) * riskW * 0.5
            + (tac.width - 0.5) * 0.012 + noise();
          if (s > best.s) best = { k: 'pass', s, x: sp.x, y: sp.y, v0: K * d + 4, lofted: true, thr: false, cross: true };
        }
      }

      if (!isGK) {
        let gx = L - c.x, gy = W / 2 - c.y; const gd = hyp(gx, gy) || 1; gx /= gd; gy /= gd;
        const dirs = [0, 0.6, -0.6].map(a => [gx * Math.cos(a) - gy * Math.sin(a), gx * Math.sin(a) + gy * Math.cos(a)]);
        if (Math.abs(c.y - W / 2) > 9 && c.x < L - 8) dirs.push([1, 0]);
        for (const [dx, dy] of dirs) {
          const pt = { x: clamp(c.x + dx * 6, 1, L - 1), y: clamp(c.y + dy * 6, 1, W - 1) };
          let blk = 0;
          for (const o of opp) {
            const proj = (o.x - c.x) * dx + (o.y - c.y) * dy;
            if (proj < 0 || proj > 7) continue;
            const perp = Math.abs((o.x - c.x) * dy - (o.y - c.y) * dx);
            if (perp < 2.2) blk = Math.max(blk, 1 - perp / 2.2);
          }
          const succ = clamp(1 - 0.75 * blk - 0.35 * pf, 0.05, 0.97);
          const wingRun = dx > 0.99 ? (tac.width - 0.4) * 0.01 : 0;
          const s = succ * this.valueEff(pt.x, pt.y, opp) * 0.98 - (1 - succ) * Lc * riskW + (tac.tempo - 0.5) * 0.002 + wingRun + noise();
          if (s > best.s) best = { k: 'dribble', s, x: pt.x, y: pt.y };
        }
      }

      const st = T.stats;
      if (best.k === 'shot') {
        this.shoot(p, pf, best.xg);
      } else if (best.k === 'pass') {
        const w = this.loc(T, best.x, best.y);
        st.passAtt++;
        if (best.lofted) st.lofted++;
        if (best.thr) st.thrAtt++;
        if (best.cross) st.crosses++;
        this.kick(p, w.x, w.y, best.v0, { lofted: best.lofted, type: 'pass', through: best.thr, cross: !!best.cross, sigma: this.passSigma(p, pf, best.lofted) });
        if (best.cross) { this.ball.crossX = w.x; this.ball.crossY = w.y; }
        this.ball.pred = best.succ;
        // Ver-git: kısa pası veren, savunmacının arkasına koşarak dönüş seçeneği olur (kısa pas oyununda daha sık).
        const pd = hyp(best.x - c.x, best.y - c.y);
        if (!best.lofted && pd < 16 && p.role !== 'GK' && p.role !== 'DEF' && c.x > L * 0.35 && rng() < 0.25 + 0.6 * (1 - tac.direct)) {
          const side = best.y > c.y ? -1 : 1;
          p.runT = 1.6; p.runX = Math.min(c.x + 9, L - 5); p.runY = clamp(c.y + side * 3, 3, W - 3);
        }
      } else if (best.k === 'clear') {
        const w = this.loc(T, best.x, best.y);
        st.lofted++;
        this.kick(p, w.x, w.y, K * 32 + 6, { lofted: true, type: 'pass', sigma: 0.15 });
        this.ball.pred = null;
      } else if (best.k === 'dribble') {
        const w = this.loc(T, best.x, best.y);
        p.intent = 'dribble'; p.tx = w.x; p.ty = w.y; p.sprint = 0.95; p.decT = 0.35;
      } else {
        p.intent = 'hold';
        if (no) {
          const ax = c.x - no.x, ay = c.y - no.y, ad = hyp(ax, ay) || 1;
          this.setT(T, p, c.x + (ax / ad) * 2, c.y + (ay / ad) * 2, 0.5);
        } else this.setT(T, p, c.x, c.y, 0.4);
        p.decT = pf > 0.4 ? 0.22 : this.decisionTime(p) * 0.5;
      }
      if (best.k !== 'dribble' && best.k !== 'hold') p.forceShot = false;
    }

    kick(p, tx, ty, v0, o) {
      const b = this.ball, T = this.teams[p.team];
      const sig = o.sigma || 0.03;
      const ang = Math.atan2(ty - b.y, tx - b.x) + this.gauss() * sig;
      const v = v0 * (1 + this.gauss() * (o.lofted ? 0.07 : 0.04));
      b.owner = null; b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v;
      b.kicker = p; p.cool = 0.35; b.type = o.type; b.air = o.lofted ? hyp(tx - b.x, ty - b.y) * 0.9 : 0;
      b.tried = new Map(); b.flight = 0; b.through = !!o.through; b.cross = !!o.cross; b.lastTeam = p.team; b.landed = 0;
      b.offside = null;
      if (o.type === 'pass' && !p.noOffside) {
        const O = this.teams[1 - p.team];
        const line = Math.max(this.secondLastX(T, O), this.loc(T, b.x, b.y).x, L / 2);
        const set = new Set();
        for (const m of T.players) if (m !== p && this.loc(T, m.x, m.y).x > line + 0.01) set.add(m.id);
        if (set.size) b.offside = set;
      }
      p.noOffside = false; p.intent = null;
    }

    shoot(p, pf, xg) {
      const T = this.teams[p.team], O = this.teams[1 - p.team];
      const gk = O.players[0];
      const gl = this.loc(T, gk.x, gk.y);
      let side = gl.y < W / 2 ? 1 : -1;
      if (this.rng() < 0.25) side = -side;
      const w = this.loc(T, L + 0.5, W / 2 + side * (GOAL_W / 2 - 0.7));
      const sig = (0.06 + 0.08 * (1 - p.attrs.shoot)) * (1 + 0.7 * pf) * (1 + (1 - p.energy) * 0.5) * (0.85 + 0.3 * T.tactic.tempo);
      T.stats.shots++; T.stats.xg += xg;
      this.kick(p, w.x, w.y, 24 + 7 * p.attrs.shoot, { type: 'shot', sigma: sig });
      this.countOnTarget(T);
    }

    header(p) {
      const T = this.teams[p.team];
      const c = this.loc(T, p.x, p.y);
      const xg = xgRaw(c.x, c.y) * 0.55;
      T.stats.shots++; T.stats.xg += xg; T.stats.headers++;
      const w = this.loc(T, L + 0.5, W / 2 + (this.rng() - 0.5) * (GOAL_W - 1.5));
      this.kick(p, w.x, w.y, 17, { type: 'shot', sigma: 0.1 });
      this.countOnTarget(T);
    }

    countOnTarget(T) {
      const b = this.ball, bl = this.loc(T, b.x, b.y), v = this.locV(T, b.vx, b.vy);
      if (v.x <= 0) return;
      const y = bl.y + (v.y * (L - bl.x)) / v.x;
      if (y > GY0 && y < GY1) T.stats.onTarget++;
    }

    gauss() {
      let u = 0; while (u === 0) u = this.rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng());
    }

    // ---------------- Hareket ve temas ----------------
    move(p, dt) {
      const b = this.ball;
      const base = 5.4 + 2.6 * p.attrs.pace;
      let ms = this.maxSpeed(p) * p.sprint;
      if (b.owner === p) {
        // Açık alanda top sürmek az yavaşlatır; önünü kesen rakip (jokey) çok yavaşlatır.
        const hx = p.tx - p.x, hy = p.ty - p.y, hd = hyp(hx, hy) || 1;
        let f = 0.95;
        const T = this.teams[p.team], px = this.loc(T, p.x, p.y).x;
        for (const o of this.teams[1 - p.team].players) {
          const ox = o.x - p.x, oy = o.y - p.y, od = hyp(ox, oy);
          const goalSide = this.loc(T, o.x, o.y).x > px - 0.3;
          if (od < 1.9 && o.stun <= 0 && (goalSide || (ox * hx + oy * hy) / (od * hd + 1e-6) > 0.35)) { f = 0.5; break; }
          if (od < 4) f = 0.88;
        }
        ms *= f;
      }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = hyp(dx, dy);
      let wx = 0, wy = 0;
      if (d > 0.05) { const s = Math.min(ms, d * 2.2); wx = (dx / d) * s; wy = (dy / d) * s; }
      let ax = wx - p.vx, ay = wy - p.vy;
      const am = hyp(ax, ay), lim = (p.stun > 0 ? 4 : 10) * dt;
      if (am > lim) { ax *= lim / am; ay *= lim / am; }
      p.vx += ax; p.vy += ay;
      p.x = clamp(p.x + p.vx * dt, 0.2, L - 0.2);
      p.y = clamp(p.y + p.vy * dt, 0.2, W - 0.2);
      const fr = hyp(p.vx, p.vy) / base;
      const sm = 1.3 - 0.6 * p.attrs.stamina;
      p.energy -= (0.0105 * fr * fr * fr * sm - 0.0014) * dt;
      p.energy = clamp(p.energy, 0.25, 1);
    }

    collide() {
      const a = this.all;
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
        const p = a[i], q = a[j];
        const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy);
        if (d < 1.3 && d > 1e-4) {
          // Topçu, önünde duran rakibi itemez; itilen kendisidir (gövdeyle blok).
          const o = this.ball.owner;
          const wp = o === p && q.team !== p.team ? 0.7 : o === q && p.team !== q.team ? 0.3 : 0.5;
          const ov = 1.3 - d, ux = dx / d, uy = dy / d;
          p.x -= ux * ov * wp; p.y -= uy * ov * wp; q.x += ux * ov * (1 - wp); q.y += uy * ov * (1 - wp);
        }
      }
    }

    tackles(dt) {
      const b = this.ball, o = b.owner;
      if (!o || o.protect > 0) return;
      const O = this.teams[1 - o.team];
      // Topun çevresindeki savunmacı sayısı: kaçış yollarını kapatan her ek oyuncu müdahaleyi kolaylaştırır.
      let support = 0;
      for (const q of O.players) if (q.role !== 'GK' && hyp(q.x - b.x, q.y - b.y) < 3.2) support++;
      for (const p of O.players) {
        if (p.stun > 0 || p.role === 'GK') continue;
        // Topçunun önünde (kale tarafında) duran savunmacı biraz daha uzaktan müdahale edebilir: ikili mücadele.
        const Tp = this.teams[p.team], front = this.loc(Tp, p.x, p.y).x < this.loc(Tp, o.x, o.y).x;
        if (hyp(p.x - b.x, p.y - b.y) > (front ? 1.8 : 1.3)) continue;
        const aggr = this.inOwnBox(p) ? Math.max(p.aggr, 0.5) : p.aggr;
        if (this.rng() > (0.9 + 2.4 * aggr) * dt) continue;
        const S = this.teams[p.team].stats;
        S.tackles++;
        if (this.rng() < 0.025 + 0.06 * aggr) { this.foul(p, o); return; }
        const ps = clamp(0.32 + 0.3 * (p.attrs.tackle - o.attrs.tech) + 0.06 * (support - 1), 0.1, 0.8);
        if (this.rng() < ps) {
          S.tacklesWon++;
          if (this.loc(this.teams[p.team], b.x, b.y).x > L / 2) S.highWins++;
          if (this.rng() < (front ? 0.7 : 0.55)) this.gainControl(p);
          else { b.owner = null; this.deflect(p, 5); }
          return;
        } else {
          // Önden yoklama başarısızsa kısa süre dengesini toplar; arkadan/yandan dalan oyuncu tamamen geçilir.
          p.stun = front ? 0.3 : 0.7;
        }
      }
    }

    foul(p, o) {
      const T = this.teams[p.team];
      T.stats.fouls++;
      const q = this.loc(T, o.x, o.y);
      if (q.x < BOX_D && Math.abs(q.y - W / 2) < BOX_HW) {
        this.event('penalty', o.team, 'Penaltı!');
        const A = this.teams[o.team];
        const w = this.loc(A, L - 9, W / 2);
        this.restart(o.team, w.x, w.y, 'penalty');
      } else {
        this.event('foul', p.team, 'Faul');
        this.restart(o.team, o.x, o.y, 'freekick');
      }
    }

    deflect(p, speed) {
      const b = this.ball;
      const ang = Math.atan2(b.vy, b.vx) + Math.PI + (this.rng() - 0.5) * 2.4;
      b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed;
      b.type = 'loose'; b.lastTeam = p.team; b.kicker = p; p.cool = 0.2; b.tried = new Map(); b.air = 0; b.offside = null;
      this.possTeam = p.team;
    }

    updateBall(dt) {
      const b = this.ball;
      if (b.owner) {
        const o = b.owner, sp = hyp(o.vx, o.vy);
        let fx, fy;
        if (sp > 0.5) { fx = o.vx / sp; fy = o.vy / sp; } else { fx = this.teams[o.team].side === 0 ? 1 : -1; fy = 0; }
        b.x = clamp(o.x + fx * 0.75, 0.05, L - 0.05); b.y = clamp(o.y + fy * 0.75, 0.05, W - 0.05);
        b.vx = o.vx; b.vy = o.vy;
        return;
      }
      b.flight += dt;
      if (b.landed > 0) b.landed -= dt;
      const ox = b.x, oy = b.y;
      const sp = hyp(b.vx, b.vy);
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.air > 0) {
        b.air -= sp * dt;
        if (b.air <= 0) { b.air = 0; b.landed = 0.4; if (this.landing()) return; }
      }
      const f = Math.exp(-K * dt);
      b.vx *= f; b.vy *= f;
      if (sp < 0.25) { b.vx = 0; b.vy = 0; }
      if (this.checkOut(ox, oy)) return;
      this.contacts(sp);
    }

    landing() {
      const b = this.ball;
      const cands = [];
      let tw = 0;
      for (const p of this.all) {
        const d = hyp(p.x - b.x, p.y - b.y);
        if (d > 2.4 || p.stun > 0.3) continue;
        const T = this.teams[p.team];
        const gkBox = p.role === 'GK' && this.inOwnBox(p);
        const w = (2.4 - d) * (gkBox ? 2.5 : 1) * (p.team !== b.lastTeam ? 1.25 : 1) * (0.5 + p.attrs.tech);
        cands.push({ p, w }); tw += w;
      }
      if (!cands.length) return false;
      let r = this.rng() * tw, win = cands[0].p;
      for (const c of cands) { r -= c.w; if (r <= 0) { win = c.p; break; } }
      const T = this.teams[win.team];
      const q = this.loc(T, win.x, win.y);
      if (win.team === b.lastTeam) {
        if (win.role !== 'GK' && q.x > L - 13 && Math.abs(q.y - W / 2) < 10 && this.rng() < 0.7 && !(b.offside && b.offside.has(win.id))) {
          if (b.kicker && b.kicker.team === win.team) T.stats.passCmp++;
          this.header(win); return true;
        }
        if (this.rng() < 0.75) { this.gainControl(win); return true; }
        this.deflect(win, 4); return true;
      }
      if (win.role === 'GK' || q.x > L / 2 || this.rng() < 0.35) { this.gainControl(win); return true; }
      // Kendi yarı sahasında kafayla uzaklaştırma
      const w = this.loc(T, Math.min(q.x + 25, L - 2), q.y + (this.rng() - 0.5) * 20);
      this.possTeam = win.team;
      b.lastTeam = win.team;
      this.kick(win, w.x, w.y, 18, { type: 'loose', sigma: 0.25 });
      return true;
    }

    inOwnBox(p) {
      const q = this.loc(this.teams[p.team], p.x, p.y);
      return q.x < BOX_D && Math.abs(q.y - W / 2) < BOX_HW;
    }

    checkOut(ox, oy) {
      const b = this.ball;
      if (b.y < 0 || b.y > W) {
        const team = 1 - b.lastTeam;
        this.restart(team, clamp(b.x, 1, L - 1), b.y < 0 ? 0.4 : W - 0.4, 'throw');
        return true;
      }
      if (b.x < 0 || b.x > L) {
        const lineX = b.x < 0 ? 0 : L;
        const D = this.teams.find(T => T.side === (b.x < 0 ? 0 : 1));
        const A = this.teams[1 - D.idx];
        const yc = oy + ((b.y - oy) * (lineX - ox)) / (b.x - ox || 1e-6);
        if (yc > GY0 && yc < GY1 && b.air <= 0) { this.goal(A); return true; }
        if (b.lastTeam === D.idx) {
          this.event('corner', A.idx, 'Korner');
          this.restart(A.idx, lineX === 0 ? 0.5 : L - 0.5, b.y < W / 2 ? 0.5 : W - 0.5, 'corner');
        } else {
          const w = this.loc(D, 5, W / 2);
          this.restart(D.idx, w.x, w.y, 'goalkick');
        }
        return true;
      }
      return false;
    }

    goal(A) {
      A.stats.goals++;
      const sc = A.players.find(p => p === this.ball.kicker);
      this.event('goal', A.idx, 'GOL! ' + A.name + (sc ? ' (#' + sc.num + ')' : ''));
      this.kickoff(1 - A.idx);
    }

    contacts(sp) {
      const b = this.ball, a = this.all, n = a.length;
      const start = (this.rng() * n) | 0;
      for (let k = 0; k < n; k++) {
        const p = a[(start + k) % n];
        if (p.stun > 0.3 || (p === b.kicker && p.cool > 0)) continue;
        const gkBox = p.role === 'GK' && this.inOwnBox(p);
        const reach = gkBox ? (b.type === 'shot' ? 1.1 + 2.4 * clamp(b.flight / 0.45, 0, 1) : 1.4) : (b.type === 'shot' && p.team !== b.lastTeam ? 1.25 : REACH);
        const d = hyp(p.x - b.x, p.y - b.y);
        if (d > reach) continue;
        if (b.air > 0 && !(gkBox && b.air < 6)) continue;
        if (sp > 3 && this.t - (b.tried.get(p.id) ?? -9) < 0.3) continue;
        // Kaleci şutta topun kendisine en yakın geçtiği anda hamle yapar.
        if (gkBox && b.type === 'shot' && p.team !== b.lastTeam && d > 0.9 && (p.x - b.x) * b.vx + (p.y - b.y) * b.vy > 0) continue;
        b.tried.set(p.id, this.t);
        if (b.type === 'shot' && p.team !== b.lastTeam) {
          if (gkBox) {
            const ps = (0.72 + 0.3 * p.attrs.gk) * clamp(0.5 + b.flight * 1.4, 0.5, 1) * clamp(1.25 - d * 0.18, 0.5, 1);
            if (this.rng() < ps) {
              this.teams[p.team].stats.saves++;
              this.event('save', p.team, 'Kurtarış');
              if (sp < 22 && this.rng() < 0.6) { this.gainControl(p); p.protect = 1.2; }
              else this.deflect(p, 7);
              return;
            }
          } else if (this.rng() < 0.55) { this.deflect(p, sp * 0.35); return; }
          continue;
        }
        const same = p.team === b.lastTeam;
        let pc = same ? (sp < 15 ? 0.97 : clamp(1 - (sp - 15) / 14, 0.2, 1)) : interceptProb(sp);
        if (b.landed > 0) pc *= 0.85;
        if (!same && b.flight < 0.15) pc = Math.min(pc, 0.2);
        pc *= 0.85 + 0.15 * p.attrs.tech;
        if (gkBox && b.type !== 'shot') pc = Math.max(pc, 0.9);
        if (this.rng() < pc) { this.gainControl(p); if (gkBox && !same) p.protect = 1.0; return; }
      }
    }

    gainControl(p) {
      const b = this.ball;
      const T = this.teams[p.team];
      if (b.offside && b.offside.has(p.id) && p.team === b.lastTeam && b.type === 'pass') {
        T.stats.offsides++;
        this.event('offside', p.team, 'Ofsayt');
        this.restart(1 - p.team, p.x, p.y, 'freekick');
        return;
      }
      if (b.type === 'pass' && b.kicker && b.kicker.team === p.team && b.kicker !== p) {
        T.stats.passCmp++;
        if (b.through) T.stats.thrCmp++;
      }
      const prev = this.possTeam;
      if (prev !== p.team) {
        const Lz = this.teams[prev];
        Lz.lostAt = this.t;
        for (const q of Lz.players) q.runT = 0;
        const lx = this.loc(Lz, b.x, b.y).x;
        if (lx < L / 3) Lz.stats.lossOwn++; else if (lx < (2 * L) / 3) Lz.stats.lossMid++; else Lz.stats.lossFin++;
      }
      b.owner = p; b.lastTeam = p.team; this.possTeam = p.team; b.type = 'owned'; b.air = 0; b.offside = null; b.kicker = null;
      p.protect = Math.max(p.protect, 0.2);
      p.decT = this.decisionTime(p) * 0.6;
      p.intent = null;
    }

    restart(team, x, y, kind) {
      const T = this.teams[team], O = this.teams[1 - team], b = this.ball;
      x = clamp(x, 0.5, L - 0.5); y = clamp(y, 0.4, W - 0.4);
      let taker;
      if (kind === 'goalkick') taker = T.players[0];
      else {
        let bd = 1e9;
        for (const p of T.players) { if (p.role === 'GK') continue; const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; taker = p; } }
      }
      for (const p of this.all) { p.stun = 0; }
      taker.x = x; taker.y = y; taker.vx = taker.vy = 0;
      b.x = x; b.y = y; b.vx = b.vy = 0; b.air = 0; b.owner = taker; b.lastTeam = team; b.type = 'owned'; b.offside = null; b.kicker = null;
      this.possTeam = team;
      taker.protect = kind === 'penalty' ? 5 : 1.6;
      taker.decT = kind === 'penalty' ? 0.8 : 0.9 + this.rng() * 0.5;
      taker.noOffside = kind !== 'freekick';
      taker.forceShot = kind === 'penalty';
      if (kind === 'penalty') {
        for (const p of this.all) {
          if (p === taker) continue;
          if (p.team !== team && p.role === 'GK') { const g = this.loc(O, 0.6, W / 2); p.x = g.x; p.y = g.y; p.vx = p.vy = 0; continue; }
          const q = this.loc(T, p.x, p.y);
          if (q.x > L - BOX_D - 1) { const w = this.loc(T, L - BOX_D - 2, q.y); p.x = w.x; p.y = w.y; }
        }
      } else {
        for (const o of O.players) {
          const dx = o.x - x, dy = o.y - y, d = hyp(dx, dy);
          if (d < 6) {
            const ux = d > 0.01 ? dx / d : 1, uy = d > 0.01 ? dy / d : 0;
            o.x = clamp(x + ux * 6, 0.3, L - 0.3); o.y = clamp(y + uy * 6, 0.3, W - 0.3);
          }
        }
      }
    }

    kickoff(team) {
      const b = this.ball;
      for (const T of this.teams) {
        for (const p of T.players) {
          let x, y;
          if (p.role === 'GK') { x = 1.5; y = W / 2; }
          else { x = Math.min((0.12 + 0.16 * p.slot.l) * L, L / 2 - 2); y = W / 2 + (p.slot.y - 0.5) * W * 0.7; }
          if (T.idx !== team) {
            const dx = L / 2 - x, dy = W / 2 - y, d = hyp(dx, dy);
            if (d < 7) { x = L / 2 - 7 * (dx / (d || 1)); y = W / 2 - 7 * (dy / (d || 1)); }
          }
          const w = this.loc(T, x, y);
          p.x = w.x; p.y = w.y; p.vx = p.vy = 0; p.tx = w.x; p.ty = w.y; p.stun = 0; p.intent = null; p.forceShot = false;
        }
      }
      const T = this.teams[team];
      const taker = T.players.find(p => p.role === 'FWD') || T.players.find(p => p.role === 'MID');
      const w = this.loc(T, L / 2 - 0.8, W / 2);
      taker.x = w.x; taker.y = w.y;
      b.x = L / 2; b.y = W / 2; b.vx = b.vy = 0; b.air = 0; b.owner = taker; b.lastTeam = team; b.type = 'owned'; b.offside = null; b.kicker = null;
      this.possTeam = team;
      taker.protect = 1.5; taker.decT = 0.8; taker.noOffside = true;
    }
  }

  // ---------------- Analist: maç verisinden okunabilir taktik geri bildirimi ----------------
  function analyze(m, idx) {
    const T = m.teams[idx], O = m.teams[1 - idx], s = T.stats, o = O.stats, tac = T.tactic, ot = O.tactic;
    const tot = s.poss + o.poss || 1, poss = s.poss / tot;
    const notes = [];
    const lossTot = s.lossOwn + s.lossMid + s.lossFin;
    if (s.lossOwn >= 5 && ot.press > 0.6)
      notes.push({ k: 'bad', t: `Rakip önde pres yapıyor ve kendi üçte birlik bölgende ${s.lossOwn} top kaybettin. Pas tarzını direkte çekmek ya da tempoyu artırmak presin üzerinden geçmeni sağlar.` });
    else if (s.lossOwn >= 6)
      notes.push({ k: 'bad', t: `Kendi bölgende ${s.lossOwn} top kaybı var. Daha güvenli (kısa) pas veya daha düşük mentalite riskini azaltır.` });
    if (o.thrCmp >= 3 && tac.line > 0.55)
      notes.push({ k: 'bad', t: `Rakip savunma arkasına ${o.thrCmp} ara pas tamamladı. Hattın yüksek; geri çekmek arkadaki boşluğu kapatır.` });
    if (s.offsides >= 3)
      notes.push({ k: 'bad', t: `${s.offsides} kez ofsayta düştün. Rakip hattı yüksek tutuyor; kısa pas ve geriden gelen orta saha koşuları tuzağı boşa çıkarır.` });
    if (o.offsides >= 3)
      notes.push({ k: 'good', t: `Ofsayt tuzağın çalışıyor: rakip ${o.offsides} kez ofsayta düştü.` });
    if (poss > 0.58 && s.shots <= o.shots)
      notes.push({ k: 'bad', t: `Topa %${Math.round(poss * 100)} sahipsin ama rakip kadar şut çekemiyorsun. Kapalı bloğa karşı genişliği ve mentaliteyi artırmak alan açar.` });
    if (poss < 0.42 && s.shots > o.shots)
      notes.push({ k: 'good', t: `Topu rakibe bırakıp daha çok pozisyon buluyorsun; plan işliyor.` });
    if (s.energy < 0.5 || avgEnergy(T) < 0.5)
      notes.push({ k: 'bad', t: `Oyuncuların kondisyonu düştü (ort. %${Math.round(avgEnergy(T) * 100)}). Yorgun oyuncu yavaşlar ve hata yapar; presi biraz azalt.` });
    if (o.lossOwn >= 5)
      notes.push({ k: 'good', t: `Presin işe yarıyor: rakip kendi bölgesinde ${o.lossOwn} top kaybetti.` });
    if (s.crosses >= 6 && s.headers <= 1)
      notes.push({ k: 'bad', t: `${s.crosses} orta yaptın ama kafa vuruşu neredeyse yok; ceza sahasında yeterli adam yok ya da rakip savunma kalabalık.` });
    if (s.xg > o.xg * 1.6 && s.goals <= o.goals)
      notes.push({ k: 'info', t: `xG'de öndesin (${s.xg.toFixed(2)} - ${o.xg.toFixed(2)}); skor şanssızlık olabilir, taktiği bozma.` });
    if (!notes.length) notes.push({ k: 'info', t: lossTot ? 'Belirgin bir sorun yok; maç dengeli gidiyor.' : 'Henüz yorum için yeterli veri yok.' });
    return notes;
  }
  function avgEnergy(T) { return T.players.reduce((a, p) => a + p.energy, 0) / T.players.length; }

  // Rakip yapay zekâ menajeri: gerideyse, gördüğü taktiğe en yakın hazır planı bulur ve
  // denge testinde (balance.js) o plana karşı en iyi sonucu veren planı seçer.
  const BEST_RESPONSE = {
    'Dengeli': 'Tiki-Taka',
    'Gegenpress': 'Otobüs & Kontra',
    'Tiki-Taka': 'Gegenpress',
    'Otobüs & Kontra': 'Kanat Oyunu',
    'Kanat Oyunu': 'Gegenpress',
  };
  function nearestPreset(t) {
    let best = null, bd = 1e9;
    for (const [name, p] of Object.entries(PRESETS)) {
      let d = p.formation === t.formation ? 0 : 0.15;
      for (const k of TACTIC_KEYS) d += (p[k] - t[k]) ** 2;
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function counterTactic(seen) { return BEST_RESPONSE[nearestPreset(seen)]; }

  return { Match, PRESETS, FORMATIONS, TACTIC_KEYS, makeSquad, analyze, counterTactic, nearestPreset, avgEnergy, mulberry32, L, W, GOAL_W, DT, BOX_D, BOX_HW };
});
