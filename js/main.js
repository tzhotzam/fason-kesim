// Uygulama kabuğu: fotoğraf → okuma → kontrol tablosu → Excel.

import { gorselHazirla } from './foto.js';
import { fotograftanOku, anahtarGecerliBicimde, MODEL } from './ocr.js';
import { xlsxOlustur, csvOlustur, indir } from './xlsx.js';
import { bantSayilari, kimlik, yuvarla } from './olcu.js';
import { satirCoz } from './parse.js';
import { apiAnahtari, sonIs, ayarlar, depoCalisiyor } from './depo.js';
import {
  MAKINE_BASLIKLAR, MAKINE_GENISLIK, MAKINE_VARSAYILAN,
  makineSatirlari, makineUyarilari,
} from './makine.js';

const APP_VERSION = '2026-09-21-a';

/**
 * HTML ile JavaScript aynı sürümden mi?
 *
 * Tarayıcı bazen yeni index.html'i alıp eski main.js'i önbellekten veriyor.
 * O durumda arayüzde yeni alanlar görünür ama onları dolduran kod yoktur.
 * Uyuşmazlıkta önbellek temizlenip sayfa bir kez yenilenir; ikinci kez de
 * uyuşmazsa kullanıcıya söylenir.
 */
(function surumDenetle() {
  const etiket = document.querySelector('meta[name="app-version"]');
  const htmlSurum = etiket ? etiket.content : null;
  if (!htmlSurum || htmlSurum === APP_VERSION) return;

  const ANAHTAR = 'fason-kesim-uyusmazlik';
  let denendi = false;
  try { denendi = sessionStorage.getItem(ANAHTAR) === '1'; } catch { /* yoksay */ }

  if (denendi) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="kart" style="margin:14px;border-color:var(--danger)">'
      + '<b>Sürüm uyuşmazlığı.</b> Sayfa eski dosyalarla açıldı. '
      + 'Tarayıcı geçmişini/önbelleğini temizleyip yeniden aç.</div>');
    return;
  }
  try { sessionStorage.setItem(ANAHTAR, '1'); } catch { /* yoksay */ }
  location.reload();
}());

/* --------------------------------------------------------------- durum --- */

const D = {
  gorseller: [],
  satirlar: [],
  musteri: '',
  malzeme: '',
  birim: 'mm',
  // Kâğıttaki ilk sayı boy mu en mi? Makine BOY/EN sırasında istiyor;
  // yanlış sıra kesilene kadar fark edilmeyecek bir hata olur.
  olcuSirasi: 'boy-en',
  notlar: [],
  makine: { ...MAKINE_VARSAYILAN },
};

let istekKontrol = null;

const $ = (id) => document.getElementById(id);

const ge = {
  dosya: $('dosya-girisi'),
  fotoTemizle: $('foto-temizle'),
  birakma: $('birakma-alani'),
  fotoListesi: $('foto-listesi'),
  anahtarKutusu: $('anahtar-kutusu'),
  anahtarDurum: $('anahtar-durum'),
  anahtar: $('api-anahtari'),
  anahtarGoster: $('anahtar-goster'),
  anahtarSil: $('anahtar-sil'),
  ekBilgi: $('ek-bilgi'),
  oku: $('oku-dugmesi'),
  iptal: $('iptal-dugmesi'),
  durum: $('durum'),
  bolumTablo: $('bolum-tablo'),
  musteri: $('musteri'),
  malzeme: $('malzeme'),
  birim: $('birim'),
  olcuSirasi: $('olcu-sirasi'),
  basOlcu1: $('bas-olcu1'),
  basOlcu2: $('bas-olcu2'),
  basBant1: $('bas-bant1'),
  basBant2: $('bas-bant2'),
  makineKutusu: $('makine-kutusu'),
  plakaRenk: $('plaka-renk'),
  plakaOlcu: $('plaka-olcu'),
  bantIsareti: $('bant-isareti'),
  yonDamarli: $('yon-damarli'),
  yonSerbest: $('yon-serbest'),
  makine: $('makine-indir'),
  notlar: $('notlar'),
  govde: $('tablo-govde'),
  hizliGiris: $('hizli-giris'),
  satirEkle: $('satir-ekle'),
  ozet: $('ozet'),
  excel: $('excel-indir'),
  csv: $('csv-indir'),
  kopyala: $('panoya-kopyala'),
  tabloTemizle: $('tabloyu-temizle'),
  buyutec: $('buyutec'),
  buyutecResim: $('buyutec-resim'),
  buyutecKapat: $('buyutec-kapat'),
};

