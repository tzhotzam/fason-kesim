// Tek satırdan parça okuyan ayrıştırıcı.
//
// Amaç: kâğıda bakarken klavyeden gözünü kaldırmadan yazabilmek.
// Kabul edilen biçimler bilerek gevşek tutuldu; müşteri kâğıdı da gevşek.
//
//   29x58=1                 → 29×58, 1 adet   (müşteri kâğıtlarında en yaygın)
//   65.6x58=3 0/1           → 3 adet, ikinci ölçünün bir kenarı bantlı
//   600x400 2 1U1K          → 600×400, 2 adet, 1 uzun 1 kısa kenar bantlı
//   600*400 x2 4            → 4 kenar bant
//   600 400 2               → bantsız
//   600x400/3 2U2K d        → damar boy yönünde (çevrilemez)
//   600,5 x 400 1U          → ondalık virgülle de yazılır
//   600x400 2 1U1K // kapak → açıklama

import { yeniParca, bantKodCoz, yuvarla } from './olcu.js';

const SAYI = String.raw`\d+(?:[.,]\d+)?`;

/** Ondalık virgülü noktaya çevirip sayıya döndürür. */
function sayi(s) {
  return Number(String(s).replace(',', '.'));
}

/**
 * Bir satırı çözer.
 * @returns {{ok: boolean, parca?: object, hata?: string, uyarilar: string[]}}
 */
