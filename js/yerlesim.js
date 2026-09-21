// Levha yerleşimi — giyotin (panel testere) kesim düzeni.
//
// Neden "giyotin"? Panel testere levhayı baştan sona keser; ortadan bir
// dikdörtgen oyamaz. Serbest yerleşim yapan bir program kâğıt üzerinde daha
// az fire gösterir ama o düzen tezgâhta kesilemez. Bu yüzden her yerleştirme
// sonrası kalan alanı da baştan sona bir kesikle ikiye bölüyoruz: çıkan
// düzenin her kesiği gerçekten yapılabilir bir kesik oluyor.
//
// Testere kertiği (kerf) her kesikte malzeme yer; yerleştirmede parçanın
// sağına ve üstüne kertik payı ayrılır.

import { kesimOlcusu, yuvarla } from './olcu.js';

/**
 * Parça satırlarını tek tek fiziksel parçalara açar.
 * Her parçanın etiketi "satır-kopya" olur: 3. satırın 2. adedi → "3-2".
 */
export function parcalariAc(parcalar, ayar) {
  const liste = [];
  parcalar.forEach((p, i) => {
    const k = kesimOlcusu(p, ayar);
    if (!(k.en > 0) || !(k.boy > 0) || !(p.adet > 0)) return;
    for (let n = 1; n <= p.adet; n += 1) {
      liste.push({
        parcaId: p.id,
        etiket: p.adet > 1 ? `${i + 1}-${n}` : `${i + 1}`,
        satirNo: i + 1,
        en: k.en,
        boy: k.boy,
        damar: p.damar,
        aciklama: p.aciklama,
      });
    }
  });
  return liste;
}

/**
 * @param {Array} parcalar ham parça satırları
 * @param {object} ayar   { kerf, kenarPayi, olcuTipi, bantKalinlik }
 * @param {object} malzeme { levhaEn, levhaBoy }
 */
export function yerlestir(parcalar, ayar, malzeme) {
  const hepsi = parcalariAc(parcalar, ayar);
  const kerf = ayar.kerf || 0;
  const pay = ayar.kenarPayi || 0;
  const kullEn = malzeme.levhaEn - 2 * pay;
  const kullBoy = malzeme.levhaBoy - 2 * pay;

  const sigmayan = [];
  const sigan = [];
  for (const p of hepsi) {
    const duz = p.en <= kullEn && p.boy <= kullBoy;
    const cevrik = p.damar === 'serbest' && p.boy <= kullEn && p.en <= kullBoy;
    if (duz || cevrik) sigan.push(p); else sigmayan.push(p);
  }

  // Birkaç sıralama dene, en az levha kullananı seç. Hangi sıralamanın
  // kazanacağı işe göre değişiyor; denemek ucuz.
  const denemeler = [
    [...sigan].sort((a, b) => Math.max(b.en, b.boy) - Math.max(a.en, a.boy)),
    [...sigan].sort((a, b) => b.en * b.boy - a.en * a.boy),
    [...sigan].sort((a, b) => b.boy - a.boy || b.en - a.en),
    [...sigan].sort((a, b) => b.en - a.en || b.boy - a.boy),
  ];

  let enIyi = null;
  for (const sira of denemeler) {
    const sonuc = tekDeneme(sira, { kerf, pay, kullEn, kullBoy });
    if (!enIyi || dahaIyi(sonuc, enIyi)) enIyi = sonuc;
  }

  const levhaAlani = (malzeme.levhaEn * malzeme.levhaBoy) / 1e6;
  const toplamLevha = enIyi.levhalar.length;
  const parcaAlani = enIyi.levhalar.reduce(
    (t, l) => t + l.yerlesimler.reduce((s, y) => s + (y.en * y.boy) / 1e6, 0), 0,
  );
  const kullanilan = toplamLevha * levhaAlani;

  return {
    levhalar: enIyi.levhalar,
    sigmayan,
    levhaSayisi: toplamLevha,
    levhaEn: malzeme.levhaEn,
    levhaBoy: malzeme.levhaBoy,
    kenarPayi: pay,
    parcaAlaniM2: yuvarla(parcaAlani, 3),
    levhaAlaniM2: yuvarla(kullanilan, 3),
    doluluk: kullanilan > 0 ? yuvarla((parcaAlani / kullanilan) * 100, 1) : 0,
    fire: kullanilan > 0 ? yuvarla(100 - (parcaAlani / kullanilan) * 100, 1) : 0,
  };
}

/** Önce levhası az olan, sonra dolulugu yüksek olan kazanır. */
function dahaIyi(a, b) {
  if (a.levhalar.length !== b.levhalar.length) return a.levhalar.length < b.levhalar.length;
  return a.alan > b.alan;
}

