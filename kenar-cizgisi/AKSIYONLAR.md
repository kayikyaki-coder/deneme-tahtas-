# Kenar Çizgisi — Aksiyonlar ve Özellikler (taslak)

Oyundaki her aksiyonu hangi özelliklerin etkilediği. Özellik tanımları ve ölçek: OZELLIKLER.md.

## Üç hesaplama kalıbı

Her aksiyon bu üç kalıptan birini kullanır. Böylece sistem tutarlı kalır ve yeni bir aksiyon ya da perk eklemek motor kodu yazmayı değil, bir tabloya satır eklemeyi gerektirir.

**1. Tek özellik:** Seviye (1-10) doğrudan bir tablodan motor değerine çevrilir.
Örnek: Hız 8 → azami koşu hızı.

**2. Ana + yardımcı:** 10×10 birleşik tablo (OZELLIKLER.md). Ana yetenek belirleyicidir, yardımcı onu en fazla bir derece kaydırır.
Örnek: Frikik = Uzaktan Şut (ana) × Duran Top (yardımcı).

**3. Karşılıklı mücadele:** İki oyuncunun ilgili seviyelerinin **farkı** (−9 … +9) bir olasılık tablosundan başarıya çevrilir.
Örnek: Çalım atan Dripling 8, müdahale eden Top Kapma 6 → fark +2 → çalımın başarı olasılığı tablodan okunur.

**Her kalıpta ortak kurallar:**
- Bütün değerler ayar dosyasındaki tablolardadır ve testle ayarlanır.
- Konsantrasyon, yorgunluk, form ve moral seviyelere değil, gizli 1-100 değere etki eder (OZELLIKLER.md). Aksiyon hesabı her zaman o anki etkin seviyeyi kullanır.
- Bir aksiyonda en fazla bir ana ve bir yardımcı özellik olur. Üç özelliğin karıştığı yerlerde üçüncüsü sabit bir ±1 seviye düzeltmesi olarak eklenir (örnek: hava düellosunda Boy).
- Perkler bu hesapların üzerine ±1 seviye ya da koşullu çarpan olarak eklenir (PERKLER.md, ileride).

## Topla yapılan aksiyonlar

| Aksiyon | Kalıp | Ana | Yardımcı | Neyi belirler |
|---|---|---|---|---|
| Kısa / orta pas (yerden) | Tek | Pas | – | Hedef noktadan sapma (açı ve hız) |
| Ara pas (yerden, boşluğa) | Tek | Pas | – | Sapma; iki savunmacı arasından geçiş |
| Uzun pas (havadan) | Tek | Uzun Pas / Orta | – | Düşüş noktasının sapması |
| Orta | Tek | Uzun Pas / Orta | – | Düşüş noktasının sapması |
| Şut (ceza sahası içi) | Tek | Bitiricilik | – | Şut sapması |
| Şut (ceza sahası dışı) | Tek | Uzaktan Şut | – | Şut sapması ve şut hızı |
| Kafa şutu | Ana + yardımcı | Bitiricilik | Kafa Vuruşu | Şut sapması |
| Kafa pası, kafayla uzaklaştırma | Ana + yardımcı | Pas | Kafa Vuruşu | Sapma |
| Direkt frikik | Ana + yardımcı | Uzaktan Şut (yakında Bitiricilik) | Duran Top | Şut sapması |
| Korner, frikikten orta | Ana + yardımcı | Uzun Pas / Orta | Duran Top | Düşüş noktasının sapması |
| Penaltı | Ana + yardımcı | Bitiricilik | Duran Top | Şut sapması |
| Top sürme (açık alan) | Ana + yardımcı | Hız | Dripling | Topla koşu hızı: Dripling düşükse Hız'ın tamamı kullanılamaz |
| Çalım (rakibi geçme) | Karşılıklı | Dripling | – | Karşısında: müdahale edenin Top Kapma'sı |
| Topu koruma (sırtı dönük) | Karşılıklı | Güç | – | Karşısında: müdahale edenin Güç'ü |
| Topu kontrol etme (pası alma) | Tek | İlk Dokunuş | – | Kontrol olasılığı; baskı altında ve sert ya da havadan gelen topta düşer |

## Karar ve görme

| Aksiyon | Kalıp | Ana | Neyi belirler |
|---|---|---|---|
| Seçenekleri görme | Tek | Vizyon | Görebildiği en uzak pas; ara pas ve savunma arkası seçeneklerinin görünmesi |
| Seçenek seçme | Tek | Karar Alma | Karar gürültüsü: gördükleri arasından doğruyu seçme |

Not: Vizyon hangi seçeneklerin listeye gireceğini, Karar Alma listeden hangisinin seçileceğini belirler. Tempo taktiği Karar Alma'nın etkisini büyütür (hızlı tempoda hata payı artar).

## Topsuz aksiyonlar

