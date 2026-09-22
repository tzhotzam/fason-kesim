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
  // YÖN sütunu — ustanın örnek dosyasında boştu, varsayılanı boş bıraktık.
  yonDamarli: '',
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
 * Bantlı kenar sayılarını makinenin dört sütununa dağıtır.
 *
 * Kâğıtta bant, ölçünün altı çizilerek belirtiliyor: tek çizgi o ölçünün bir
 * kenarı, çift çizgi iki kenarı. satir.bant1 birinci ölçüye, satir.bant2
 * ikinci ölçüye ait sayıdır. Hangisinin BAND BOY hangisinin BAND EN olduğu
 * ölçü sırasına bağlı, ikisi birlikte yer değiştirir.
 *
 * @returns {{boy: number, en: number}} her biri 0, 1 ya da 2
 */
export function makineKenarlari(satir, olcuSirasi) {
  const b1 = sinirla(satir.bant1);
  const b2 = sinirla(satir.bant2);
  return olcuSirasi === 'en-boy' ? { boy: b2, en: b1 } : { boy: b1, en: b2 };
}

function sinirla(n) {
  return Math.max(0, Math.min(2, Math.round(Number(n) || 0)));
}

/** Tek satırı makine sütunlarına çevirir. */
export function makineSatiri(satir, ayar) {
  const o = { ...MAKINE_VARSAYILAN, ...ayar };
  const { boy, en } = boyEn(satir, o.olcuSirasi);
  const kenar = makineKenarlari(satir, o.olcuSirasi);
  // n kenar bantlıysa o ölçünün iki sütunundan n tanesi işaretlenir.
  const im = (n, sira) => (sira < n ? o.bantIsareti : '');

  return [
    // Satırın kendi öbek başlığı varsa (ör. "Arbolit") plaka rengi odur;
    // yoksa ayardaki genel renk kullanılır.
    String(satir.grup || '').trim() || o.plakaRenk,
    o.plakaOlcu,
    boy,
    en,
    satir.adet,
    '',                                   // F — şablonda ayraç
    '',                                   // G — şablonda ayraç
    satir.damar === 'boy' ? o.yonDamarli : o.yonSerbest,
    im(kenar.boy, 0),
    im(kenar.boy, 1),
    im(kenar.en, 0),
    im(kenar.en, 1),
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
  const grupsuz = satirlar.filter((s) => !String(s.grup || '').trim());
  if (!o.plakaRenk && grupsuz.length) {
    u.push(`${grupsuz.length} satırda PLAKA RENK boş — makine plakayı seçemeyebilir.`);
  }
  if (!o.plakaOlcu) u.push('PLAKA ÖLÇÜ boş.');
  if (!o.bantIsareti) u.push('Bant işareti boş — bantlı kenarlar boş gidecek.');

  // Hiç bandı olmayan satırlar sessizce bantsız gider; pahalı bir hatadır.
  const bantsiz = satirlar.filter((s) => !sinirla(s.bant1) && !sinirla(s.bant2)).length;
  if (bantsiz) u.push(`${bantsiz} satır bantsız gidecek — kâğıtta altı çizili ölçü var mı bak.`);

  const supheli = satirlar.filter((s) => s.guven === 'dusuk' || s.guven === 'orta').length;
  if (supheli) u.push(`${supheli} satır şüpheli okundu.`);

  return u;
}
