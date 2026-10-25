# Kenar Çizgisi — Oyuncu Özellikleri (öneri)

FM'e yakın, 1-20 ölçekli bir set. Karakteristik (kişilik ve oyuncu alışkanlıkları) bu belgenin dışında; ayrıca ele alınacak.

## Kurallar

1. **Her özellik motorda somut bir mekaniğe bağlıdır.** Hiçbir mekaniğe bağlı olmayan özellik süstür ve eklenmez. Her özellik için "bunu artırınca sahada ne değişir" sorusunun ölçülebilir bir cevabı olmalı.
2. **Mutlak iyi özellik yoktur (TASARIM.md).** Hız gibi saf avantajlar oyuncunun bütçesinden yer kaplar. Bazı özellikler de doğal bir bedel taşır ya da bir başka özelliğe ihtiyaç duyar: Topsuz Alan'ı iyi bir forvet, Vizyon'u zayıf bir pasörle değer kaybeder; Konsantrasyon'u düşük bir kadro prese ve maç sonlarına karşı savunmasızdır.
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

## Zihinsel (5) — kararlaştırıldı

Zihinsel özellikler az ve birbirini tamamlayan çiftler halinde:
- **Topsuz Alan ↔ Pozisyon Alma:** hücumda doğru yer ↔ savunmada doğru yer.
- **Topsuz Alan ↔ Vizyon:** biri pas seçeneğini yaratır, diğeri o seçeneği görür. Forvetin koşusu ne kadar iyi olursa olsun, pasörün vizyonu yoksa koşu görülmez.
- **Vizyon ↔ Karar Alma:** seçenekleri görmek ↔ aralarından doğrusunu seçmek.
- **Konsantrasyon:** hepsinin sahaya ne kadar yansıyacağını belirler.

| Özellik | Ne yapar | Motordaki mekanik |
|---|---|---|
| Topsuz Alan | Hücumda topla nerede buluşması gerektiğini bilmek ve ona göre hareket etmek. İyi olan oyuncu daha çok pas alma seçeneği yaratır. (FM'deki Önsezi'nin hücum tarafı da buradadır.) | Boş alan arama kalitesi; koşu zamanlaması (ofsayta düşmeme) |
| Pozisyon Alma | Savunmada doğru yerde durmak; markaj görevini yapmak (adamını ve koşucuyu kaçırmamak); pası okuyup araya girmek; ofsayt çizgisini korumak. (FM'deki Önsezi'nin savunma tarafı da buradadır.) | Savunma konumundaki hata; markaj sıkılığı; pası kesmede tepki süresi |
| Vizyon | Pas seçeneklerini, özellikle uzaktakileri görmek | Pasörün görebildiği en uzak seçenek; ara pas ve savunma arkası seçeneklerinin görünmesi |
| Karar Alma | Gördüğü seçenekler arasından doğrusunu seçmek | Karar gürültüsü. Hızlı tempo, kararı zayıf oyunculara daha çok hata yaptırır. |
| Konsantrasyon | Düşükse bütün teknik ve zihinsel yeteneklerin sahaya yansımasını engeller. Yüksekse düşüşler az etkiler. (FM'deki Soğukkanlılık'ın yerini alır.) | Aşağıdaki anlık konsantrasyon seviyesi |

### Konsantrasyon seviyesi

Her oyuncunun maç içinde yükselip alçalan bir **konsantrasyon seviyesi** olur. Bütün yeteneklerin sahadaki etkisi bu seviyeyle çarpılır.

- **Zamanla düşer:** Maç ilerledikçe ve yorgunlukla birlikte.
- **Olaylarla anlık düşer:** Takımı gol yediğinde; takımından biri kart (özellikle kırmızı) gördüğünde.
- **Baskıyla düşer:** Sürekli preslenmek konsantrasyonu biraz düşürür. Böylece pres, konsantrasyonu düşük takımlara karşı daha etkili olur.
- **Zamanla toparlanır.**
- **Konsantrasyon yeteneği** düşüşün hızını ve olaylardan ne kadar etkilendiğini belirler: yüksek yetenekli oyuncu az etkilenir, düşük yetenekli çok.
- **Dikkat:** Bütün yetenekleri etkilediği için kolayca "mutlak iyi özellik" haline gelebilir. Etkisi özellik önem testiyle ölçülüp sınırlanacak.

### Zihinsel olarak eklenmeyenler

