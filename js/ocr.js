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
    malzeme: { type: 'string', description: 'Malzeme ve kalınlık, ör. "Suntalam 18mm beyaz". Yoksa boş.' },
    olcuBirimi: {
      type: 'string',
      enum: ['mm', 'cm'],
      description: 'Kâğıttaki ölçüler hangi birimde. 4 haneli sayılar (720, 2100) mm, 2-3 haneli (72, 210) cm demektir.',
    },
    parcalar: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['satirNo', 'en', 'boy', 'adet', 'bantKod', 'aciklama', 'okunanMetin', 'guven'],
        properties: {
          satirNo: { type: 'integer', description: 'Kâğıttaki kaçıncı satır (yukarıdan aşağı, 1den başlar).' },
          en: { type: 'number', description: 'Birinci ölçü, kâğıtta yazan birimde.' },
          boy: { type: 'number', description: 'İkinci ölçü, kâğıtta yazan birimde.' },
          adet: { type: 'integer', description: 'Kaç adet. Yazmıyorsa 1.' },
          bantKod: {
            type: 'string',
            description: 'Kenar bandı kodu: "1U1K", "2U2K", "2U1K", "1U", "2K", "4" (dört kenar) ya da "yok". Emin değilsen boş bırak.',
          },
          aciklama: { type: 'string', description: 'Parça adı/notu, ör. "kapak", "raf", "yan". Yoksa boş.' },
          okunanMetin: { type: 'string', description: 'O satırın kâğıtta yazdığı hâli, aynen. Kontrol için.' },
          guven: {
            type: 'string',
            enum: ['yuksek', 'orta', 'dusuk'],
            description: 'Bu satırı ne kadar net okudun.',
          },
        },
      },
    },
    notlar: {
      type: 'array',
      items: { type: 'string' },
      description: 'Kâğıtta ölçü dışında kalan, dikkat edilmesi gereken yazılar ve senin uyarıların.',
    },
  },
};

const YONERGE = `Sen bir mobilya fason kesim atölyesinde çalışıyorsun. Sana müşterinin
elle doldurduğu kesim listesinin fotoğrafı veriliyor. Görevin kâğıttaki ölçüleri
eksiksiz ve olduğu gibi çıkarmak.

Kurallar:
- Kâğıtta ne yazıyorsa onu yaz. Ölçüyü düzeltme, yuvarlama, tamamlama.
- Hiçbir satırı atlama. Üstü çizili satırları da atla ama notlar alanına yazdığını belirt.
- Olmayan satır uydurma. Sadece kâğıtta gördüğünü yaz.
- Okuyamadığın bir rakam varsa en olası değeri yaz ve o satırın guven değerini "dusuk" yap.
- Silik, üst üste binmiş, sonradan düzeltilmiş rakamlarda guven "orta" ya da "dusuk" olsun.
- okunanMetin alanına o satırın kâğıttaki hâlini aynen geçir; usta kâğıtla karşılaştıracak.

Kenar bandı: Türkiye'de uzun kenar "U", kısa kenar "K" ile yazılır.
"1U1K" = bir uzun bir kısa kenar bantlı. "2U2K" ya da "4" = dört kenar.
Kâğıtta parçanın yanına çizilmiş dikdörtgenin kenarları işaretlenmişse ya da
"1 uzun 1 kısa", "tek kenar", "çepeçevre" gibi yazılmışsa bunları bu koda çevir.
Kod anlaşılmıyorsa bantKod'u boş bırak, notlar'a yaz.

Ölçü birimi: Tek bir birim seç. 700, 2100 gibi 3-4 haneli sayılar milimetredir;
70, 210 gibi sayılar santimetredir. Karışıksa çoğunluğa göre karar ver ve
notlar'a yaz.

Adet: "x2", "/3", "2 ad", "2 tane" hepsi adettir. Yazmıyorsa 1.`;

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