function tekDeneme(sirali, o) {
  const levhalar = [];
  let alan = 0;

  for (const p of sirali) {
    let kondu = false;
    for (const levha of levhalar) {
      if (levhayaKoy(levha, p, o)) { kondu = true; break; }
    }
    if (!kondu) {
      const levha = yeniLevha(o);
      if (!levhayaKoy(levha, p, o)) continue;  // olamaz; sığmayan zaten ayrıldı
      levhalar.push(levha);
    }
    alan += p.en * p.boy;
  }
  return { levhalar, alan };
}

function yeniLevha(o) {
  return {
    yerlesimler: [],
    bos: [{ x: o.pay, y: o.pay, en: o.kullEn, boy: o.kullBoy }],
  };
}

/**
 * Parçayı levhadaki en uygun boş dikdörtgene koyar.
 * Seçim ölçütü: kısa kenarda en az artık bırakan yer (best short side fit).
 */
function levhayaKoy(levha, p, o) {
  let en_iyi = null;

  levha.bos.forEach((r, i) => {
    for (const cevrik of [false, true]) {
      if (cevrik && p.damar !== 'serbest') continue;
      const en = cevrik ? p.boy : p.en;
      const boy = cevrik ? p.en : p.boy;
      if (en > r.en || boy > r.boy) continue;
      const artikEn = r.en - en;
      const artikBoy = r.boy - boy;
      const puan = Math.min(artikEn, artikBoy);   // kısa kenar artığı
      const ikincil = artikEn * artikBoy;         // kalan alan
      if (!en_iyi || puan < en_iyi.puan || (puan === en_iyi.puan && ikincil < en_iyi.ikincil)) {
        en_iyi = { i, en, boy, cevrik, puan, ikincil };
      }
    }
  });

  if (!en_iyi) return false;

  const r = levha.bos[en_iyi.i];
  levha.yerlesimler.push({
    parcaId: p.parcaId,
    etiket: p.etiket,
    satirNo: p.satirNo,
    aciklama: p.aciklama,
    x: r.x,
    y: r.y,
    en: en_iyi.en,
    boy: en_iyi.boy,
    cevrik: en_iyi.cevrik,
  });

  levha.bos.splice(en_iyi.i, 1, ...giyotinBol(r, en_iyi.en, en_iyi.boy, o.kerf));
  return true;
}

/**
 * Yerleştirmeden sonra kalan L biçimli alanı, baştan sona tek bir kesikle
 * iki dikdörtgene böler. Hangi yöne bölüneceği: kısa kalan taraf kesilir
 * (kalan iki parçadan büyüğünü olabildiğince büyük tutar).
 */
function giyotinBol(r, en, boy, kerf) {
  const sagBos = r.en - en - kerf;
  const ustBos = r.boy - boy - kerf;
  const yeni = [];

  if (r.en - en < r.boy - boy) {
    // Yatay kesik: üst şerit levha boyunca tam genişlikte kalır.
    if (sagBos > 0) yeni.push({ x: r.x + en + kerf, y: r.y, en: sagBos, boy });
    if (ustBos > 0) yeni.push({ x: r.x, y: r.y + boy + kerf, en: r.en, boy: ustBos });
  } else {
    // Dikey kesik: sağ şerit levha boyunca tam yükseklikte kalır.
    if (sagBos > 0) yeni.push({ x: r.x + en + kerf, y: r.y, en: sagBos, boy: r.boy });
    if (ustBos > 0) yeni.push({ x: r.x, y: r.y + boy + kerf, en, boy: ustBos });
  }
  return yeni.filter((b) => b.en > 0 && b.boy > 0);
}

/** Yerleşimin geçerliliğini denetler — testlerde ve hata ayıklamada kullanılır. */
export function yerlesimDogrula(sonuc) {
  const sorunlar = [];
  for (const [li, levha] of sonuc.levhalar.entries()) {
    for (const y of levha.yerlesimler) {
      if (y.x < sonuc.kenarPayi - 1e-6 || y.y < sonuc.kenarPayi - 1e-6
        || y.x + y.en > sonuc.levhaEn - sonuc.kenarPayi + 1e-6
        || y.y + y.boy > sonuc.levhaBoy - sonuc.kenarPayi + 1e-6) {
        sorunlar.push(`Levha ${li + 1}: ${y.etiket} levha dışına taşıyor.`);
      }
    }
    for (let i = 0; i < levha.yerlesimler.length; i += 1) {
      for (let j = i + 1; j < levha.yerlesimler.length; j += 1) {
        const a = levha.yerlesimler[i];
        const b = levha.yerlesimler[j];
        const ayri = a.x + a.en <= b.x + 1e-6 || b.x + b.en <= a.x + 1e-6
          || a.y + a.boy <= b.y + 1e-6 || b.y + b.boy <= a.y + 1e-6;
        if (!ayri) sorunlar.push(`Levha ${li + 1}: ${a.etiket} ile ${b.etiket} üst üste biniyor.`);
      }
    }
  }
  return sorunlar;
}
