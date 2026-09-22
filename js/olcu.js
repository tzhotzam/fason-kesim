// Ölçü ve kenar bandı matematiği.
//
// Bu dosyadaki tek kritik fikir şu: müşterinin kâğıda yazdığı ölçü ile
// testereye vereceğin ölçü aynı şey değildir. Bantlanan her kenar parçayı
// bandın kalınlığı kadar büyütür. Müşteri "bitmiş ölçü" verdiyse kesim
// ölçüsünü ondan düşmen gerekir; düşmezsen dolap gövdesine girmez.

/** Kenar adları. ust/alt yatay (uzunlukları = en), sol/sag dikey (= boy). */
export const KENARLAR = ['ust', 'alt', 'sol', 'sag'];

export const KENAR_ADI = {
  ust: 'Üst', alt: 'Alt', sol: 'Sol', sag: 'Sağ',
};

export const AYAR_VARSAYILAN = {
  // Müşterinin verdiği ölçü ne anlama geliyor?
  //   'bitmis' — bantlandıktan sonraki ölçü (dolaba girecek ölçü)
  //   'ham'    — testereden çıkacak ölçü, bant üstüne gelir
  olcuTipi: 'bitmis',
  bantKalinlik: 0.8,   // mm — 0.4 / 0.8 / 1 / 2 yaygın
  bantFire: 20,        // mm — her kenar için bantlama makinesinin yediği pay
  kerf: 4.0,           // mm — testere kertiği
  kenarPayi: 10,       // mm — levhanın her kenarından kullanılmayan şerit
  birim: 'mm',         // 'mm' | 'cm' — sadece giriş kolaylığı için
  minBantBoyu: 100,    // mm — bu ölçünün altındaki kenar bantlanamaz (uyarı)
  minParca: 30,        // mm — bunun altı testerede tehlikeli (uyarı)
};

export const MALZEME_VARSAYILAN = {
  ad: 'Suntalam 18mm',
  kalinlik: 18,
  levhaEn: 2100,
  levhaBoy: 2800,
};

export const FIYAT_VARSAYILAN = {
  m2: 0,          // ₺ / m² kesim
  bantMetre: 0,   // ₺ / m bant
  parcaBasi: 0,   // ₺ / parça (delik, özel iş)
  levha: 0,       // ₺ / levha (malzeme senden çıkıyorsa)
  malzemeDahil: false,
};

/** Boş bir parça. */
export function yeniParca(alan = {}) {
  return {
    id: alan.id ?? kimlik(),
    en: alan.en ?? 0,
    boy: alan.boy ?? 0,
    adet: alan.adet ?? 1,
    bant: { ust: false, alt: false, sol: false, sag: false, ...(alan.bant || {}) },
    // damar: 'serbest' → yerleşimde çevrilebilir. 'boy' → desen boy yönünde,
    // çevrilemez. Desensiz beyazda serbest, ahşap deseninde boy olmalı.
    damar: alan.damar ?? 'serbest',
    aciklama: alan.aciklama ?? '',
    // OCR'dan geldiyse: hangi satırdan okundu, program ne kadar emin.
    kaynak: alan.kaynak ?? null,
  };
}

let sayac = 0;
export function kimlik() {
  sayac += 1;
  return `p${Date.now().toString(36)}${sayac.toString(36)}`;
}

/**
 * Hangi kenarlar uzun, hangileri kısa?
 * Kare parçada ikisi de "uzun" sayılır; 1U1K yazan müşteri zaten kareyi
 * kastetmiyordur, böyle bir durumda kod çözümü uyarı üretir.
 */
export function uzunKisa(en, boy) {
  return en >= boy
    ? { uzun: ['ust', 'alt'], kisa: ['sol', 'sag'] }
    : { uzun: ['sol', 'sag'], kisa: ['ust', 'alt'] };
}

const BOS_BANT = () => ({ ust: false, alt: false, sol: false, sag: false });

/**
 * "1U1K", "2U2K", "4", "0", "[1010]" gibi kodu kenar kümesine çevirir.
 * Döndürdüğü nesnede `uyari` alanı olabilir.
 */