/* --------------------------------------------------------------- satır --- */

function yeniSatir(alan = {}) {
  return {
    id: alan.id ?? kimlik(),
    en: alan.en ?? 0,        // kâğıttaki birinci ölçü
    boy: alan.boy ?? 0,      // kâğıttaki ikinci ölçü
    adet: alan.adet ?? 1,
    // Kâğıtta bant, ölçünün altı çizilerek yazılıyor: tek çizgi o ölçünün
    // bir kenarı, çift çizgi iki kenarı. Sayı olarak tutuyoruz.
    bant1: sinirlaBant(alan.bant1),
    bant2: sinirlaBant(alan.bant2),
    grup: alan.grup ?? '',   // öbek başlığı → PLAKA RENK
    damar: alan.damar ?? 'serbest',
    aciklama: alan.aciklama ?? '',
    okunan: alan.okunan ?? '',
    guven: alan.guven ?? '',
  };
}

function sinirlaBant(n) {
  return Math.max(0, Math.min(2, Math.round(Number(n) || 0)));
}

/** Satırı gözden geçirir: {hata: bool, notlar: string[]} */
function satirDenetle(s) {
  const notlar = [];
  let hata = false;

  if (!(s.en > 0) || !(s.boy > 0)) { notlar.push('Ölçü eksik.'); hata = true; }
  if (!Number.isInteger(s.adet) || s.adet <= 0) { notlar.push('Adet geçersiz.'); hata = true; }


  // Ölçü büyüklüğü birime uyuyor mu? En sık hata bu.
  const enBuyuk = Math.max(s.en, s.boy);
  if (D.birim === 'mm' && enBuyuk > 0 && enBuyuk < 50) {
    notlar.push('Bu ölçü mm için çok küçük — birim cm olabilir.');
  }
  if (D.birim === 'cm' && enBuyuk > 400) {
    notlar.push('Bu ölçü cm için çok büyük — birim mm olabilir.');
  }
  if (enBuyuk > 10000) notlar.push('10 metreden büyük ölçü.');

  return { hata, notlar };
}

/* ------------------------------------------------------------- fotoğraf --- */

async function dosyalariAl(dosyalar) {
  const liste = [...dosyalar];
  if (!liste.length) return;
  bildir('calisiyor', `${liste.length} fotoğraf hazırlanıyor…`);

  const hatalar = [];
  for (const d of liste) {
    try {
      D.gorseller.push(await gorselHazirla(d));
    } catch (e) {
      hatalar.push(e.message);
    }
  }
  fotograflariCiz();
  if (hatalar.length) bildir('hata', hatalar.join(' '));
  else bildir('', '');
}

function fotograflariCiz() {
  ge.fotoListesi.textContent = '';
  D.gorseller.forEach((g, i) => {
    const kutu = document.createElement('figure');
    kutu.className = 'foto';

    const img = document.createElement('img');
    img.src = g.onizleme;
    img.alt = `${i + 1}. sayfa`;
    img.addEventListener('click', () => buyut(g.onizleme));

    const ad = document.createElement('figcaption');
    ad.textContent = `${i + 1}. sayfa · ${g.en}×${g.boy} · ${g.kb} KB`;

    const sil = document.createElement('button');
    sil.type = 'button';
    sil.className = 'foto-sil';
    sil.textContent = '✕';
    sil.title = 'Bu fotoğrafı kaldır';
    sil.addEventListener('click', () => {
      D.gorseller.splice(i, 1);
      fotograflariCiz();
    });

    kutu.append(img, ad, sil);
    ge.fotoListesi.append(kutu);
  });

  ge.fotoTemizle.hidden = D.gorseller.length === 0;
  ge.birakma.hidden = D.gorseller.length > 0;
  dugmeleriTazele();
}

function buyut(url) {
  ge.buyutecResim.src = url;
  ge.buyutec.hidden = false;
}

/* ---------------------------------------------------------------- okuma --- */

