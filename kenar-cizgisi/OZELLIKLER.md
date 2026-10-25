# Kenar Çizgisi — Oyuncu Özellikleri (öneri)

FM'e yakın, 1-20 ölçekli bir set. Karakteristik (kişilik ve oyuncu alışkanlıkları) bu belgenin dışında; ayrıca ele alınacak.

## Kurallar

1. **Her özellik motorda somut bir mekaniğe bağlıdır.** Hiçbir mekaniğe bağlı olmayan özellik süstür ve eklenmez. Her özellik için "bunu artırınca sahada ne değişir" sorusunun ölçülebilir bir cevabı olmalı.
2. **Mutlak iyi özellik yoktur (TASARIM.md).** Hız gibi saf avantajlar oyuncunun bütçesinden yer kaplar. Bazı özellikler de doğal bir bedel taşır: çalışkan oyuncu daha çok yorulur, agresif oyuncu daha çok faul yapar, yaratıcı oyuncu daha çok top kaybeder.
3. **Taktikle etkileşim:** Her taktik ayarı belirli özelliklere yaslanır. Kadroya uymayan taktik çalışmaz. En iyi taktik kadroya göre değişir.
4. **Mevkiye göre bütçe:** Oyuncunun genel gücü, özelliklerin mevkiye göre ağırlıklı toplamıdır (FM'deki CA gibi). Bir oyuncu her şeyde 20 olamaz.
5. **Ölçülerek dengelenir:** `saglik.js`'in benzeri bir "özellik önem testi" her özelliği 8'den 16'ya çıkarıp etkisini ölçer. Birkaç özellik oyunu domine ediyorsa (FM'de Hız ve Hızlanma gibi) ağırlıklar düzeltilir.

## Teknik (9) — kararlaştırıldı