export function bantKodCoz(kod, en, boy) {
  const bant = BOS_BANT();
  if (kod == null) return { bant, uyari: null };
  const t = String(kod).trim().toLocaleUpperCase('tr');
  if (!t || t === '0' || t === '-' || t === 'YOK' || t === 'X') return { bant, uyari: null };

  // Sayı biçimi: [birinci|ikinci] — her ölçüden kaç kenar bantlı.
  // Kâğıttaki altı çizili ölçü kuralı buraya düşüyor.
  const sayilar = t.match(/^\[([0-2])\|([0-2])\]$/);
  if (sayilar) {
    return { bant: bantNesnesi(Number(sayilar[1]), Number(sayilar[2])), uyari: null };
  }

  // Açık biçim: [üst alt sol sağ] — "[1011]" ya da "1011"
  const acik = t.match(/^\[?([01])([01])([01])([01])\]?$/);
  if (acik) {
    KENARLAR.forEach((k, i) => { bant[k] = acik[i + 1] === '1'; });
    return { bant, uyari: null };
  }

  if (t === '4' || t === '4K' || t === '4KENAR' || t === 'TAM' || t === 'HEPSI' || t === 'HEPSİ') {
    KENARLAR.forEach((k) => { bant[k] = true; });
    return { bant, uyari: null };
  }

  // nU mK — n uzun kenar, m kısa kenar
  const m = t.match(/^(?:(\d)\s*U)?\s*(?:(\d)\s*K)?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) {
    return { bant, uyari: `Bant kodu anlaşılmadı: "${kod}"` };
  }
  const nu = m[1] ? Number(m[1]) : 0;
  const nk = m[2] ? Number(m[2]) : 0;
  if (nu > 2 || nk > 2) {
    return { bant, uyari: `Bir parçanın 2'den fazla uzun/kısa kenarı olmaz: "${kod}"` };
  }
  const { uzun, kisa } = uzunKisa(en, boy);
  for (let i = 0; i < nu; i += 1) bant[uzun[i]] = true;
  for (let i = 0; i < nk; i += 1) bant[kisa[i]] = true;
  const uyari = (en === boy && (nu !== nk) && (nu + nk) % 2 === 1)
    ? 'Kare parçada uzun/kısa ayrımı yok — hangi kenar olduğunu işaretle.'
    : null;
  return { bant, uyari };
}


/**
 * Kenar kümesini "kaç kenar" sayılarına çevirir.
 *
 * Müşteri kâğıdında bant, ölçünün altını çizerek belirtiliyor: tek çizgi o
 * ölçünün bir kenarı, çift çizgi iki kenarı demek. Yani bizim için önemli
 * olan hangi kenar değil, her ölçüden kaç kenar bantlandığı.
 *
 * bant1 = birinci ölçü (en) uzunluğundaki kenarlardan kaçı bantlı
 * bant2 = ikinci ölçü (boy) uzunluğundaki kenarlardan kaçı bantlı
 */
export function bantSayilari(bant) {
  return {
    bant1: (bant.ust ? 1 : 0) + (bant.alt ? 1 : 0),
    bant2: (bant.sol ? 1 : 0) + (bant.sag ? 1 : 0),
  };
}

/** bantSayilari'nın tersi. */
export function bantNesnesi(bant1 = 0, bant2 = 0) {
  const n1 = Math.max(0, Math.min(2, Math.round(bant1) || 0));
  const n2 = Math.max(0, Math.min(2, Math.round(bant2) || 0));
  return {
    ust: n1 >= 1,
    alt: n1 >= 2,
    sol: n2 >= 1,
    sag: n2 >= 2,
  };
}

/** Kenar kümesini okunur koda çevirir: "1U1K", "4 kenar", "yok"… */
export function bantKodYaz(bant, en, boy) {
  const acik = KENARLAR.filter((k) => bant[k]);
  if (acik.length === 0) return 'yok';
  if (acik.length === 4) return '4 kenar';
  const { uzun, kisa } = uzunKisa(en, boy);
  const nu = uzun.filter((k) => bant[k]).length;
  const nk = kisa.filter((k) => bant[k]).length;
  const p = [];
  if (nu) p.push(`${nu}U`);
  if (nk) p.push(`${nk}K`);
  return p.join('');
}

/** Bantlanan kenar sayısına göre eksenlerin kaç mm değiştiği. */
function bantPayi(bant, ayar) {
  const k = ayar.bantKalinlik || 0;
  return {
    en: ((bant.sol ? 1 : 0) + (bant.sag ? 1 : 0)) * k,   // sol/sag dikey kenarlar
    boy: ((bant.ust ? 1 : 0) + (bant.alt ? 1 : 0)) * k,  // ust/alt yatay kenarlar
  };
}

/** Testereye verilecek ölçü. */
export function kesimOlcusu(parca, ayar) {
  const p = bantPayi(parca.bant, ayar);
  if (ayar.olcuTipi === 'ham') return { en: parca.en, boy: parca.boy };
  return { en: yuvarla(parca.en - p.en), boy: yuvarla(parca.boy - p.boy) };
}

/** Bantlandıktan sonraki, müşterinin göreceği ölçü. */
export function bitmisOlcu(parca, ayar) {
  const p = bantPayi(parca.bant, ayar);
  if (ayar.olcuTipi === 'bitmis') return { en: parca.en, boy: parca.boy };
  return { en: yuvarla(parca.en + p.en), boy: yuvarla(parca.boy + p.boy) };
}

/** Bu parça için toplam bant uzunluğu (mm), adet dâhil. */
export function bantUzunlugu(parca, ayar) {
  const kesim = kesimOlcusu(parca, ayar);
  let mm = 0;
  for (const k of KENARLAR) {
    if (!parca.bant[k]) continue;
    const boyut = (k === 'ust' || k === 'alt') ? kesim.en : kesim.boy;
    mm += boyut + (ayar.bantFire || 0);
  }
  return mm * (parca.adet || 0);
}