function dugmeleriTazele() {
  const anahtar = ge.anahtar.value.trim();
  const anahtarVar = anahtar.length > 0;
  const fotoVar = D.gorseller.length > 0;

  // Düğmeyi sönük ve ölü bırakmak, kullanıcıya "bozuk" gibi görünüyor ve
  // neyin eksik olduğunu söylemiyor. Bunun yerine düğme hep basılabilir
  // kalıyor; eksik neyse onu yazıyor ve basınca oraya götürüyor.
  if (!anahtarVar) {
    ge.oku.textContent = '🔑 Önce anahtar gerekli — dokun';
    ge.oku.dataset.eksik = 'anahtar';
  } else if (!fotoVar) {
    ge.oku.textContent = '📷 Önce fotoğraf ekle — dokun';
    ge.oku.dataset.eksik = 'foto';
  } else {
    ge.oku.textContent = 'Ölçüleri oku';
    delete ge.oku.dataset.eksik;
  }
  ge.oku.disabled = false;
  ge.oku.classList.toggle('eksik', Boolean(ge.oku.dataset.eksik));

  // Anahtar girildiyse kutunun dikkat çekmesine gerek kalmaz.
  ge.anahtarKutusu.classList.toggle('vurgu', !anahtarVar);

  const tamam = anahtarGecerliBicimde(anahtar);
  ge.anahtarDurum.textContent = anahtarVar ? (tamam ? 'kayıtlı' : 'biçim şüpheli') : 'gerekli';
  ge.anahtarDurum.className = `rozet ${anahtarVar && tamam ? 'tamam' : 'eksik'}`;
}

function bildir(sinif, metin, donsun = false) {
  ge.durum.className = `durum ${sinif}`;
  ge.durum.textContent = '';
  if (donsun) {
    const s = document.createElement('span');
    s.className = 'donuyor';
    ge.durum.append(s);
  }
  ge.durum.append(document.createTextNode(metin));
}

async function okumayiBaslat() {
  const anahtar = ge.anahtar.value.trim();

  if (!anahtar) {
    ge.anahtarKutusu.open = true;
    ge.anahtarKutusu.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ge.anahtar.focus({ preventScroll: true });
    bildir('hata', 'Okumayı Claude yapıyor, bunun için bir anahtar gerekiyor. '
      + 'Aşağıdaki kutuya yapıştır — bir kez girersin, bir daha sorulmaz.');
    return;
  }
  if (!D.gorseller.length) {
    document.getElementById('bolum-foto').scrollIntoView({ behavior: 'smooth', block: 'center' });
    bildir('hata', 'Önce kâğıdın fotoğrafını ekle.');
    return;
  }

  istekKontrol = new AbortController();
  ge.oku.disabled = true;
  ge.iptal.hidden = false;
  bildir('calisiyor', `${MODEL} kâğıdı okuyor… (yoğun listede yarım dakika sürebilir)`, true);

  try {
    const { sonuc, kullanim } = await fotograftanOku(D.gorseller, anahtar, {
      ekBilgi: ge.ekBilgi.value,
      signal: istekKontrol.signal,
    });
    sonucuYerlestir(sonuc);

    const kurus = kullanim ? ` · okuma maliyeti ≈ $${kullanim.dolar.toFixed(3)}` : '';
    bildir('tamam', `${D.satirlar.length} satır okundu${kurus}. Şimdi kâğıtla karşılaştır.`);
    apiAnahtari.koy(anahtar);
  } catch (e) {
    if (e.name === 'AbortError') bildir('', 'Vazgeçildi.');
    else bildir('hata', e.message);
  } finally {
    istekKontrol = null;
    ge.iptal.hidden = true;
    dugmeleriTazele();
  }
}

function sonucuYerlestir(sonuc) {
  D.musteri = sonuc.musteri || '';
  D.malzeme = sonuc.malzeme || '';
  D.birim = sonuc.olcuBirimi === 'cm' ? 'cm' : 'mm';
  D.notlar = Array.isArray(sonuc.notlar) ? sonuc.notlar.filter(Boolean) : [];

  const okunan = Array.isArray(sonuc.parcalar) ? [...sonuc.parcalar] : [];
  okunan.sort((a, b) => (a.satirNo || 0) - (b.satirNo || 0));

  D.satirlar = okunan.map((p) => yeniSatir({
    en: sayiya(p.olcu1),
    boy: sayiya(p.olcu2),
    adet: Math.max(1, Math.round(sayiya(p.adet)) || 1),
    bant1: p.altCizgi1,
    bant2: p.altCizgi2,
    grup: (p.grup || '').trim(),
    aciklama: (p.aciklama || '').trim(),
    okunan: (p.okunanMetin || '').trim(),
    guven: p.guven || '',
  }));

  ge.musteri.value = D.musteri;
  ge.malzeme.value = D.malzeme;
  ge.birim.value = D.birim;
  tabloCiz();
}