| Özellik | Ne yapar | Motordaki mekanik |
|---|---|---|
| Pas | Yerden kısa ve orta mesafe pasların isabeti ve istenen yere gitmesi. İsabet her zaman oyuncunun ayağı değildir: ara pasın iki savunmacının arasından geçmesi de buna bağlıdır. (Pası *görmek* Vizyon'dur; Pas onu *uygulamaktır*.) | Hedef noktaya göre pas açı ve hız sapması |
| Uzun Pas / Orta | Uzun pasların ve ortaların isabeti; topun istenen noktaya düşmesi | Havadan pasın ve ortanın düşüş noktası sapması |
| Uzaktan Şut | Ceza sahası dışından şutların isabeti ve hızı | Ceza sahası dışı şut sapması ve şut hızı |
| Bitiricilik | Ceza sahası içinde her türlü bitiricilik | Ceza sahası içi şut sapması |
| Dripling | Top sürme: çalım, top sürerken yavaşlamama, rakibin top çalmasına karşı koyma, daha hızlı top sürme | Top sürme hız çarpanı; ikili mücadelede topu kaptırmama |
| İlk Dokunuş | Topu alma ve kontrol etme; özellikle baskı altında, sert ya da havadan gelen toplarda | Pası kontrol olasılığı; baskı altında kontrol kaybı (pres buna yaslanır) |
| Kafa Vuruşu | Havada topla buluşunca kafayla yapılan şutun ve pasın isabeti. Bitiricilik ya da Pas ile birlikte çalışır. (Havada topa ulaşmak Zıplama ve Güç'tür; Kafa Vuruşu ulaştıktan sonrasıdır.) | Kafa şutu / pası sapması (birleşik yetenek) |
| Top Kapma | Rakipten topu kapma ihtimali. Düşükse başarısız top çalma girişimleri, gereksiz fauller ve kartlar | Müdahale başarısı; faul ve kart olasılığı |
| Duran Top | Korner, frikik ve penaltıda ilgili diğer yetenekle birlikte çalışarak başarıyı artırır | Birleşik yeteneğin yardımcı çarpanı |

### Birleşik yetenekler

Bazı durumlarda iki yetenek birlikte çalışır: ana yetenek belirleyicidir, yardımcı yetenek onu bir miktar artırır ya da düşürür.

**etkin yetenek = ana yetenek × (taban + (1 − taban) × yardımcı / 20)**, taban başlangıçta 0.85 (ayar dosyasında, test edilerek ayarlanır).

Örnek: Uzaktan Şut 20, Duran Top 5 olan oyuncunun frikik şutu 17.8 olur. Uzaktan şutu çok iyi olsa da duran topu iyi değilse başarısı bir derece düşer.

| Durum | Ana yetenek | Yardımcı yetenek |
|---|---|---|
| Direkt frikik | Uzaktan Şut (yakın mesafede Bitiricilik) | Duran Top |
| Korner, frikikten orta | Uzun Pas / Orta | Duran Top |
| Penaltı | Bitiricilik | Duran Top |
| Kafa şutu | Bitiricilik | Kafa Vuruşu |
| Kafa pası, kafayla uzaklaştırma | Pas | Kafa Vuruşu |

İleride form, zihinsel durum ve yorgunluk bütün yeteneklerin üstüne ayrı bir çarpan olarak eklenecek.

### Teknik olarak eklenmeyenler

- **Markaj:** Bir yetenek değil, bir görevdir. Görevi iyi yapma yeteneği zihinsel **Pozisyon Alma**'dır. Markaj ileride taktik talimatı olarak gelecek (adam adama / bölgesel, belirli bir oyuncuya özel markaj).
- **Genel Teknik:** İşlevi Dripling ve İlk Dokunuş'ta.
- **Uzun Taç:** Çok niş; gerekirse Duran Top'a katılır.
- **Zayıf Ayak:** Teknik değil, oyuncu özelliği; ileride ele alınabilir.

## Zihinsel (11)

| Özellik | Motordaki mekanik | Önem taşıdığı taktik | Bedeli |
|---|---|---|---|
| Karar Alma | Karar gürültüsü: doğru seçeneği seçme | Her şey | – |
| Vizyon | Görebildiği en uzak pas; ara pas ve savunma arkası seçenekleri | Direkt, ara pas | – |
| Önsezi | Pasa ve dönen topa tepki süresi; ara pası okuma | Pres, savunma | – |
| Soğukkanlılık | Baskı altında pas ve şut cezasının, tünel görüşünün azalması | Prese karşı, bitiricilik | – |
| Pozisyon Alma | Doğru yerde durma; markaj görevini yapma (adamını kaçırmama, koşucuyu takip); ofsayt çizgisini koruma | Yüksek hat, derin blok, adam adama | – |
| Topsuz Alan | Boş alan bulma; koşu zamanlaması (ofsayta düşmeme) | Ver-git, savunma arkası | – |
| Çalışkanlık | Pres ve geri dönüş koşusundaki sprint isteği | Yoğun pres | Daha çok yorulur |
| Konsantrasyon | Maç ilerledikçe ve yorgunlukta artan hata | Uzun maçlar, yoğun takvim | – |
| Agresiflik | Müdahale denemesi sıklığı | Pres | Daha çok faul |
| Takım Oyunu | Taktik şekle ve pres tetiklerine uyumun hassasiyeti | Karmaşık taktikler | – |
| Yaratıcılık | Riskli ama değerli seçenekleri tercih etme | Kapalı savunmayı açmak | Daha çok top kaybı |

## Fiziksel (7)

| Özellik | Motordaki mekanik | Önem taşıdığı taktik |
|---|---|---|
| Hız | Azami koşu hızı | Kontra, savunma arkası; yüksek hatta stoper |
| Hızlanma | İvme; ilk adımlar ve yön değişimi sonrası | Pres, kısa mesafe yarışları |
| Dayanıklılık | Maç içinde kondisyon kaybı hızı | Yoğun pres, yüksek tempo |
| Doğal Kondisyon | Maçlar arası toparlanma; yaşla düşüş (TASARIM.md, A planı) | Yoğun takvim |
| Güç | Omuz omuza mücadele, topu koruma, çarpışmada itilme | Hedef forvet, derin blok |
| Çeviklik | Ani yön değiştirme; top sürerken rakipten sıyrılma | Dar alanda oyun |
| Zıplama | Hava düellosunda yükselme | Orta, uzun top, duran top |

## Kaleci (7)

| Özellik | Motordaki mekanik |
|---|---|
| Refleks | Yakın mesafe şutta kurtarış olasılığı ve uzanma menzili |
| Birebir | Karşı karşıya pozisyonda kurtarış |
| Pozisyon | Açı kapatma konumundaki hata |
| Hava Hakimiyeti | Ortayı ve havadan gelen topu tutma |
| Kaleden Çıkma | Süpürme alanı; çıkma kararının doğruluğu (yüksek hatla ilişkili) |
| Topu Tutma | Kurtarışta topu tutma ya da sektirme oranı |
| Ayakla Oyun | Oyun kurma ve uzun vuruş isabeti |

## Gizli (3)

| Özellik | Mekanik |
|---|---|
| İstikrar | Maçtan maça performans dalgalanması (bütün özelliklere küçük rastgele sapma) |
| Büyük Maç | Önemli maçlarda performans sapması |
| Sakatlanma Eğilimi | Yorgunluk ve yükle artan sakatlık riskinin çarpanı |

## Taktik ile özellik ilişkisi (örnekler)

| Taktik ayarı | Yaslandığı özellikler | Kadroya uymazsa |
|---|---|---|
| Yüksek savunma hattı | Stoperlerin Hızı ve Hızlanması, Pozisyon Alma, kalecinin Kaleden Çıkması | Arkaya atılan her top tehlike |
| Yoğun pres | Dayanıklılık, Çalışkanlık, Hızlanma, Önsezi, Top Kapma | Erken yorulma, geçilen presçiler, yoğun takvimde çöküş |
| Kısa pas | Pas, İlk Dokunuş, Soğukkanlılık, Vizyon | Kendi yarı sahada top kaybı |
| Direkt / uzun top | Forvetin Hızı, Güç, Zıplama ve Kafası; pasörün Vizyonu | Havada kaybedilen toplar |
| Kanat oyunu | Uzun Pas / Orta, Dripling, Hız; ceza sahasında Kafa Vuruşu ve Zıplama | Boşa giden ortalar |
| Derin blok + kontra | Pozisyon Alma, Güç, Top Kapma; forvetin Hızı | Sürekli baskı altında kalma |
| Hızlı tempo | Karar Alma, Pas, Dayanıklılık | Aceleci hatalar |

## Uygulama sırası

1. **Motorda mekaniği zaten olanlar:** Pas, İlk Dokunuş, Dripling, Bitiricilik, Top Kapma, Hız, Hızlanma, Dayanıklılık, Karar Alma, Vizyon, Soğukkanlılık, Agresiflik, kaleci Refleks ve Kaleden Çıkma. Bunlar mevcut mekaniğe bağlanır.
2. **Küçük yeni mekanik isteyenler:** Uzaktan Şut, Uzun Pas / Orta, Kafa Vuruşu (birleşik yetenek), Zıplama, Güç, Pozisyon Alma, Önsezi, Topsuz Alan, Çalışkanlık, Konsantrasyon ve diğer kaleci özellikleri.
3. **Yeni sistem isteyenler:** Doğal Kondisyon (maçtan maça yorgunluk), Duran Top (frikik, korner, penaltı mekaniği), kartlar, gizli özellikler, mevkiye göre bütçe (genel güç hesabı).
4. Her adımdan sonra özellik önem testi ve `saglik.js`.
