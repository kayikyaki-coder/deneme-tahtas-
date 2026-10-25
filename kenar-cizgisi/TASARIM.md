# Kenar Çizgisi — Tasarım İlkeleri

## Temel ilke: mutlak iyi taktik yoktur

Oyunda **tek bir mutlak iyi taktik olmamalı.** Maçı kazandıran şey, menajerin o maçın koşullarına en uygun taktiği bulmasıdır. Bir taktiğin değeri şunlara bağlı olmalı:

1. **Elimizdeki oyuncular.** Yavaş stoperlerle yüksek hat, kondisyonu düşük kadroyla yoğun pres, pası zayıf orta sahayla kısa pas oyunu işe yaramamalı.
2. **Rakibin taktiği ve oyuncuları.** Her planın yenebildiği ve yenildiği planlar olmalı.
3. **Bağlam.** Örnek: Arka arkaya yoğun maç takviminde yoğun pres ve çok koşmak oyuncuları yorar. Bir taktik o 90 dakika için faydalı olsa bile sonraki maçlarda yorgunluk oyuncuların becerilerini tam göstermesini engeller. Menajer bunu tartmalı: enerji saklamak mı, bu maça her şeyi vermek ve sonra rotasyon yapmak mı?

Her yeni özellik ve her motor değişikliği bu ilkeye göre değerlendirilir. Bir ayar ya da taktik her bağlamda en iyi çıkıyorsa, bu bir hatadır ve düzeltilmelidir.

## Nasıl kontrol ediyoruz

- `node saglik.js`: Her taktik ayarının her kademesinin bir etkisi, bir bedeli ve bir takası var mı?
- `node balance.js 12 --pool 19`: Her taktiğin onu yenen bir karşı taktiği var mı?
- Bir ayar "hep işe yarıyor" (meta riski) ya da "hep zarar veriyor" (tuzak) çıkarsa düzeltilir.

## İleride yapılacaklar (oyun geliştikçe)

**A. Maçtan maça yorgunluk**
- Her oyuncunun maçlar arasında taşınan bir fiziksel durumu olacak, maça bu durumla başlayacak.
- Maçtaki yük (koşu, sprint, pres) bu durumu düşürecek. Maçlar arasındaki her gün dayanıklılığa göre toparlanacak.
- Durum düştükçe sakatlanma riski artacak.
- Fikstür modu: yoğun ve seyrek maç takvimi, ilk 11 seçimi, rotasyon.

**B. Oyuncu özellikleri ile taktik etkileşimi**
- Farklı profillerde kadrolar olacak.
- Her taktik mekaniği ilgili özelliğe bağlanacak: yüksek hatta stoperin hızı, preste dayanıklılık, kısa pasta pas ve vizyon.
- Kadroya göre en iyi taktik değişmeli.

**C. Testlerin genişletilmesi**
- Takas testi "rakip × kadro profili × yorgunluk durumu" üzerinden yapılacak.
- Başarı ölçütü: Hiçbir taktik bütün bağlamlarda en iyi değil; her bağlamın en iyisi farklı.
- Örnek test: Yoğun pres dinlenmiş kadroyla kazandırıp 3 gün arayla oynanan üçüncü maçta kaybettiriyor mu?