export function satirCoz(ham, ayar = {}) {
  const uyarilar = [];
  let satir = String(ham || '').trim();
  if (!satir) return { ok: false, hata: 'boş', uyarilar };

  // Açıklama: // ya da # sonrası
  let aciklama = '';
  const yorum = satir.match(/(?:\/\/|#)(.*)$/);
  if (yorum) {
    aciklama = yorum[1].trim();
    satir = satir.slice(0, yorum.index).trim();
  }

  // Satır başındaki sıra numarasını ("3)" , "3." , "3-") at.
  satir = satir.replace(/^\s*\d{1,3}\s*[).:-]\s+/, '');

  let T = satir.toLocaleUpperCase('tr');

  // "29x58=1" — eşittirden sonrası adet. Müşteri kâğıtlarında en yaygın
  // yazım bu ve daha önce hiç tanınmıyordu: program sessizce "1 adet"
  // sayıyordu, yani 14 adetlik satır 1 adet olarak geçiyordu.
  let esittenAdet = null;
  const esit = T.match(new RegExp(`=\\s*(${SAYI})`));
  if (esit) {
    esittenAdet = sayi(esit[1]);
    T = (T.slice(0, esit.index) + ' ' + T.slice(esit.index + esit[0].length)).trim();
  }

  // 1) Ölçü: EN x BOY
  let m = T.match(new RegExp(`(${SAYI})\\s*[X*\\/×]\\s*(${SAYI})`));
  let kalan;
  if (m) {
    kalan = (T.slice(0, m.index) + ' ' + T.slice(m.index + m[0].length)).trim();
  } else {
    // Ayraçsız iki sayı: "600 400 2"
    m = T.match(new RegExp(`^\\s*(${SAYI})\\s+(${SAYI})\\b`));
    if (!m) return { ok: false, hata: 'Ölçü bulunamadı (600x400 gibi yaz).', uyarilar };
    kalan = T.slice(m[0].length).trim();
  }

  const carpan = ayar.birim === 'cm' ? 10 : 1;
  let en = yuvarla(sayi(m[1]) * carpan);
  let boy = yuvarla(sayi(m[2]) * carpan);

  if (!(en > 0) || !(boy > 0)) {
    return { ok: false, hata: 'Ölçü sıfır ya da negatif.', uyarilar };
  }
  // 10 metreden büyük ölçü büyük ihtimalle cm/mm karışıklığıdır.
  if (en > 10000 || boy > 10000) uyarilar.push('Ölçü 10 metreden büyük — birim karışmış olabilir.');
  // 30 mm'den küçük ölçü büyük ihtimalle cm yazılmıştır.
  if (Math.max(en, boy) < 30 && carpan === 1) {
    uyarilar.push('Ölçü çok küçük — cm yazdıysan birim ayarını cm yap.');
  }

  // 2) Kalan parçalar: adet, bant kodu, damar
  let adet = null;
  let bantKod = null;
  let damar = 'serbest';

  for (const jeton of kalan.split(/[\s,;]+/).filter(Boolean)) {
    // "X2" / "*2" / "ADET2"
    let a = jeton.match(new RegExp(`^[X*]\\s*(${SAYI})$`));
    if (a) { adet = sayi(a[1]); continue; }
    a = jeton.match(new RegExp(`^(${SAYI})\\s*(?:AD|ADET|TANE)$`));
    if (a) { adet = sayi(a[1]); continue; }
    // "600x400/3" — ölçüden sonra bölü işaretiyle adet. Kâğıtta çok yaygın.
    a = jeton.match(new RegExp(`^\\/(${SAYI})$`));
    if (a) { adet = sayi(a[1]); continue; }

    // "1/0", "2-1" — birinci/ikinci ölçüden kaçar kenar bantlı
    a = jeton.match(/^([0-2])[/-]([0-2])$/);
    if (a && bantKod === null) { bantKod = `[${a[1]}|${a[2]}]`; continue; }

    if (jeton === 'D' || jeton === 'DAMAR' || jeton === 'DAMARLI') { damar = 'boy'; continue; }
    if (jeton === 'S' || jeton === 'SERBEST') { damar = 'serbest'; continue; }
    if (jeton === 'AD' || jeton === 'ADET' || jeton === 'TANE') continue;

    // Çıplak sayı → adet (henüz yoksa)
    if (adet === null && new RegExp(`^${SAYI}$`).test(jeton) && !/^[01]{4}$/.test(jeton)) {
      const v = sayi(jeton);
      // "4" tek başına hem 4 adet hem 4 kenar bant demek olabilir. Adet
      // yazılmadığı sürece çıplak sayıyı adet sayıyoruz; 4 kenar bant için
      // "4K" yazılır. Belirsizlik burada bitsin diye kuralı sabitledik.
      adet = v;
      continue;
    }

    if (bantKod === null) { bantKod = jeton; continue; }
    uyarilar.push(`Anlaşılmayan bölüm atlandı: "${jeton}"`);
  }

  if (adet === null && esittenAdet !== null) adet = esittenAdet;
  if (adet === null) adet = 1;
  if (!Number.isInteger(adet) || adet <= 0) {
    return { ok: false, hata: `Adet anlaşılmadı: ${adet}`, uyarilar };
  }

  const coz = bantKodCoz(bantKod, en, boy);
  if (coz.uyari) uyarilar.push(coz.uyari);

  return {
    ok: true,
    uyarilar,
    parca: yeniParca({ en, boy, adet, bant: coz.bant, damar, aciklama }),
  };
}

/** Çok satırlı metni çözer; boş satırları atlar, hatalıları ayrı döndürür. */
export function metinCoz(metin, ayar = {}) {
  const parcalar = [];
  const hatalar = [];
  const satirlar = String(metin || '').split(/\r?\n/);
  satirlar.forEach((s, i) => {
    if (!s.trim()) return;
    const r = satirCoz(s, ayar);
    if (r.ok) {
      // Ham satır her zaman saklanır: tabloda "yazdığın hâli" sütununda
      // durup karşılaştırmayı kolaylaştırıyor.
      r.parca.kaynak = {
        satir: i + 1,
        metin: s.trim(),
        guven: r.uyarilar.length ? 'orta' : '',
        notlar: r.uyarilar,
      };
      parcalar.push(r.parca);
    } else {
      hatalar.push({ satirNo: i + 1, metin: s, hata: r.hata });
    }
  });
  return { parcalar, hatalar };
}
