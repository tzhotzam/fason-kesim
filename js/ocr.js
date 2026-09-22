// Fotoğraftaki kesim listesini okur.
//
// Anthropic Messages API'ye doğrudan tarayıcıdan gidilir; arada sunucu yok,
// fotoğraf senin cihazından Anthropic'e gider, başka hiçbir yere uğramaz.
// API anahtarı yalnızca tarayıcının kendi deposunda durur.
//
// Yapılandırılmış çıktı (output_config.format) kullanıyoruz: model serbest
// metin değil, şemaya uyan JSON döndürmek zorunda. Böylece "bazen tabloyu
// düzgün, bazen paragraf hâlinde yazdı" derdi olmuyor.

const UCNOKTA = 'https://api.anthropic.com/v1/messages';
const SURUM = '2023-06-01';
export const MODEL = 'claude-opus-5';

// 1 Ağustos 2026 fiyatı, $/milyon jeton. Maliyet göstergesi için.
const FIYAT = { giris: 5.0, cikis: 25.0 };

export const SEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['musteri', 'malzeme', 'olcuBirimi', 'parcalar', 'notlar'],
  properties: {
    musteri: { type: 'string', description: 'Kâğıtta yazan müşteri/firma adı. Yoksa boş bırak.' },
    malzeme: { type: 'string', description: 'Malzeme/renk, ör. "Suntalam 18mm beyaz". Yoksa boş.' },
    olcuBirimi: {
      type: 'string',
      enum: ['mm', 'cm'],
      description: 'Kâğıttaki ölçülerin birimi. 29, 58, 79.5 gibi 2-3 haneli ve ondalıklı sayılar SANTİMETREDİR. 720, 2100 gibi 3-4 haneli tam sayılar milimetredir.',
    },
    parcalar: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['satirNo', 'olcu1', 'olcu2', 'adet', 'altCizgi1', 'altCizgi2', 'grup', 'aciklama', 'okunanMetin', 'guven'],
        properties: {
          satirNo: { type: 'integer', description: 'Kaçıncı satır. Sayfada birden çok sütun varsa önce sol sütunu baştan sona numarala, sonra sağ sütuna geç.' },
          olcu1: { type: 'number', description: 'Kâğıtta ÖNCE yazan ölçü, yazıldığı birimde, olduğu gibi.' },
          olcu2: { type: 'number', description: 'Kâğıtta SONRA yazan ölçü.' },
          adet: { type: 'integer', description: 'Kaç adet. "= 3" biçiminde yazılır. Yazmıyorsa 1.' },
          altCizgi1: {
            type: 'integer',
            enum: [0, 1, 2],
            description: 'BİRİNCİ ölçünün altındaki çizgi sayısı: 0 = çizgi yok, 1 = tek çizgi, 2 = çift (üst üste iki) çizgi. Bu bant demektir, çok dikkatli bak.',
          },
          altCizgi2: {
            type: 'integer',
            enum: [0, 1, 2],
            description: 'İKİNCİ ölçünün altındaki çizgi sayısı: 0, 1 ya da 2.',
          },
          grup: { type: 'string', description: 'Bu satırın üstünde, bir öbeğin başlığı olarak yazılmış malzeme/renk adı (ör. "Arbolit"). Başlık yoksa boş.' },
          aciklama: { type: 'string', description: 'Parça adı/notu, ör. "kapak", "raf". Yoksa boş.' },
          okunanMetin: { type: 'string', description: 'O satırın kâğıtta yazdığı hâli, aynen. Kontrol için.' },
          guven: {
            type: 'string',
            enum: ['yuksek', 'orta', 'dusuk'],
            description: 'Bu satırı ne kadar net okudun. Alt çizgiden emin değilsen en fazla "orta" ver.',
          },
        },
      },
    },
    notlar: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ölçü dışında kalan yazılar, öbek başlıkları, üstü çizili satırlar ve senin uyarıların.',
    },
  },
};

const YONERGE = `Sen bir mobilya fason kesim atölyesinde çalışıyorsun. Sana müşterinin
elle doldurduğu ölçü kâğıdının fotoğrafı veriliyor. Görevin kâğıttaki her satırı
eksiksiz ve olduğu gibi çıkarmak.

SATIR BİÇİMİ
Satırlar neredeyse her zaman şu kalıpta: ÖLÇÜ x ÖLÇÜ = ADET
  29 x 58 = 1        → 29 ve 58 ölçüler, 1 adet
  65.6 x 58 = 3      → 3 adet
  78.2 x 58 = 14     → 14 adet
Eşittirden sonraki sayı ADETTİR, ölçü değildir. Adet yazmıyorsa 1 yaz.

ALT ÇİZGİ = KENAR BANDI  (EN ÖNEMLİ KURAL)
Müşteri bandı, ölçünün ALTINI ÇİZEREK belirtir. Çizgi sayısı kenar sayısıdır:
  - Ölçünün altında çizgi yok  → o ölçünün hiçbir kenarı bantlanmaz (0)
  - Ölçünün altında TEK çizgi  → o ölçünün BİR kenarı bantlanır (1)
  - Ölçünün altında ÇİFT çizgi → o ölçünün İKİ kenarı da bantlanır (2)
Her iki ölçüyü ayrı ayrı incele; biri çizili öteki çizgisiz olabilir.
Defter kâğıdının kendi basılı çizgileriyle karıştırma: müşterinin çizdiği
çizgi sayının hemen altında, sayı kadar kısa ve elle çizilmiştir; defterin
çizgisi ise satır boyunca baştan sona gider.
Alt çizgiden emin değilsen o satırın guven değerini "orta" ya da "dusuk" yap
ve notlar'a yaz. Bant yanlış giderse parça çöpe gider, tahmin etme.

ÖLÇÜ BİRİMİ
Tek bir birim seç. 29, 58, 79.5, 25.4 gibi iki-üç haneli ve ondalıklı sayılar
SANTİMETREDİR. 720, 2100 gibi sayılar milimetredir. Karışıksa çoğunluğa göre
karar ver ve notlar'a yaz.

SAYFA DÜZENİ
Kâğıtta birden çok sütun olabilir. Önce SOL sütunu yukarıdan aşağı bitir,
sonra sağ sütuna geç; satırları kesintisiz numarala.
Bir öbeğin üstünde malzeme/renk adı yazıyorsa (ör. "Arbolit"), o başlığı
altındaki bütün satırların grup alanına yaz.

GENEL
- Kâğıtta ne yazıyorsa onu yaz. Ölçüyü düzeltme, yuvarlama, tamamlama.
- Hiçbir satırı atlama. Üstü çizili satırları alma ama notlar'a yaz.
- Olmayan satır uydurma. Sadece gördüğünü yaz.
- Okuyamadığın rakamda en olası değeri yaz ve guven değerini "dusuk" yap.
- okunanMetin alanına o satırın kâğıttaki hâlini aynen geçir; usta kâğıtla
  karşılaştıracak.`;

