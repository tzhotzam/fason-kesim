# Fason Kesim — Ölçü Okuyucu

Müşterinin elle doldurduğu kesim listesinin **fotoğrafını çek**, ölçüler
tabloya insin, **Excel'e aktar**. Kâğıttaki 60 satırı tek tek tuşlamak yok.

Tamamı tarayıcıda çalışır: sunucu yok, kurulum yok. Telefonda açılır, ana
ekrana eklenince uygulama gibi durur.

> Program bir yardımcıdır, usta değil. **Kesmeden önce ölçüleri kâğıtla
> karşılaştır.** El yazısı okumada hata payı her zaman vardır; program emin
> olamadığı satırı sarı/kırmızı boyar ama her hatayı kendi yakalayacağını
> garanti etmez.

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

### Elle satır ekleme

Tablonun altındaki kutuya kısa yazım:

```
720x570 10 1U1K      → 720×570, 10 adet, 1 uzun 1 kısa kenar bantlı
600*400 x2 4K        → 4 kenar bant
1200x600/3 2U2K d    → 3 adet, dört kenar, damar boy yönünde (çevrilemez)
600,5 x 400          → ondalık virgülle de olur
3) 720x450 6 // raf  → baştaki sıra no atılır, // sonrası açıklama
```

Ayraç olarak `x`, `*`, `/`, `×` ya da boşluk çalışır. Adet `x2`, `/3`,
`2 ad` ya da çıplak sayı olabilir.

**Bant kodu:** `U` = uzun kenar, `K` = kısa kenar. `1U1K`, `2U1K`, `1U`,
`2K` … Dört kenar için `4` ya da `4K`. Hangi kenar olduğunu tam yazmak
istersen `[üst alt sol sağ]` biçiminde: `[1010]`.

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
- **Bant kodu denetimi** — anlaşılmayan kod ve "3 uzun kenar" gibi
  imkânsız kodlar uyarı verir.
- **Eksik satır Excel'e girmez** — ölçüsü ya da adedi eksik satırlar dışarıda
  kalır ve özet satırında kaç tane olduğu yazar.

Excel dosyası gerçek `.xlsx`'tir: sayılar sayı olarak gider (CSV'nin
"hepsi tek sütuna düştü", "ölçüler metne döndü" derdi yok), başlık satırı
dondurulmuş ve süzgeç açık gelir.

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
