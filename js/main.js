// Uygulama kabuğu: fotoğraf → okuma → kontrol tablosu → Excel.

import { gorselHazirla } from './foto.js';
import { fotograftanOku, anahtarGecerliBicimde, MODEL } from './ocr.js';
import { xlsxOlustur, csvOlustur, indir } from './xlsx.js';
import { bantKodCoz, bantKodYaz, kimlik, yuvarla } from './olcu.js';
import { satirCoz } from './parse.js';
import { apiAnahtari, sonIs, depoCalisiyor } from './depo.js';

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
  notlar: [],
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
    en: alan.en ?? 0,
    boy: alan.boy ?? 0,
    adet: alan.adet ?? 1,
    bantKod: alan.bantKod ?? '',
    aciklama: alan.aciklama ?? '',
    okunan: alan.okunan ?? '',
    guven: alan.guven ?? '',
  };
}

/** Satırı gözden geçirir: {hata: bool, notlar: string[]} */
function satirDenetle(s) {
  const notlar = [];
  let hata = false;

  if (!(s.en > 0) || !(s.boy > 0)) { notlar.push('Ölçü eksik.'); hata = true; }
  if (!Number.isInteger(s.adet) || s.adet <= 0) { notlar.push('Adet geçersiz.'); hata = true; }

  if (s.bantKod) {
    const c = bantKodCoz(s.bantKod, s.en, s.boy);
    if (c.uyari) notlar.push(c.uyari);
  }

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
  ge.oku.disabled = D.gorseller.length === 0 || !anahtar;
  const tamam = anahtarGecerliBicimde(anahtar);
  ge.anahtarDurum.textContent = anahtar ? (tamam ? 'kayıtlı' : 'biçim şüpheli') : 'girilmedi';
  ge.anahtarDurum.className = `rozet ${anahtar && tamam ? 'tamam' : 'eksik'}`;
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
  if (!D.gorseller.length || !anahtar) return;

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
    en: sayiya(p.en),
    boy: sayiya(p.boy),
    adet: Math.max(1, Math.round(sayiya(p.adet)) || 1),
    bantKod: (p.bantKod || '').trim(),
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
      metinHucresi(s, 'bantKod', 'bant', '1U1K'),
      metinHucresi(s, 'aciklama', 'aciklama', ''),
      metinHucresi(s, 'okunan', 'okunan', ''),
      silHucresi(s),
    );
    ge.govde.append(tr);

    if (notlar.length) {
      const notTr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
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

function basliklar() {
  const b = D.birim;
  return ['Sıra', `En (${b})`, `Boy (${b})`, 'Adet', 'Bant', 'Açıklama', 'Kâğıtta yazan', 'Güven'];
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
      s.bantKod ? bantKodYaz(bantKodCoz(s.bantKod, s.en, s.boy).bant, s.en, s.boy) : '',
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
    genislikler: [6, 11, 11, 7, 11, 24, 26, 18],
  });
  indir(blob, dosyaAdi('xlsx'));
  bildir('tamam', `${satirlar.length} satır Excel'e aktarıldı.`);
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
  D.notlar = Array.isArray(s.notlar) ? s.notlar : [];
  D.satirlar = s.satirlar.map((x) => yeniSatir(x));
  ge.musteri.value = D.musteri;
  ge.malzeme.value = D.malzeme;
  ge.birim.value = D.birim;
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

  const ekle = () => {
    const ham = ge.hizliGiris.value.trim();
    if (!ham) return;
    // Ayrıştırıcıya birim çevirtmiyoruz: yazdığın sayı tablodaki birimde
    // duruyor, arada dönüştürmek karışıklık yaratır.
    const r = satirCoz(ham);
    if (!r.ok) { bildir('hata', r.hata); return; }
    const kod = bantKodYaz(r.parca.bant, r.parca.en, r.parca.boy);
    D.satirlar.push(yeniSatir({
      en: r.parca.en,
      boy: r.parca.boy,
      adet: r.parca.adet,
      bantKod: kod === 'yok' ? '' : kod,
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
