# Kenar Çizgisi

Haxball görünümünde, Football Manager ruhunda bir taktik oyunu prototipi. Topa sen dokunmuyorsun: taktiği kurup maçı izliyorsun, gerektiğinde kenardan müdahale ediyorsun. Hedef, taktiğin gerçekten önemli olduğu ama hiçbir taktiğin her şeyi yenmediği bir oyun.

**Temel tasarım ilkesi:** Tek bir mutlak iyi taktik olmamalı. Ayrıntılar ve ileride yapılacaklar için [TASARIM.md](TASARIM.md). Önerilen oyuncu özellik seti: [OZELLIKLER.md](OZELLIKLER.md). Aksiyonları hangi özelliklerin etkilediği: [AKSIYONLAR.md](AKSIYONLAR.md).

## Çalıştırma

`index.html` dosyasını tarayıcıda aç. Kurulum gerekmez; `engine.js` aynı klasörde olmalı.

```
node balance.js 40              # hazır planlar arası galibiyet matrisi (eşleşme başına 40 maç)
node balance.js 20 --random 60  # 60 rastgele taktik: hangi ayar puanla ilişkili?
node balance.js 12 --pool 19    # 24 taktik herkes herkesle: her taktiğin en iyi karşılığı ne?
```

Bütün testler 4 çekirdekte paralel çalışır. Denge testlerinde iki takımın oyuncuları birebir aynı yetenektedir, yani sonuç farkı sadece taktikten gelir.

## Tasarım fikri: gizli bonus yok

Hiçbir taktiğin "+%10 hücum" gibi bir sayısal bonusu yok. Taktik ayarları sadece iki şeyi değiştirir:

1. **Oyuncuların nerede durduğu:** savunma hattı yüksekliği, blok sıkılığı, genişlik, kimin önde kaldığı, kimin prese çıktığı.
2. **Topla ne karar verdikleri:** ileri pas isteği, pas uzunluğu, risk iştahı, karar hızı ve isabeti.

Sonuç fizikten doğar: topun hızı ve sürtünmesi, koşu mesafeleri, ivme ve dönüş, kondisyon, pas koridorları, ofsayt, hava topu düellosu, ikili mücadele. Bu yüzden her ayarın gerçek bir bedeli vardır.

| Ayar | Getirisi | Bedeli |
|---|---|---|
| Yüksek savunma hattı | Rakibi sıkıştırır, ofsayt tuzağı kurar, topu önde kazanır | Hattın arkası boştur; savunma arkasına top ve hızlı kontraya açıktır |
| Derin hat | Arkada boşluk kalmaz, ceza sahası kalabalıktır | Rakibe alan ve topu bırakır, kendi hücumu uzaktan başlar |
| Yoğun pres | Topu kayıptan hemen sonra (karşı pres) rakip yarı sahada kazanır | Koşturur ve yorar; preslenen adam geçilince boşluk açılır |
| Direkt pas | Presin üstünden geçer, forvet önde kalıp kontraya çıkar | İsabet düşer, top sık el değiştirir, savunmada bir adam eksik kalır |
| Kısa pas | Topu elde tutar, ver-git koşularıyla ilerler | Sert prese karşı kendi yarısında sıkışabilir |
| Hızlı tempo | Savunma yerleşmeden vurur | Kararlar ve vuruşlar daha özensizdir |
| Genişlik | Kapalı savunmayı açar, orta şansı yaratır | Paslar uzar, araya girmeye açık hale gelir |
| Hücum mentalitesi | Hücumda daha çok adam | Top kaybında arkada az adam kalır |

## Maç motoru (`engine.js`)