/** Anahtarın biçimi doğru mu? (Doğruluğunu sunucu söyler, bu sadece yazım denetimi.) */
export function anahtarGecerliBicimde(anahtar) {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(anahtar || '').trim());
}

/**
 * @param {Array<{base64: string, tur: string}>} gorseller
 * @param {string} anahtar  API anahtarı
 * @param {object} secenek  { ekBilgi: string, signal: AbortSignal }
 */
export async function fotograftanOku(gorseller, anahtar, secenek = {}) {
  if (!gorseller || !gorseller.length) throw new Error('Önce fotoğraf ekle.');
  if (!anahtar) throw new Error('API anahtarı girilmemiş.');

  const icerik = gorseller.map((g) => ({
    type: 'image',
    source: { type: 'base64', media_type: g.tur, data: g.base64 },
  }));
  icerik.push({
    type: 'text',
    text: gorseller.length > 1
      ? `Yukarıda aynı işe ait ${gorseller.length} sayfa var. Hepsini sırayla oku, satır numaralarını baştan sona kesintisiz ver.${ekNot(secenek.ekBilgi)}`
      : `Bu kesim listesini oku.${ekNot(secenek.ekBilgi)}`,
  });

  let yanit;
  try {
    yanit = await fetch(UCNOKTA, {
      method: 'POST',
      signal: secenek.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': anahtar,
        'anthropic-version': SURUM,
        // Tarayıcıdan doğrudan çağrı için gerekli; anahtar cihazda kalır.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system: YONERGE,
        output_config: { format: { type: 'json_schema', schema: SEMA } },
        messages: [{ role: 'user', content: icerik }],
      }),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('İnternete ulaşılamadı. Bağlantını kontrol et.');
  }

  if (!yanit.ok) throw new Error(await hataMesaji(yanit));

  const veri = await yanit.json();

  if (veri.stop_reason === 'max_tokens') {
    throw new Error('Liste tek seferde bitmedi (çok uzun). Kâğıdı iki fotoğrafa böl.');
  }
  if (veri.stop_reason === 'refusal') {
    throw new Error('Model bu görseli işlemeyi reddetti. Başka bir fotoğrafla dene.');
  }

  const cikti = ciktiyiAyikla(veri);
  if (!cikti) throw new Error('Yanıt okunamadı. Bir daha dene.');

  return {
    sonuc: cikti,
    kullanim: maliyet(veri.usage),
  };
}

function ekNot(bilgi) {
  const t = String(bilgi || '').trim();
  return t ? `\n\nUstadan ek bilgi: ${t}` : '';
}

/**
 * Yapılandırılmış çıktı parsed_output alanında gelir; gelmezse metin
 * bloğunu JSON olarak çözmeyi deneriz.
 */
function ciktiyiAyikla(veri) {
  if (veri.parsed_output) return veri.parsed_output;
  const metin = (veri.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!metin.trim()) return null;
  try {
    return JSON.parse(metin);
  } catch {
    const m = metin.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

async function hataMesaji(yanit) {
  let ayrinti = '';
  try {
    const g = await yanit.json();
    ayrinti = g?.error?.message || '';
  } catch { /* gövde JSON değilse boş geç */ }

  switch (yanit.status) {
    case 401:
    case 403:
      return 'API anahtarı kabul edilmedi. Anahtarı kontrol et.';
    case 400:
      return `İstek reddedildi${ayrinti ? `: ${ayrinti}` : '.'}`;
    case 413:
      return 'Fotoğraf çok büyük. Daha az sayfayla dene.';
    case 429:
      return 'Çok sık istek gönderildi ya da kredin bitti. Biraz bekleyip dene.';
    case 529:
      return 'Sunucu şu an yoğun. Birazdan tekrar dene.';
    default:
      if (yanit.status >= 500) return 'Sunucu hatası. Birazdan tekrar dene.';
      return `Beklenmeyen hata (${yanit.status})${ayrinti ? `: ${ayrinti}` : '.'}`;
  }
}

function maliyet(usage) {
  if (!usage) return null;
  const giris = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const cikis = usage.output_tokens || 0;
  const dolar = (giris / 1e6) * FIYAT.giris + (cikis / 1e6) * FIYAT.cikis;
  return { giris, cikis, dolar };
}
