# Fason Kesim — Ölçü Okuyucu

Müşteri ölçü kâğıdını, **kesim makinesinin istediği Excel biçimine** çevirir.

İki yolu var:

1. **Elle gir (ücretsiz)** — kâğıtta ne yazıyorsa aynen yazarsın:
   `29x58=1`, `65.6x58=3 0/1`. Program bu yazımı bilir. İnternet bile
   gerekmez. **Asıl yol budur.**
2. **Fotoğraftan oku (isteğe bağlı, ücretli)** — kâğıdın fotoğrafını
   çekersin, yapay zekâ ölçüleri kendi okur. Kolaylık olsun diye; kendi
   Anthropic hesabın ve sayfa başı 3–8 sent gerekir.

İkisi de aynı tabloya düşer, aynı Excel'i üretir. Otomatik okuma yalnızca
yazma zahmetini azaltır — programın yapabildiklerini değiştirmez.

Tamamı tarayıcıda çalışır: sunucu yok, kurulum yok. Telefonda açılır, ana
ekrana eklenince uygulama gibi durur.

> Program bir yardımcıdır, usta değil. **Kesmeden önce ölçüleri kâğıtla
> karşılaştır.**

---

## Nasıl kullanılır

1. **Fotoğraf** — kâğıdı çek ya da galeriden seç. Birden çok sayfa
   ekleyebilirsin; hepsi tek listede birleşir.
2. **Oku** — API anahtarını bir kez girersin (aşağıda), sonra "Ölçüleri oku".
   Yoğun bir kâğıt yarım dakika sürebilir.
3. **Kontrol et** — tablo açılır. Her satırın yanında kâğıtta ne yazdığı
   durur, karşılaştırman için. Şüpheli satırlar renkli. Düzeltirsin.
4. **İndir** — `⬇ Excel (.xlsx)` ya da CSV. "Panoya kopyala" dersen açık
   duran Excel'e doğrudan yapıştırabilirsin.

Yazdığın liste tarayıcıda saklanır; sayfayı yanlışlıkla kapatırsan geri gelir.

### Kâğıt nasıl okunuyor

Program, müşteri kâğıtlarındaki yaygın yazımı bilir:

```
29 x 58 = 1        → 29×58 cm, 1 adet
65.6 x 58 = 3      → 3 adet
78.2 x 58 = 14     → 14 adet
```

**Eşittirden sonraki sayı adettir**, ölçü değil.

**Alt çizgi = kenar bandı.** Müşteri bandı, ölçünün altını çizerek belirtir:

| Kâğıtta | Anlamı |
|---|---|
| ölçünün altı boş | o ölçünün hiçbir kenarı bantlanmaz |
| ölçünün altında **tek** çizgi | o ölçünün **bir** kenarı bantlanır |
| ölçünün altında **çift** çizgi | o ölçünün **iki** kenarı da bantlanır |

İki ölçü ayrı ayrı değerlendirilir; biri çizili öteki çizgisiz olabilir. Bu,
makine şablonundaki ikişer `BAND BOY` / `BAND EN` sütununa birebir oturur.

**Birim:** 29, 58, 79.5 gibi iki-üç haneli ve ondalıklı sayılar santimetre
sayılır; 720, 2100 gibi sayılar milimetre. Program hangisi olduğunu söyler,
yanılırsa tablodan değiştirirsin.

**Sayfada iki sütun varsa** önce sol, sonra sağ okunur. Bir öbeğin üstünde
malzeme adı yazıyorsa (ör. "Arbolit") o ad, altındaki satırların
**Plaka / grup** sütununa geçer ve makine dosyasında `PLAKA RENK` olur.

### Elle satır ekleme

Tablonun altındaki kutuya kısa yazım:

```
65.6x58=3            → 65.6×58, 3 adet, bantsız
65.6x58=3 0/1        → ikinci ölçünün 1 kenarı bantlı
78.2x58=14 2/0       → birinci ölçünün 2 kenarı bantlı
72.7x22.7=1 2/2      → dört kenar da bantlı
60x58=1 // kapak     → // sonrası açıklama
```

Bant yazımı `birinci/ikinci`: kâğıttaki çizgi sayısının karşılığı.
Ayraç olarak `x`, `*`, `/`, `×` ya da boşluk çalışır; adet `=3`, `x3`, `/3`
ya da çıplak sayı olabilir. Eski `1U1K` yazımı da kabul edilir.


---

## API anahtarı

Okuma işini Anthropic'in Claude modeli (`claude-opus-5`) yapıyor.

- Anahtarı <https://console.anthropic.com/settings/keys> adresinden alırsın.
- Tarayıcının kendi deposunda durur, hiçbir sunucuya gönderilmez; fotoğraf
  doğrudan senin cihazından Anthropic'e gider, arada başka yer yoktur.
- **Ama:** anahtar o cihazda açık duruyor demektir. Telefonu/bilgisayarı
  başkasına veriyorsan "Sil" düğmesine bas. Anahtarı kimseyle paylaşma;
  Console'dan istediğin zaman iptal edip yenisini alabilirsin.

**Maliyet:** bir sayfa kâğıt aşağı yukarı **3–8 sent** (yaklaşık 1–3 ₺)
tutuyor. Her okumadan sonra o okumanın kaç para tuttuğu ekranda yazar.

---

## Fotoğraf nasıl çekilmeli

| Yap | Yapma |
|---|---|
| Kâğıdı düz yere koy, tepeden çek | Eğik açıdan, masanın kenarından çekme |
| Gölge düşmesin, gün ışığı iyi | Kendi gölgen kâğıdın üstüne düşmesin |
| Kâğıt kareye tam otursun | Yarısı kadraj dışında kalmasın |
| Çok kalabalık kâğıdı **ikiye böl** — üst yarı bir fotoğraf, alt yarı bir fotoğraf | 80 satırı tek karede sıkıştırma |