- 11'e 11, 105×68 m saha, gerçek ölçülerde ceza sahası ve kale, saniyede 30 fizik adımı. Takım zekâsı saniyede 15 kez çalışır, top vurulunca ya da sahip değişince hemen yenilenir.
- Dizilişler: 4-4-2, 4-3-3, 4-2-3-1, 4-1-4-1, 3-5-2, 5-3-2.
- Hız: görüntüsüz bir maç ~280 ms. 4 çekirdekte saniyede ~17 maç, 10.000 maç ~10 dakika.
- **Top fiziği:** Hız mesafeyle doğrusal azalır, bu sayede pas hızı hedefe göre hesaplanır. Havadan toplar hedefe yakın iner ve düşüş noktasında düello olur.
- **Oyuncu kararları:** Topu tutan oyuncu her seçeneğin beklenen değerini hesaplar. Seçenekler şunlar: şut, kısa pas, ara pas, savunma arkasına top, havadan pas, orta, top sürme, uzaklaştırma, topu saklama. Değer modeli şöyle çalışır: bir noktada topa sahip olmanın değeri, oradan gol olma olasılığıdır (xG). Bu değer, o nokta ile kale arasındaki yakın savunmacılarla düşer. Pasın başarı tahmini; pas koridoruna giren rakipleri, alıcıya rakipten önce ulaşıp ulaşamayacağını ve pas isabetini hesaba katar. Tahminler gerçekleşen oranlarla doğrulandı: kısa paslarda tahmin ~%90, gerçekleşen ~%89.
- **Savunma:** Bölge savunması ile adam markajı karışımı. Kale tarafındaki oyuncu topçuyu karşılar ve jokey yapar; kendi bölgesinde ikinci adam sıkıştırmaya gelir. Ek presçiler pas seçeneklerini gölgeler. Karşı pres penceresi var.
- **İkili mücadele:** Önden müdahalede savunmacı başarısız olursa kısa süre dengesini toplar; yandan veya arkadan dalan oyuncu ise tamamen geçilir. Etraftaki her ek savunmacı müdahaleyi kolaylaştırır.
- **Kondisyon:** Koşu hızının küpüyle azalır, düşük tempoda toparlanır. Yorgun oyuncu hem yavaşlar hem hata yapar.
- **Kurallar:** Ofsayt (pasör bazen yanlış okur, forvetler bazen erken çıkar), faul, penaltı, korner, taç, aut.

## Oyun ekranı (`index.html`)

- Taktik tahtası: 5 hazır plan, 5 diziliş, 6 ayar. Her ayarın altında o değerin ne kazandırıp ne kaybettirdiği yazar. "Bu planın profili" kutusu artıları, eksileri ve tutarsızlıkları gösterir.
- Maç sırasında taktik anında değişir. Devre arasında maç durur ve analist raporu gelir.
- Rakip menajer gerideyse devre arasında taktik değiştirir. Senin taktiğini en yakın hazır plana eşler ve denge testinde ona karşı en iyi sonucu veren planı seçer.
- **Analist:** Maç verisinden okunabilir uyarılar üretir. Örneğin "kendi bölgende 7 top kaybı, rakip önde basıyor".
- **Laboratuvar:** Planını aynı rakibe karşı görüntüsüz, durmadan dener; sen durdurana ya da taktiği veya rakibi değiştirene kadar sürer. Her çekirdekte bir arka plan işçisi (`lab-worker.js`) çalışır, dosya doğrudan açıldığında sayfa içi moda geçer. Maç sayısı 10, 50, 100 ya da sınırsız seçilebilir. Puan/maç, %95 güven aralığıyla gösterilir.

## Test araçları

Hepsi bütün çekirdekleri kullanır. Hepsi `--set ad=değer,ad2=değer2` ile motor ayarlarını koda dokunmadan değiştirebilir.

```
node saglik.js                    # ayar sağlık raporu: her ayar her kademede çalışıyor mu? (~4 dk)
node saglik.js --only press --n 20
node deney.js press               # tek bir ayarı tarar: mekanizma + rakibe göre sonuç
node balance.js 30                # hazır planlar arası galibiyet matrisi
node balance.js 12 --pool 19      # 24 taktik herkes herkesle: her taktiğin karşılığı var mı?
node saglik.js --only press --set pressedVision=18,tackleWin=0.36   # bir ayarı değiştirip ölç
```

**Ayar dosyası:** Motorun ayarlanabilir sayıları `engine.js` başındaki `CFG` nesnesinde toplanmıştır (~70 ayar, her birinin açıklamasıyla): fizik, top sürme, ikili mücadele, pas, şut ve kaleci, her taktik ayarının mekanikleri. Bir değeri denemek için kodu açmak gerekmez: `--set` ile verilir, sonuç eskisiyle karşılaştırılır.

**Sağlık raporu** her ayar için üç test yapar:
- **A. Mekanizma:** Ayarın doğrudan etkilediği ölçüm her kademede bir öncekinden gürültüden büyük şekilde değişmeli. Örneğin savunma hattı yükselince son savunmacı gerçekten öne çıkmalı.
- **B. Bedel:** Ayarı uca çekmenin beklenen bir bedeli olmalı.
- **C. Takas:** Ayar en az bir rakibe karşı işe yaramalı ve en az birine karşı zarar vermeli (xG farkıyla ölçülür). Hep işe yarayan ayar meta, hep zarar veren tuzaktır.