function sayiya(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/* ---------------------------------------------------------------- tablo --- */

function tabloCiz() {
  ge.bolumTablo.hidden = D.satirlar.length === 0 && D.notlar.length === 0;
  const [bir, iki] = olcuAdlari();
  ge.basOlcu1.textContent = bir;
  ge.basOlcu2.textContent = iki;
  ge.basBant1.textContent = `Bant ${bir}`;
  ge.basBant2.textContent = `Bant ${iki}`;
  ge.govde.textContent = '';

  D.satirlar.forEach((s, i) => {
    const { hata, notlar } = satirDenetle(s);
    const tr = document.createElement('tr');
    tr.className = [
      hata ? 'hatali' : '',
      s.guven === 'dusuk' ? 'guven-dusuk' : '',
      s.guven === 'orta' ? 'guven-orta' : '',
    ].filter(Boolean).join(' ');

    tr.append(
      hucre('sira', String(i + 1)),
      sayiHucresi(s, 'en'),
      sayiHucresi(s, 'boy'),
      sayiHucresi(s, 'adet', 1),
      bantHucresi(s, 'bant1'),
      bantHucresi(s, 'bant2'),
      metinHucresi(s, 'grup', 'grup', ''),
      metinHucresi(s, 'aciklama', 'aciklama', ''),
      metinHucresi(s, 'okunan', 'okunan', ''),
      silHucresi(s),
    );
    ge.govde.append(tr);

    if (notlar.length) {
      const notTr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 10;
      td.className = 'satir-notu';
      td.textContent = `↑ ${notlar.join(' ')}`;
      notTr.append(td);
      ge.govde.append(notTr);
    }
  });

  notlariCiz();
  ozetCiz();
  kaydet();
}

function hucre(sinif, metin) {
  const td = document.createElement('td');
  td.className = sinif;
  td.textContent = metin;
  return td;
}

function sayiHucresi(satir, alan, enAz = 0) {
  const td = document.createElement('td');
  const g = document.createElement('input');
  g.type = 'number';
  g.inputMode = 'decimal';
  g.step = alan === 'adet' ? '1' : 'any';
  g.min = String(enAz);
  g.value = satir[alan] || '';
  g.setAttribute('aria-label', alan);
  g.addEventListener('input', () => {
    satir[alan] = alan === 'adet' ? Math.round(sayiya(g.value)) : sayiya(g.value);
    // Elle düzeltilen satır artık "şüpheli" değildir.
    satir.guven = '';
    gecikmeliCiz();
  });
  td.append(g);
  return td;
}

/** Bantlı kenar sayısı: 0, 1 ya da 2. Kâğıttaki çizgi sayısının karşılığı. */
function bantHucresi(satir, alan) {
  const td = document.createElement('td');
  const g = document.createElement('select');
  g.className = 'bant';
  g.setAttribute('aria-label', alan);
  for (const [deger, etiket] of [[0, '—'], [1, '1 kenar'], [2, '2 kenar']]) {
    const o = document.createElement('option');
    o.value = String(deger);
    o.textContent = etiket;
    g.append(o);
  }
  g.value = String(satir[alan] || 0);
  if (satir[alan]) td.classList.add('bantli');
  g.addEventListener('change', () => {
    satir[alan] = Number(g.value);
    satir.guven = '';
    tabloCiz();
  });
  td.append(g);
  return td;
}

function metinHucresi(satir, alan, sinif, yerTutucu) {
  const td = document.createElement('td');
  const g = document.createElement('input');
  g.type = 'text';
  g.className = sinif;
  g.value = satir[alan] || '';
  g.placeholder = yerTutucu;
  g.setAttribute('aria-label', alan);
  if (alan === 'okunan') g.readOnly = true;
  else {
    g.addEventListener('input', () => {
      satir[alan] = g.value;
      gecikmeliCiz();
    });
  }
  td.append(g);
  return td;
}

function silHucresi(satir) {
  const td = document.createElement('td');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'satir-sil';
  b.textContent = '✕';
  b.title = 'Satırı sil';
  b.addEventListener('click', () => {
    D.satirlar = D.satirlar.filter((x) => x.id !== satir.id);
    tabloCiz();
  });
  td.append(b);
  return td;
}

// Her tuşta tabloyu baştan çizersek odak kaybolur; uyarıları geciktiriyoruz.
let cizZamanlayici = null;
function gecikmeliCiz() {
  clearTimeout(cizZamanlayici);
  cizZamanlayici = setTimeout(() => { tabloCiz(); }, 700);
}

function notlariCiz() {
  if (!D.notlar.length) { ge.notlar.hidden = true; return; }
  ge.notlar.hidden = false;
  ge.notlar.textContent = '';
  const b = document.createElement('b');
  b.textContent = 'Kâğıttan notlar:';
  const ul = document.createElement('ul');
  for (const n of D.notlar) {
    const li = document.createElement('li');
    li.textContent = n;
    ul.append(li);
  }
  ge.notlar.append(b, ul);
}

function ozetCiz() {
  const gecerli = D.satirlar.filter((s) => !satirDenetle(s).hata);
  const adet = gecerli.reduce((t, s) => t + s.adet, 0);
  const bolen = D.birim === 'cm' ? 1e4 : 1e6;   // cm²→m² : 1e4, mm²→m² : 1e6
  const m2 = gecerli.reduce((t, s) => t + (s.en * s.boy * s.adet) / bolen, 0);
  const hataliSayi = D.satirlar.length - gecerli.length;
  const supheli = D.satirlar.filter((s) => s.guven === 'dusuk' || s.guven === 'orta').length;

  ge.ozet.textContent = '';
  const ekle = (metin, kotu = false) => {
    const s = document.createElement('span');
    if (kotu) s.className = 'kotu';
    s.innerHTML = metin;
    ge.ozet.append(s);
  };
  ekle(`<b>${D.satirlar.length}</b> satır`);
  ekle(`<b>${adet}</b> parça`);
  ekle(`<b>${yuvarla(m2, 2)}</b> m²`);
  if (supheli) ekle(`<b>${supheli}</b> şüpheli satır — kâğıtla karşılaştır`);
  if (hataliSayi) ekle(`<b>${hataliSayi}</b> eksik satır (Excel'e girmez)`, true);
}

/* --------------------------------------------------------------- çıktı --- */

/** Kâğıttaki birinci ve ikinci sayının adı. */
function olcuAdlari() {
  return D.olcuSirasi === 'en-boy' ? ['En', 'Boy'] : ['Boy', 'En'];
}

function basliklar() {
  const b = D.birim;
  const [bir, iki] = olcuAdlari();
  return ['Sıra', `${bir} (${b})`, `${iki} (${b})`, 'Adet',
    `Bant ${bir}`, `Bant ${iki}`, 'Plaka / grup', 'Açıklama', 'Kâğıtta yazan', 'Güven'];
}

const GUVEN_ADI = { yuksek: 'yüksek', orta: 'orta', dusuk: 'DÜŞÜK — kontrol et' };

function ciktiSatirlari() {
  return D.satirlar
    .filter((s) => !satirDenetle(s).hata)
    .map((s, i) => [
      i + 1,
      s.en,
      s.boy,
      s.adet,
      s.bant1 || '',
      s.bant2 || '',
      s.grup,
      s.aciklama,
      s.okunan,
      GUVEN_ADI[s.guven] || '',
    ]);
}

function dosyaAdi(uzanti) {
  const bugun = new Date().toISOString().slice(0, 10);
  const ad = (D.musteri || 'kesim-listesi')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim()
    .slice(0, 40) || 'kesim-listesi';
  return `${ad} ${bugun}.${uzanti}`;
}

function excelIndir() {
  const satirlar = ciktiSatirlari();
  if (!satirlar.length) { bildir('hata', 'Aktarılacak geçerli satır yok.'); return; }
  const blob = xlsxOlustur({
    sayfaAdi: 'Kesim Listesi',
    basliklar: basliklar(),
    satirlar,
    genislikler: [6, 11, 11, 7, 10, 10, 14, 22, 26, 18],
  });
  indir(blob, dosyaAdi('xlsx'));
  bildir('tamam', `${satirlar.length} satır Excel'e aktarıldı.`);
}

function makineIndir() {
  const gecerli = D.satirlar.filter((s) => !satirDenetle(s).hata);
  if (!gecerli.length) { bildir('hata', 'Aktarılacak geçerli satır yok.'); return; }

  const uyarilar = makineUyarilari(gecerli, D.makine);
  const blob = xlsxOlustur({
    sayfaAdi: 'Sayfa1',
    basliklar: MAKINE_BASLIKLAR,
    satirlar: makineSatirlari(gecerli, D.makine),
    genislikler: MAKINE_GENISLIK,
  });
  indir(blob, dosyaAdi('xlsx').replace('.xlsx', ' MAKINE.xlsx'));

  const kuyruk = uyarilar.length ? ` Dikkat: ${uyarilar.join(' ')}` : '';
  bildir(uyarilar.length ? 'hata' : 'tamam',
    `${gecerli.length} satır makine biçiminde indirildi.${kuyruk}`);
}

function csvIndir() {
  const satirlar = ciktiSatirlari();
  if (!satirlar.length) { bildir('hata', 'Aktarılacak geçerli satır yok.'); return; }
  indir(csvOlustur(basliklar(), satirlar), dosyaAdi('csv'));
  bildir('tamam', `${satirlar.length} satır CSV'ye aktarıldı.`);
}

async function panoyaKopyala() {
  const satirlar = ciktiSatirlari();
  if (!satirlar.length) { bildir('hata', 'Kopyalanacak satır yok.'); return; }
  // Sekmeyle ayrılmış metin, Excel'e yapıştırınca hücrelere dağılır.
  const metin = [basliklar(), ...satirlar]
    .map((r) => r.map((d) => String(d ?? '').replace(/[\t\n\r]+/g, ' ')).join('\t'))
    .join('\n');
  try {
    await navigator.clipboard.writeText(metin);
    bildir('tamam', 'Kopyalandı — Excel\'e yapıştır.');
  } catch {
    bildir('hata', 'Panoya erişilemedi. Excel düğmesini kullan.');
  }
}

/* ------------------------------------------------------------- kaydetme --- */

function kaydet() {
  sonIs.koy({
    surum: APP_VERSION,
    musteri: D.musteri,
    malzeme: D.malzeme,
    birim: D.birim,
    olcuSirasi: D.olcuSirasi,
    notlar: D.notlar,
    satirlar: D.satirlar,
  });
}

function geriYukle() {
  const s = sonIs.al();
  if (!s || !Array.isArray(s.satirlar) || !s.satirlar.length) return;
  D.musteri = s.musteri || '';
  D.malzeme = s.malzeme || '';
  D.birim = s.birim === 'cm' ? 'cm' : 'mm';
  if (s.olcuSirasi === 'en-boy' || s.olcuSirasi === 'boy-en') D.olcuSirasi = s.olcuSirasi;
  D.notlar = Array.isArray(s.notlar) ? s.notlar : [];
  D.satirlar = s.satirlar.map((x) => yeniSatir(x));
  ge.musteri.value = D.musteri;
  ge.malzeme.value = D.malzeme;
  ge.birim.value = D.birim;
  ge.olcuSirasi.value = D.olcuSirasi;
  tabloCiz();
  bildir('', 'Önceki liste geri yüklendi.');
}

/* ------------------------------------------------------------- bağlantı --- */

function baglantilar() {
  ge.dosya.addEventListener('change', () => {
    dosyalariAl(ge.dosya.files);
    ge.dosya.value = '';   // aynı dosya tekrar seçilebilsin
  });

  ge.fotoTemizle.addEventListener('click', () => {
    D.gorseller = [];
    fotograflariCiz();
  });

  for (const olay of ['dragenter', 'dragover']) {
    ge.birakma.addEventListener(olay, (e) => {
      e.preventDefault();
      ge.birakma.classList.add('uzerinde');
    });
  }
  for (const olay of ['dragleave', 'drop']) {
    ge.birakma.addEventListener(olay, (e) => {
      e.preventDefault();
      ge.birakma.classList.remove('uzerinde');
    });
  }
  ge.birakma.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) dosyalariAl(e.dataTransfer.files);
  });

  ge.anahtar.addEventListener('input', () => {
    apiAnahtari.koy(ge.anahtar.value.trim());
    dugmeleriTazele();
  });
  ge.anahtarGoster.addEventListener('click', () => {
    const gizli = ge.anahtar.type === 'password';
    ge.anahtar.type = gizli ? 'text' : 'password';
    ge.anahtarGoster.textContent = gizli ? 'Gizle' : 'Göster';
  });
  ge.anahtarSil.addEventListener('click', () => {
    ge.anahtar.value = '';
    apiAnahtari.sil();
    dugmeleriTazele();
  });

  ge.oku.addEventListener('click', okumayiBaslat);
  ge.iptal.addEventListener('click', () => istekKontrol?.abort());

  ge.musteri.addEventListener('input', () => { D.musteri = ge.musteri.value; kaydet(); });
  ge.malzeme.addEventListener('input', () => { D.malzeme = ge.malzeme.value; kaydet(); });
  ge.birim.addEventListener('change', () => { D.birim = ge.birim.value; tabloCiz(); });
  ge.olcuSirasi.addEventListener('change', () => {
    D.olcuSirasi = ge.olcuSirasi.value;
    tabloCiz();
  });

  for (const [alan, oge] of [
    ['plakaRenk', ge.plakaRenk], ['plakaOlcu', ge.plakaOlcu],
    ['bantIsareti', ge.bantIsareti], ['yonDamarli', ge.yonDamarli],
    ['yonSerbest', ge.yonSerbest],
  ]) {
    oge.addEventListener('input', () => {
      D.makine[alan] = oge.value;
      ayarlar.koy({ olcuSirasi: D.olcuSirasi, makine: D.makine });
    });
  }

  const ekle = () => {
    const ham = ge.hizliGiris.value.trim();
    if (!ham) return;
    // Ayrıştırıcıya birim çevirtmiyoruz: yazdığın sayı tablodaki birimde
    // duruyor, arada dönüştürmek karışıklık yaratır.
    const r = satirCoz(ham);
    if (!r.ok) { bildir('hata', r.hata); return; }
    const b = bantSayilari(r.parca.bant);
    D.satirlar.push(yeniSatir({
      en: r.parca.en,
      boy: r.parca.boy,
      adet: r.parca.adet,
      bant1: b.bant1,
      bant2: b.bant2,
      damar: r.parca.damar,
      aciklama: r.parca.aciklama,
      okunan: ham,
    }));
    ge.hizliGiris.value = '';
    tabloCiz();
    bildir('', r.uyarilar.join(' '));
  };
  ge.satirEkle.addEventListener('click', ekle);
  ge.hizliGiris.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ekle(); }
  });

  ge.makine.addEventListener('click', makineIndir);
  ge.excel.addEventListener('click', excelIndir);
  ge.csv.addEventListener('click', csvIndir);
  ge.kopyala.addEventListener('click', panoyaKopyala);
  ge.tabloTemizle.addEventListener('click', () => {
    if (D.satirlar.length && !confirm('Tablodaki bütün satırlar silinecek. Emin misin?')) return;
    D.satirlar = [];
    D.notlar = [];
    sonIs.sil();
    tabloCiz();
    ge.bolumTablo.hidden = true;
  });

  const kapat = () => { ge.buyutec.hidden = true; ge.buyutecResim.src = ''; };
  ge.buyutecKapat.addEventListener('click', kapat);
  ge.buyutec.addEventListener('click', (e) => { if (e.target === ge.buyutec) kapat(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') kapat(); });

  window.addEventListener('beforeunload', (e) => {
    if (D.satirlar.length) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ------------------------------------------------------------- başlangıç --- */

function basla() {
  baglantilar();

  const kayitli = ayarlar.al({ olcuSirasi: 'boy-en', makine: { ...MAKINE_VARSAYILAN } });
  D.olcuSirasi = kayitli.olcuSirasi === 'en-boy' ? 'en-boy' : 'boy-en';
  D.makine = { ...MAKINE_VARSAYILAN, ...(kayitli.makine || {}) };
  ge.olcuSirasi.value = D.olcuSirasi;
  ge.plakaRenk.value = D.makine.plakaRenk;
  ge.plakaOlcu.value = D.makine.plakaOlcu;
  ge.bantIsareti.value = D.makine.bantIsareti;
  ge.yonDamarli.value = D.makine.yonDamarli;
  ge.yonSerbest.value = D.makine.yonSerbest;

  ge.anahtar.value = apiAnahtari.al();
  if (ge.anahtar.value) ge.anahtarKutusu.open = false;
  else ge.anahtarKutusu.open = true;

  if (!depoCalisiyor()) {
    bildir('hata', 'Tarayıcı depolaması kapalı — anahtar ve liste kaydedilmez (gizli pencere?).');
  }

  dugmeleriTazele();
  fotograflariCiz();
  geriYukle();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* çevrimdışı desteği olmasa da olur */ });
  }
}

basla();