Son satır önemli: program fotoğrafı uzun kenarı 1568 piksele indiriyor
(model zaten bundan fazlasını kullanmıyor). 80 satırlık bir kâğıtta her
rakam birkaç piksele düşer ve okunurluk düşer. İkiye bölünce her yarı iki
kat çözünürlükte gider, okuma belirgin şekilde düzelir.

---

## Program neye dikkat ediyor

- **Şüpheli satır işaretleme** — model her satır için ne kadar emin
  olduğunu söylüyor; orta/düşük olanlar renkli çıkıyor.
- **Kâğıtta yazan** sütunu — o satırın kâğıttaki hâli aynen duruyor,
  karşılaştırması kolay olsun diye.
- **Birim tutarsızlığı** — mm seçiliyken 45 gibi bir ölçü, cm seçiliyken
  2100 gibi bir ölçü uyarı alır. Bu en sık yapılan hata.
- **Bantsız satır uyarısı** — makine dosyasını indirirken hiç bandı olmayan
  satır varsa söyler; bant yanlış giderse parça çöpe gider.
- **Eksik satır Excel'e girmez** — ölçüsü ya da adedi eksik satırlar dışarıda
  kalır ve özet satırında kaç tane olduğu yazar.

Excel dosyası gerçek `.xlsx`'tir: sayılar sayı olarak gider (CSV'nin
"hepsi tek sütuna düştü", "ölçüler metne döndü" derdi yok), başlık satırı
dondurulmuş ve süzgeç açık gelir.

---

## Makine Excel'i

`⬇ Makine Excel'i` düğmesi, optimizasyon programının beklediği şablonla
birebir aynı sütun düzeninde dosya üretir:

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PLAKA RENK | PLAKA ÖLÇÜ | ÖLÇÜ BOY | ÖLÇÜ EN | ÖLÇÜ ADET | *(boş)* | *(boş)* | YÖN | BAND BOY | BAND BOY | BAND EN | BAND EN |

Dikkat edilecek iki nokta:

- **Makine önce BOY sonra EN istiyor.** Kâğıtta hangisinin önce yazıldığı
  müşteriye göre değişiyor, bu yüzden "Kâğıttaki ilk sayı" ayarı var.
  Yanlış sıra, parça kesilene kadar fark edilmeyecek bir hatadır — tablonun
  sütun başlıkları da bu ayara göre değişir ki gözden kaçmasın.
- **Dört ayrı bant sütunu.** `BAND BOY` ikilisi boy uzunluğundaki iki kenar,
  `BAND EN` ikilisi en uzunluğundaki iki kenar. Programdaki `1U1K` kodu
  bu dört hücreye açılır.

"Makine Excel'i ayarları" bölümünden PLAKA RENK / PLAKA ÖLÇÜ, bantlı
kenara yazılacak işaret ve YÖN sütununun yazımı ayarlanır; bir kez
girilir, cihazda kalır.

---

## Kurulum

Kurulum yok. <https://tzhotzam.github.io/fason-kesim/> adresini aç.

Telefonda ana ekrana eklemek için: Safari'de paylaş → "Ana Ekrana Ekle";
Chrome'da menü → "Uygulamayı yükle". Bir kez açtıktan sonra internetsiz de
açılır — ama **okuma** için internet gerekir (model bulutta çalışıyor).

---

## Dosya düzeni

| Dosya | İş |
|---|---|
| `js/ocr.js` | Fotoğrafı Claude'a yollar, şemaya uyan JSON alır |
| `js/foto.js` | Fotoğrafı küçültür, döndürür, base64'e çevirir |
| `js/xlsx.js` | `.xlsx` ve CSV yazar — dış kütüphane yok, zip'i kendi kurar |
| `js/olcu.js` | Kenar bandı / ölçü matematiği, doğrulama |
| `js/parse.js` | `720x570 10 1U1K` gibi satırları çözer |
| `js/makine.js` | Makinenin şablonuna birebir uyan Excel çıktısı |
| `js/main.js` | Arayüz |
| `js/depo.js` | Tarayıcı deposu (anahtar, son liste) |
| `js/yerlesim.js` | **Henüz arayüze bağlı değil** — levha yerleşimi ve fire hesabı, sırada beklesin diye duruyor |

**Testler**

```
node tests/fason.test.mjs   # hesap/ayrıştırma/Excel — bağımlılık yok
node tests/e2e.mjs          # gerçek tarayıcıda uçtan uca (Playwright ister)
```

Tarayıcı testi Anthropic'e giden isteği yakalayıp sahte yanıtla karşılar;
gerçek anahtar ve gerçek para harcamaz ama fotoğraf yükleme, okuma, tablo
ve Excel üretmenin tamamını gerçekten çalıştırır. Playwright kurulu değilse
kendini atlar:

```
npm install && npx playwright install chromium
```

Uygulamanın kendisinin hiçbir bağımlılığı yok; `package.json` yalnızca bu
test için duruyor.

---

## Sırada ne var (istersen)

`js/yerlesim.js` hazır ve test edilmiş durumda: giyotin (panel testere)
kesim düzeni çıkarıyor, testere kertiğini ve damar yönünü hesaba katıyor,
kaç levha gideceğini ve fire oranını söylüyor. Arayüze bağlanması yarım
günlük iş. `js/olcu.js` de bitmiş/ham ölçü dönüşümünü, bant metresini ve
m² başı fiyatlamayı zaten yapıyor.

Yani teklif çıkarma, kesim planı çizimi ve atölye etiketi için altyapı
duruyor — sen "hadi" de yeter.