/** Bu parçanın kapladığı alan (m²), adet dâhil — kesim ölçüsünden. */
export function alanM2(parca, ayar) {
  const k = kesimOlcusu(parca, ayar);
  return (k.en * k.boy * (parca.adet || 0)) / 1e6;
}

/**
 * Parçayı gözden geçirir. Döndürdüğü her kayıt {duzey, mesaj}:
 *   'hata'  — bu haliyle kesilemez
 *   'uyari' — kesilir ama bir kez daha bak
 */
export function parcaDogrula(parca, ayar, malzeme) {
  const n = [];
  const ekle = (duzey, mesaj) => n.push({ duzey, mesaj });

  if (!(parca.en > 0) || !(parca.boy > 0)) {
    ekle('hata', 'Ölçü eksik ya da sıfır.');
    return n;
  }
  if (!(parca.adet > 0)) ekle('hata', 'Adet sıfır.');
  if (!Number.isInteger(parca.adet)) ekle('uyari', 'Adet tam sayı değil.');

  const kesim = kesimOlcusu(parca, ayar);
  if (kesim.en <= 0 || kesim.boy <= 0) {
    ekle('hata', 'Bant payı düşünce ölçü sıfırın altına iniyor.');
    return n;
  }

  // Levhaya sığıyor mu? Damarı serbestse çevirip de deneriz.
  const kullEn = malzeme.levhaEn - 2 * (ayar.kenarPayi || 0);
  const kullBoy = malzeme.levhaBoy - 2 * (ayar.kenarPayi || 0);
  const duz = kesim.en <= kullEn && kesim.boy <= kullBoy;
  const cevrik = kesim.boy <= kullEn && kesim.en <= kullBoy;
  if (!duz && !(parca.damar === 'serbest' && cevrik)) {
    ekle('hata', parca.damar === 'serbest'
      ? `Levhaya sığmıyor (kullanılabilir alan ${yuvarla(kullEn)}×${yuvarla(kullBoy)}).`
      : `Damar boy yönünde olduğu için çevrilemiyor ve levhaya sığmıyor.`);
  }

  const kisaKenar = Math.min(kesim.en, kesim.boy);
  if (kisaKenar < (ayar.minParca || 0)) {
    ekle('uyari', `Çok küçük parça (${yuvarla(kisaKenar)} mm) — testerede tehlikeli.`);
  } else if (KENARLAR.some((k) => parca.bant[k]) && kisaKenar < (ayar.minBantBoyu || 0)) {
    ekle('uyari', `${yuvarla(kisaKenar)} mm'lik kenar bantlama makinesinden geçmeyebilir.`);
  }

  // 3 kenar bant genelde yazım hatasıdır; 1, 2 ya da 4 olur.
  const bantli = KENARLAR.filter((k) => parca.bant[k]).length;
  if (bantli === 3) ekle('uyari', '3 kenar bant — kâğıttan bir daha bak, genelde yanlış okunur.');

  if (parca.kaynak && parca.kaynak.guven === 'dusuk') {
    ekle('uyari', 'Fotoğraftan okunurken emin olunamadı — kâğıtla karşılaştır.');
  }
  return n;
}

/** Aynı ölçü ve bantla iki kere girilmiş parçaları bulur (çift giriş şüphesi). */
export function ciftGirisBul(parcalar) {
  const harita = new Map();
  for (const p of parcalar) {
    const anahtar = `${p.en}x${p.boy}|${KENARLAR.map((k) => (p.bant[k] ? 1 : 0)).join('')}|${p.damar}`;
    if (!harita.has(anahtar)) harita.set(anahtar, []);
    harita.get(anahtar).push(p.id);
  }
  return [...harita.values()].filter((g) => g.length > 1);
}

/** İşin tamamının özeti: alan, bant, fiyat, uyarı sayısı. */
export function isOzeti(is) {
  const { ayar, malzeme, fiyat, parcalar } = is;
  let m2 = 0;
  let bantMm = 0;
  let adet = 0;
  let hata = 0;
  let uyari = 0;

  for (const p of parcalar) {
    const notlar = parcaDogrula(p, ayar, malzeme);
    hata += notlar.filter((x) => x.duzey === 'hata').length;
    uyari += notlar.filter((x) => x.duzey === 'uyari').length;
    if (notlar.some((x) => x.duzey === 'hata')) continue;
    m2 += alanM2(p, ayar);
    bantMm += bantUzunlugu(p, ayar);
    adet += p.adet || 0;
  }

  const bantM = bantMm / 1000;
  const tutar = {
    kesim: m2 * (fiyat.m2 || 0),
    bant: bantM * (fiyat.bantMetre || 0),
    parca: adet * (fiyat.parcaBasi || 0),
    malzeme: 0,
  };
  return {
    satirSayisi: parcalar.length,
    adet,
    m2: yuvarla(m2, 3),
    bantM: yuvarla(bantM, 2),
    hata,
    uyari,
    tutar,
    toplam: tutar.kesim + tutar.bant + tutar.parca,
  };
}

export function yuvarla(x, basamak = 2) {
  const c = 10 ** basamak;
  return Math.round(x * c) / c;
}
