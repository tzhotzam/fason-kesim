// Makinenin beklediği Excel biçimi.
//
// Sütun düzeni ustanın gönderdiği şablondan birebir alındı:
//
//   A PLAKA RENK | B PLAKA ÖLÇÜ | C ÖLÇÜ BOY | D ÖLÇÜ EN | E ÖLÇÜ ADET
//   F (boş) | G (boş) | H YÖN | I BAND BOY | J BAND BOY | K BAND EN | L BAND EN
//
// İki şey burada kritik:
//
// 1. Makine ÖNCE BOY sonra EN istiyor; kâğıtta ölçüler çoğu zaman bu sırada
//    yazılır ama her müşteri aynı değil. Bu yüzden "kâğıttaki ilk sayı"nın
//    ne olduğu ayarlanabilir — yanlış sırada gönderilen bir liste, kesilene
//    kadar fark edilmeyecek bir hatadır.
//
// 2. BAND BOY iki, BAND EN iki sütun: her kenar ayrı hücre. "BAND BOY"
//    boy uzunluğundaki iki kenar, "BAND EN" en uzunluğundaki iki kenar.
//    Hücreye ne yazılacağı (X mi, kalınlık mı, bant kodu mu) makineden
//    makineye değişir; ayardan verilir.

import { bantKodCoz } from './olcu.js';

export const MAKINE_BASLIKLAR = [
  'PLAKA RENK', 'PLAKA ÖLÇÜ', 'ÖLÇÜ BOY', 'ÖLÇÜ EN', 'ÖLÇÜ ADET',
  '', '', 'YÖN', 'BAND BOY', 'BAND BOY', 'BAND EN', 'BAND EN',
];

// Şablondaki sütun genişlikleri; dosya açılınca aynı görünsün.
export const MAKINE_GENISLIK = [19.3, 19.3, 11.9, 12.1, 12.4, 5.1, 5.1, 11, 13.3, 12.1, 19.3, 19.3];

export const MAKINE_VARSAYILAN = {
  plakaRenk: '',
  plakaOlcu: '',
  // Kâğıttaki ilk sayı ne? Makine BOY/EN sırasında istiyor.
  olcuSirasi: 'boy-en',
  // Bantlı kenar hücresine ne yazılsın?
  bantIsareti: 'X',
  // YÖN sütunu
  yonDamarli: 'DAMARLI',
  yonSerbest: '',
};

/** Kâğıttaki iki sayıyı makinenin istediği boy/en'e çevirir. */
export function boyEn(satir, olcuSirasi) {
  // satir.en = kâğıttaki ilk sayı, satir.boy = ikinci sayı.
  return olcuSirasi === 'en-boy'
    ? { boy: satir.boy, en: satir.en }
    : { boy: satir.en, en: satir.boy };
}

/**
 * Bant kodunu makinenin dört sütununa dağıtır.
 *
 * olcu.js'te ust/alt kenarların uzunluğu satir.en (kâğıttaki ilk sayı),
 * sol/sag kenarların uzunluğu satir.boy kadardır. Hangi çiftin "BAND BOY"
 * olduğu bu yüzden ölçü sırasına bağlı.
 *
 * @returns {{boy: [boolean, boolean], en: [boolean, boolean]}}
 */
export function makineKenarlari(satir, olcuSirasi) {
  const { bant } = bantKodCoz(satir.bantKod, satir.en, satir.boy);
  const yatay = [bant.ust, bant.alt];   // uzunlukları satir.en
  const dikey = [bant.sol, bant.sag];   // uzunlukları satir.boy
  return olcuSirasi === 'en-boy'
    ? { boy: dikey, en: yatay }
    : { boy: yatay, en: dikey };
}

/** Tek satırı makine sütunlarına çevirir. */
export function makineSatiri(satir, ayar) {
  const o = { ...MAKINE_VARSAYILAN, ...ayar };
  const { boy, en } = boyEn(satir, o.olcuSirasi);
  const kenar = makineKenarlari(satir, o.olcuSirasi);
  const im = (acik) => (acik ? o.bantIsareti : '');

  return [
    o.plakaRenk,
    o.plakaOlcu,
    boy,
    en,
    satir.adet,
    '',                                   // F — şablonda ayraç
    '',                                   // G — şablonda ayraç
    satir.damar === 'boy' ? o.yonDamarli : o.yonSerbest,
    im(kenar.boy[0]),
    im(kenar.boy[1]),
    im(kenar.en[0]),
    im(kenar.en[1]),
  ];
}

/** Geçerli satırları makine biçiminde döndürür. */
export function makineSatirlari(satirlar, ayar, gecerliMi = () => true) {
  return satirlar.filter(gecerliMi).map((s) => makineSatiri(s, ayar));
}

/** Makineye gitmeden önce gözden geçirilmesi gereken noktalar. */
export function makineUyarilari(satirlar, ayar) {
  const o = { ...MAKINE_VARSAYILAN, ...ayar };
  const u = [];
  if (!o.plakaRenk) u.push('PLAKA RENK boş — makine plakayı seçemeyebilir.');
  if (!o.plakaOlcu) u.push('PLAKA ÖLÇÜ boş.');
  if (!o.bantIsareti) u.push('Bant işareti boş — bantlı kenarlar boş gidecek.');

  // Bant kodu olmayan satırlar sessizce bantsız gider; bu pahalı bir hatadır.
  const kodsuz = satirlar.filter((s) => !String(s.bantKod || '').trim()).length;
  if (kodsuz) u.push(`${kodsuz} satırda bant kodu yok — bantsız olarak gidecek.`);

  // Bant kodu çözülemeyen satırlar
  const bozuk = satirlar.filter((s) => s.bantKod && bantKodCoz(s.bantKod, s.en, s.boy).uyari).length;
  if (bozuk) u.push(`${bozuk} satırın bant kodu anlaşılmadı — o kenarlar boş gidecek.`);

  return u;
}
