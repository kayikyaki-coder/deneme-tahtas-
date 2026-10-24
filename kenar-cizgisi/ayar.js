// Komut satırı araçları için ortak yardımcı: --set ad=değer,ad2=değer2 ile motor ayarlarını değiştirir.
// Örnek: node saglik.js --set pressBlockPush=12,tackleWin=0.36
const E = require('./engine.js');

function parseSet(args) {
  const i = args.indexOf('--set');
  if (i < 0) return {};
  const cfg = {};
  for (const kv of args[i + 1].split(',')) {
    const [k, v] = kv.split('=');
    if (!(k in E.CFG)) { console.error(`Bilinmeyen ayar: ${k}\nAyarlar: ${Object.keys(E.CFG).join(', ')}`); process.exit(1); }
    cfg[k] = Number(v);
  }
  console.log('Değiştirilen ayarlar: ' + Object.entries(cfg).map(([k, v]) => `${k}=${v} (varsayılan ${E.CFG[k]})`).join(', '));
  return cfg;
}

module.exports = { parseSet };