## Denge durumu (ölçülmüş)

Hazır planlar, 11'e 11, eşleşme başına 30 maç. Satır takımının galibiyet-beraberlik-mağlubiyet yüzdesi:

|  | Dengeli | Gegenpress | Tiki-Taka | Otobüs & Kontra | Kanat Oyunu | Puan/maç |
|---|---|---|---|---|---|---|
| Dengeli (4-2-3-1) | — | 7-30-63 | 13-33-53 | 33-37-30 | 50-23-27 | 1.08 |
| Gegenpress (4-3-3) | 63-30-7 | — | 37-33-30 | 27-30-43 | 53-30-17 | 1.66 |
| Tiki-Taka (4-3-3) | 53-33-13 | 30-33-37 | — | 7-17-77 | 63-20-17 | 1.41 |
| Otobüs & Kontra (5-3-2) | 30-37-33 | 43-30-27 | 77-17-7 | — | 63-17-20 | 1.85 |
| Kanat Oyunu (4-4-2) | 27-23-50 | 17-30-53 | 17-20-63 | 20-17-63 | — | 0.82 |

Taş-kağıt-makas yapısı var: Gegenpress Dengeli'yi, Tiki-Taka Dengeli'yi ve Kanat Oyunu'nu, Otobüs Tiki-Taka'yı ve Kanat Oyunu'nu yeniyor. Kanat Oyunu ve Dengeli şu an zayıf.

**Meta testi (7'ye 7 sürümünde yapıldı, 11'e 11 için tekrarlanmalı):** Rastgele taktiklerle yapılan aramalarda en güçlü çıkan plan, pres yapmayan, dar, direkt ve hücumcu bir 3-1-2 oldu. Atletico tarzı kompakt blok ve kontra. Bu plan hazır planların hepsini yeniyor. Ama doğrulanmış bir karşılığı var: 3-2-1, çok düşük mentalite, yoğun pres ve direkt oyun, 40 maçta 24-6-10 kazanıyor. O karşı taktiğin de kendi karşılıkları var. Yani zincir kırılabiliyor, tek bir yenilmez taktik bulunamadı.

## Dürüst not: bilinen zayıflıklar

- **Kısa pas oyunu hâlâ zayıf.** Çok kısa pas (direkt < 0.2) ve çok yavaş tempo neredeyse her rakibe kaybediyor. Tiki-Taka planı bu yüzden "kısa ağırlıklı ama karışık" (0.3) olarak ayarlandı. Saf pozisyon oyununu ödüllendirecek mekanik (sabırlı top dolaşımının savunmayı yorması ve kaydırması) henüz yok.
- **Derin hat tek başına zayıf.** Derin hat, kontra ayarlarıyla (direkt, hızlı, düşük mentalite, 3 stoper) iyi çalışıyor. Ama diğer ayarlar dengeliyken çoğu rakibe kaybediyor.
- **Tutarsız kombinasyonlar çok sert cezalandırılıyor.** Örnek: önde pres + derin hat. Bu kısmen kasıtlı (FM'de de böyle), ama ceza oranı tartışılabilir.
- **Ortalar ve kafa vuruşları nadir.** Orta mekaniği var, fakat değer modeli onu az seçiyor.
- Eşleşme sonuçları 30-40 maçlık örneklerden. Yaklaşık ±8 puanlık istatistiksel belirsizlik var.

## Yol haritası

1. Kısa pas oyununu ödüllendirmek: savunmacıların kayarken yorulması, üçüncü adam koşuları.
2. Oyuncu kimliği: hız, pas, bitiricilik gibi özelliklerin taktikle etkileşimi. Örneğin hızlı forvet + yüksek hatlı rakip.
3. Oyuncu rolleri: ters kanat, derin oyun kurucu, süpürücü kaleci, pres forveti.
4. Kenardan talimatlar: "kanatlara yüklen", "tempoyu düşür", "zaman geçir".
5. Kadro, değişiklik, kart, sakatlık; lig ve sezon modu.
6. Rakip analizi ekranı: rakibin son maçlarından ısı haritası ve top kaybı bölgeleri.
7. `balance.js` testlerini her değişiklikte otomatik çalıştırıp meta oluşumunu takip etmek.
