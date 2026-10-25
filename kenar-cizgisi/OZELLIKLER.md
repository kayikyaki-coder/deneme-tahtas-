# Kenar Çizgisi — Oyuncu Özellikleri (öneri)

FM'e yakın, 1-20 ölçekli bir set. Karakteristik (kişilik ve oyuncu alışkanlıkları) bu belgenin dışında; ayrıca ele alınacak.

## Kurallar

1. **Her özellik motorda somut bir mekaniğe bağlıdır.** Hiçbir mekaniğe bağlı olmayan özellik süstür ve eklenmez. Her özellik için "bunu artırınca sahada ne değişir" sorusunun ölçülebilir bir cevabı olmalı.
2. **Mutlak iyi özellik yoktur (TASARIM.md).** Hız gibi saf avantajlar oyuncunun bütçesinden yer kaplar. Bazı özellikler de doğal bir bedel taşır: çalışkan oyuncu daha çok yorulur, agresif oyuncu daha çok faul yapar, yaratıcı oyuncu daha çok top kaybeder.
3. **Taktikle etkileşim:** Her taktik ayarı belirli özelliklere yaslanır. Kadroya uymayan taktik çalışmaz. En iyi taktik kadroya göre değişir.
4. **Mevkiye göre bütçe:** Oyuncunun genel gücü, özelliklerin mevkiye göre ağırlıklı toplamıdır (FM'deki CA gibi). Bir oyuncu her şeyde 20 olamaz.
5. **Ölçülerek dengelenir:** `saglik.js`'in benzeri bir "özellik önem testi" her özelliği 8'den 16'ya çıkarıp etkisini ölçer. Birkaç özellik oyunu domine ediyorsa (FM'de Hız ve Hızlanma gibi) ağırlıklar düzeltilir.

## Teknik (10)

| Özellik | Motordaki mekanik | Önem taşıdığı taktik |
|---|---|---|
| Pas | Pas açı sapması ve hız hatası | Kısa pas, her şey |
| İlk Dokunuş | Topu kontrol olasılığı; baskı altında kontrol kaybı | Prese karşı oyun kurma |
| Top Sürme | Top sürme hızı; ikili mücadelede rakibi geçme | Kanat oyunu, kontra |
| Bitiricilik | 16 m içinden şut sapması | Her şey |
| Uzaktan Şut | 16 m dışından şut sapması ve şut isteği | Derin bloğa karşı |
| Orta | Orta isabeti | Kanat oyunu |
| Kafa Vuruşu | Kafa şutunun isabeti; hava düellosunda pay | Orta, uzun top, duran top |
| Top Kapma | Müdahale başarısı; başarısız olunca geçilme | Pres, savunma |
| Markaj | Markajın sıkılığı ve koşucuyu takip | Adam adama, derin blok |
| Duran Top | Penaltı, serbest vuruş, korner (ileride üçe ayrılabilir) | Duran top |

## Zihinsel (11)

| Özellik | Motordaki mekanik | Önem taşıdığı taktik | Bedeli |
|---|---|---|---|
| Karar Alma | Karar gürültüsü: doğru seçeneği seçme | Her şey | – |
| Vizyon | Görebildiği en uzak pas; ara pas ve savunma arkası seçenekleri | Direkt, ara pas | – |
| Önsezi | Pasa ve dönen topa tepki süresi; ara pası okuma | Pres, savunma | – |
| Soğukkanlılık | Baskı altında pas ve şut cezasının, tünel görüşünün azalması | Prese karşı, bitiricilik | – |
| Pozisyon Alma | Savunma konumundaki hata; ofsayt çizgisini koruma | Yüksek hat, derin blok | – |
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
| Kanat oyunu | Orta, Top Sürme, Hız; ceza sahasında Kafa ve Zıplama | Boşa giden ortalar |
| Derin blok + kontra | Markaj, Pozisyon Alma, Güç; forvetin Hızı | Sürekli baskı altında kalma |
| Hızlı tempo | Karar Alma, Pas, Dayanıklılık | Aceleci hatalar |

## Uygulama sırası

1. **Motorda mekaniği zaten olanlar:** Pas, İlk Dokunuş, Top Sürme, Bitiricilik, Top Kapma, Hız, Hızlanma, Dayanıklılık, Karar Alma, Vizyon, Soğukkanlılık, Agresiflik, kaleci Refleks ve Kaleden Çıkma. Bunlar mevcut mekaniğe bağlanır.
2. **Küçük yeni mekanik isteyenler:** Uzaktan Şut, Kafa Vuruşu, Zıplama, Güç, Markaj, Önsezi, Topsuz Alan, Çalışkanlık, Konsantrasyon, Orta ve diğer kaleci özellikleri.
3. **Yeni sistem isteyenler:** Doğal Kondisyon (maçtan maça yorgunluk), Duran Top, gizli özellikler, mevkiye göre bütçe (genel güç hesabı).
4. Her adımdan sonra özellik önem testi ve `saglik.js`.