- **Karakteristik grubunda konuşulacak:** Agresiflik, Cesaret, Yaratıcılık, Çalışkanlık, Liderlik. Liderlik için düşünülen mekanik: kaptanın ya da lider oyuncunun yakınındaki takım arkadaşlarının konsantrasyon düşüşünü azaltması.
- **Çıkarıldı:** Kararlılık, Takım Oyunu.
- **Birleştirildi:** Önsezi (hücum yarısı Topsuz Alan'a, savunma yarısı Pozisyon Alma'ya), Soğukkanlılık (Konsantrasyon'a).

## Fiziksel (6) — kararlaştırıldı

| Özellik | Ne yapar | Motordaki mekanik |
|---|---|---|
| Hız | Uzun mesafede azami hız | Azami koşu hızı. Topla koşarken Dripling ile birlikte çalışır. |
| Çeviklik | İlk adımlar, kısa mesafede hız alma ve koşarken hızlıca yön değiştirme | İvme: hızını ve yönünü ne kadar çabuk değiştirebildiği |
| Dayanıklılık | Maç içinde ne kadar geç ve zor yorulduğu | Maç içi kondisyon kaybı hızı |
| Zindelik | Maçlar arasında eski fiziksel kondisyonuna ne kadar hızlı döndüğü | Maçtan maça yorgunluk (TASARIM.md, A planı) |
| Güç | Omuz omuza mücadele, topu koruma, temasta ayakta kalma | Çarpışmada kimin itildiği; ikili mücadele; hava düellosunda pay |
| Zıplama | Havada topa yükselme | Hava düellosunda kimin topa ulaştığı (Boy ile birlikte). Ulaştıktan sonrası Kafa Vuruşu'dur. |

### Boy (oyuncu bilgisi)

Boy bir özellik değil, oyuncunun sabit bir bilgisidir (yaş ve ayak tercihi gibi). Ama özellikle kafa toplarında çok önemlidir: hava düellosunda Zıplama ile birlikte çalışır. Uzun oyuncu az zıplasa da topa ulaşabilir; kısa oyuncu iyi zıplayarak bunu kısmen telafi eder.

### Çiftler

- **Hız ↔ Çeviklik:** Farklı oyuncu tipleri. Hız savunma arkasına atılan topa ve kontraya, Çeviklik prese ve dar alanda oyuna yaslanır.
- **Dayanıklılık ↔ Zindelik:** Yoğun takvim ilkesinin iki yarısı. Dayanıklılığı yüksek ama Zindeliği düşük oyuncu bir maçta 90 dakika pres yapar ama üç gün sonra hazır değildir; tam tersi her maç oynar ama maç sonlarında düşer. Rotasyon kararını bu ikisi belirler.
- **Güç + Zıplama + Boy:** Hava topunu birlikte kazanırlar. Yerde topu korumak sadece Güç'tür.

### Hız'ın baskın olmaması için

FM'de Hız ve Hızlanma neredeyse her şeyi belirler. Bunu baştan önlemek için:
- Hızlı ama Dripling'i zayıf oyuncu topla o kadar hızlı koşamaz.
- Doğru yerde duran yavaş stoper (Pozisyon Alma), yanlış yerde duran hızlı stoperden iyi olmalıdır.
- Fiziksel özellikler yaşla teknik ve zihinsel olanlardan önce düşer.
- Özellik önem testiyle Hız'ın etkisi ölçülür, gerekirse sınırlanır.

### Fiziksel olarak eklenmeyenler

- **Denge:** Güç'e katıldı.
- **Hızlanma ve Çeviklik (FM'deki ayrı hâlleri):** Tek özellikte, Çeviklik adıyla birleşti.

## Kaleci (2) — kararlaştırıldı

Kaleciye özel yalnızca iki özellik vardır. Kaleci de saha oyuncularıyla aynı 20 özelliğe sahiptir; bunların bazıları kaleci için başka bir işe yarar. Böylece yeni ad öğrenmek gerekmez.

| Özellik | Ne yapar | Motordaki mekanik |
|---|---|---|
| Refleks | Şutu kurtarma: tepki süresi ve uzanabildiği mesafe | Şuta karşı kurtarış olasılığı ve uzanma menzili |
| Elle Kontrol | Topu elle tutabilme: şutu tutmak ya da sektirmek, ortayı tutmak ya da yumruklamak | Kurtarışta topu tutma ya da sektirme oranı (sektirilen top dönen topa yol açar) |

### Kalecilikte diğer özelliklerin rolü

| Kalecilik işi | Belirleyen özellikler |
|---|---|
| Birebir pozisyon | Refleks + Çeviklik + Pozisyon Alma |
| Doğru yerde durma, açı kapatma | Pozisyon Alma |
| Kaleden çıkma ve süpürme | Karar Alma (ne zaman çıkacağı) + Çeviklik (ne kadar çabuk ulaşacağı). Süpürme alanını taktikteki savunma hattı belirler. |
| Hava topları ve ceza sahası hakimiyeti | Boy + Zıplama + Elle Kontrol; ortaya çıkıp çıkmama kararı Karar Alma |
| Ayakla uzun vuruş ve elle atış | Uzun Pas / Orta |
| Kısa pasla oyun kurma | Pas |
| Geri pasları kontrol etme | İlk Dokunuş |
| Maç boyunca dikkat, gol yedikten sonra hata | Konsantrasyon |
| Savunmayı yönetme (FM'deki İletişim) | Gerekirse Liderlik (karakteristik grubunda) |

Bunun sonucu olarak farklı kaleci tipleri kendiliğinden ortaya çıkar: Pas'ı ve Karar Alma'sı iyi bir kaleci yüksek savunma hattının arkasını süpürür ve oyun kurar; Refleksi ve Boy'u iyi ama Pas'ı zayıf bir kaleci derin bloğun arkasında daha uygundur. Kaleci seçimi taktiğe bağlanır.

**Eklenmeyenler:** FM'deki Birebir, Kaleden Çıkma, Hava Hakimiyeti, Ceza Sahası Hakimiyeti, Yumruklama, Ayakla Vuruş, Atış, İletişim ve Eksantriklik ayrı özellik olarak yoktur; yukarıdaki tabloda karşılandıkları yer var.

## Gizli (3)

| Özellik | Mekanik |
|---|---|
| İstikrar | Maçtan maça performans dalgalanması (bütün özelliklere küçük rastgele sapma) |
| Büyük Maç | Önemli maçlarda performans sapması |
| Sakatlanma Eğilimi | Yorgunluk ve yükle artan sakatlık riskinin çarpanı |

## Taktik ile özellik ilişkisi (örnekler)

| Taktik ayarı | Yaslandığı özellikler | Kadroya uymazsa |
|---|---|---|
| Yüksek savunma hattı | Stoperlerin Hızı ve Çevikliği, Pozisyon Alma; kalecinin Karar Alma ve Çevikliği (süpürme) | Arkaya atılan her top tehlike |
| Yoğun pres | Dayanıklılık, Zindelik (yoğun takvimde), Çeviklik, Pozisyon Alma, Top Kapma; rakibin düşük Konsantrasyon ve İlk Dokunuşu presi güçlendirir | Erken yorulma, geçilen presçiler, yoğun takvimde çöküş |
| Kısa pas | Pas, İlk Dokunuş, Vizyon, Topsuz Alan, Konsantrasyon | Kendi yarı sahada top kaybı |
| Direkt / uzun top | Forvetin Hızı, Güç, Boy, Zıplama ve Kafa Vuruşu; pasörün Vizyonu | Havada kaybedilen toplar |
| Kanat oyunu | Uzun Pas / Orta, Dripling, Hız; ceza sahasında Kafa Vuruşu ve Zıplama | Boşa giden ortalar |
| Derin blok + kontra | Pozisyon Alma, Güç, Top Kapma; forvetin Hızı | Sürekli baskı altında kalma |
| Hızlı tempo | Karar Alma, Pas, Dayanıklılık | Aceleci hatalar |

## Uygulama sırası

1. **Motorda mekaniği zaten olanlar:** Pas, İlk Dokunuş, Dripling, Bitiricilik, Top Kapma, Hız, Çeviklik, Dayanıklılık, Karar Alma, Vizyon, Topsuz Alan, kalecinin Refleksi ve Elle Kontrolü. Bunlar mevcut mekaniğe bağlanır.
2. **Küçük yeni mekanik isteyenler:** Uzaktan Şut, Uzun Pas / Orta, Kafa Vuruşu (birleşik yetenek), Zıplama, Güç, Pozisyon Alma; kalecide çıkma kararı ve hava topları.
3. **Yeni sistem isteyenler:** Konsantrasyon seviyesi, Zindelik (maçtan maça yorgunluk), Boy, Duran Top (frikik, korner, penaltı mekaniği), kartlar, gizli özellikler, mevkiye göre bütçe (genel güç hesabı).
4. Her adımdan sonra özellik önem testi ve `saglik.js`.
