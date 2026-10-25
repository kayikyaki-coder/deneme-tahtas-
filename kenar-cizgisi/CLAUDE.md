# Kenar Çizgisi

Taktik odaklı futbol menajerliği oyunu. Ayrıntılar README.md'de.

## Değişmez tasarım ilkesi

**Tek bir mutlak iyi taktik olmamalı.** Kazanmak; kendi oyuncularına, rakibin taktiğine ve bağlama (örneğin yoğun maç takviminde yorgunluk) en uygun taktiği bulmaktan gelmeli. Ayrıntılar ve ileride yapılacaklar: TASARIM.md.

Motorda bir şey değiştirdikten sonra:
- `node saglik.js` ile ayarların hâlâ çalıştığını ve hiçbir ayarın "hep işe yarıyor" ya da "hep zarar veriyor" çıkmadığını kontrol et.
- `node balance.js 30` ile hazır planlar arasında ezici bir üstünlük olmadığını kontrol et.

Ayarlanabilir sayılar `engine.js` başındaki `CFG` nesnesindedir; denemek için araçlara `--set ad=değer` verilir.