| Aksiyon | Kalıp | Ana | Yardımcı | Neyi belirler |
|---|---|---|---|---|
| Hücumda boş alan bulma | Tek | Topsuz Alan | – | Boş alan aramanın kalitesi; pas alma seçeneği yaratma |
| Savunma arkasına koşu zamanlaması | Tek | Topsuz Alan | – | Ofsayta düşme olasılığı |
| Savunmada konum alma, markaj | Tek | Pozisyon Alma | – | Konum hatası; adamına ve koşucuya yakınlık |
| Pası okuyup araya girme | Ana + yardımcı | Pozisyon Alma | Çeviklik | Tepki süresi ve araya girme olasılığı |
| Ofsayt çizgisini koruma | Tek | Pozisyon Alma | – | Hattın dağılması (en zayıf savunmacı belirler) |
| Koşu (hız yarışı) | Tek | Hız | – | Azami hız |
| Çıkış, yön değiştirme | Tek | Çeviklik | – | İvme |
| Pres (topa basma) | Tek | Çeviklik | – | Topçuya ne çabuk ulaştığı; maliyeti Dayanıklılık'tan çıkar |

## Mücadele aksiyonları

| Aksiyon | Kalıp | Taraf A | Taraf B | Not |
|---|---|---|---|---|
| Müdahale (top kapma) | Karşılıklı | Top Kapma (savunan) | Dripling (topçu) | Kaybeden savunmacı kısa süre geçilmiş sayılır |
| Faul olasılığı | Tek | Top Kapma (düşük olan daha çok faul yapar) | – | Kart olasılığı da buradan |
| Hava düellosu (topa ulaşma) | Karşılıklı | Zıplama (+ Boy düzeltmesi) | Zıplama (+ Boy düzeltmesi) | Yardımcı olarak Güç: temasta yer tutma. Boy düzeltmesi örneği: 190 cm üstü +1, 172 cm altı −1. |
| Omuz omuza mücadele | Karşılıklı | Güç | Güç | Çarpışmada kimin itildiği |

Hava düellosunu kazandıktan sonraki kafa vuruşu ayrı bir aksiyondur (yukarıda: Kafa şutu / Kafa pası).

## Kaleci aksiyonları

| Aksiyon | Kalıp | Ana | Yardımcı | Neyi belirler |
|---|---|---|---|---|
| Şutu kurtarma | Karşılıklı | Refleks (kaleci) | Şutu çekenin şut seviyesi | Kurtarış olasılığı ve uzanma menzili |
| Birebir | Ana + yardımcı | Refleks | Pozisyon Alma | Karşı karşıya pozisyonda kurtarış |
| Topu tutma ya da sektirme | Tek | Elle Kontrol | – | Kurtarış sonrası top elde mi kalır, döner mi |
| Ortayı tutma / yumruklama | Ana + yardımcı | Elle Kontrol | Zıplama (+ Boy düzeltmesi) | Hava topunu alma |
| Açı kapatma | Tek | Pozisyon Alma | – | Konum hatası |
| Kaleden çıkma ve süpürme | Ana + yardımcı | Karar Alma | Çeviklik | Çıkma kararının doğruluğu ve topa ulaşma |
| Oyun kurma (kısa) | Tek | Pas | – | |
| Uzun vuruş, elle atış | Tek | Uzun Pas / Orta | – | |

## Süreklilik etkileri (aksiyon değil, gizli değere etki eder)

| Etki | Belirleyen özellik | Ne olur |
|---|---|---|
| Maç içi yorgunluk | Dayanıklılık | Koşu ve sprint kondisyonu düşürür; kondisyon bütün gizli değerleri çarpanla düşürür |
| Maçlar arası toparlanma | Zindelik | Maça başlarken kondisyon (TASARIM.md, A planı) |
| Konsantrasyon düşüşü | Konsantrasyon | Zamanla, yorgunlukla, olaylarla (gol yeme, kart) ve baskıyla düşer; bütün gizli değerleri çarpanla düşürür |

## Açık sorular

1. **Top sürme:** Hız ana, Dripling yardımcı mı (bu taslaktaki gibi), yoksa ikisi ayrı mı (topsuz hız = Hız, topla hız = Dripling)?
2. **Pres:** Topçuya ulaşmayı Çeviklik mi belirlesin, Hız mı? Kısa mesafe olduğu için Çeviklik önerildi.
3. **Şutu kurtarma:** Şutörün seviyesi kaleciyle karşılıklı mı karşılaştırılsın (bu taslaktaki gibi), yoksa şut sapması ve kalecinin Refleksi ayrı ayrı mı hesaplansın? Ayrı hesap daha "fiziksel", karşılıklı hesap daha basit.
4. **Hava düellosunda Boy:** Sabit ±1 düzeltme mi, yoksa boy aralıklarına göre bir tablo mu?
5. **Ayak:** Zayıf ayakla yapılan pas ve şutta seviye düzeltmesi (karakteristik grubunda konuşulacak).
