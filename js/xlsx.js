// Excel (.xlsx) ve CSV yazıcı — dış kütüphane yok.
//
// Neden hazır kütüphane değil: bu uygulama internetsiz de açılsın diye
// hiçbir CDN'e bağlanmıyor. .xlsx zaten içinde birkaç XML dosyası olan bir
// zip; sıkıştırmadan (stored) yazınca kodu bir ekrana sığıyor.
//
// Neden düz CSV yetmiyor: Türkçe Windows'ta Excel ayracı noktalı virgül
// bekler, CSV'yi virgülle yazarsan bütün satır tek hücreye düşer. Ayrıca
// CSV'de "0600" gibi ölçüler metne dönüşür. Gerçek xlsx'te sayı sayıdır.

/* ---------------------------------------------------------------- zip ---- */

const CRC_TABLO = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bayt) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bayt.length; i += 1) c = CRC_TABLO[(c ^ bayt[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Sıkıştırmasız zip üretir.
 * @param {Array<{ad: string, veri: Uint8Array}>} dosyalar
 */
function zipYaz(dosyalar) {
  const kodlayici = new TextEncoder();
  const yerel = [];
  const merkez = [];
  let konum = 0;

  // Zip'te tarih 1980 tabanlı DOS biçiminde; sabit veriyoruz ki aynı liste
  // her seferinde bayt bayt aynı dosyayı üretsin.
  const saat = 0;
  const tarih = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const d of dosyalar) {
    const ad = kodlayici.encode(d.ad);
    const crc = crc32(d.veri);
    const n = d.veri.length;

    const bas = new Uint8Array(30 + ad.length);
    const gb = new DataView(bas.buffer);
    gb.setUint32(0, 0x04034b50, true);
    gb.setUint16(4, 20, true);        // gereken sürüm
    gb.setUint16(6, 0x0800, true);    // dosya adları UTF-8
    gb.setUint16(8, 0, true);         // sıkıştırma yok
    gb.setUint16(10, saat, true);
    gb.setUint16(12, tarih, true);
    gb.setUint32(14, crc, true);
    gb.setUint32(18, n, true);
    gb.setUint32(22, n, true);
    gb.setUint16(26, ad.length, true);
    gb.setUint16(28, 0, true);
    bas.set(ad, 30);

    yerel.push(bas, d.veri);

    const mrk = new Uint8Array(46 + ad.length);
    const mb = new DataView(mrk.buffer);
    mb.setUint32(0, 0x02014b50, true);
    mb.setUint16(4, 20, true);
    mb.setUint16(6, 20, true);
    mb.setUint16(8, 0x0800, true);
    mb.setUint16(10, 0, true);
    mb.setUint16(12, saat, true);
    mb.setUint16(14, tarih, true);
    mb.setUint32(16, crc, true);
    mb.setUint32(20, n, true);
    mb.setUint32(24, n, true);
    mb.setUint16(28, ad.length, true);
    mb.setUint32(42, konum, true);    // yerel başlığın yeri
    mrk.set(ad, 46);
    merkez.push(mrk);

    konum += bas.length + n;
  }

  const merkezBoy = merkez.reduce((s, m) => s + m.length, 0);
  const son = new Uint8Array(22);
  const sb = new DataView(son.buffer);
  sb.setUint32(0, 0x06054b50, true);
  sb.setUint16(8, dosyalar.length, true);
  sb.setUint16(10, dosyalar.length, true);
  sb.setUint32(12, merkezBoy, true);
  sb.setUint32(16, konum, true);

  const parcalar = [...yerel, ...merkez, son];
  const toplam = parcalar.reduce((s, p) => s + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let y = 0;
  for (const p of parcalar) { cikti.set(p, y); y += p.length; }
  return cikti;
}

/* --------------------------------------------------------------- xlsx ---- */

function kacis(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Excel denetim karakterlerini kabul etmez; sekme ve satır sonu kalsın.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function sutunHarfi(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const k = (n - 1) % 26;
    s = String.fromCharCode(65 + k) + s;
    n = Math.floor((n - k) / 26);
  }
  return s;
}

function hucre(ref, deger, kalin) {
  const s = kalin ? ' s="1"' : '';
  if (deger === null || deger === undefined || deger === '') return `<c r="${ref}"${s}/>`;
  if (typeof deger === 'number' && Number.isFinite(deger)) {
    return `<c r="${ref}"${s}><v>${deger}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${kacis(deger)}</t></is></c>`;
}

const XML_BAS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const AD_ALANI = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const ILISKI = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Tek sayfalık bir .xlsx üretir.
 * @param {object} p { sayfaAdi, basliklar: string[], satirlar: Array<Array>, genislikler?: number[] }
 * @returns {Blob}
 */
export function xlsxOlustur({ sayfaAdi = 'Sayfa1', basliklar = [], satirlar = [], genislikler = [] }) {
  const kodlayici = new TextEncoder();
  const sutunSayisi = Math.max(basliklar.length, ...satirlar.map((r) => r.length), 1);

  const cols = genislikler.length
    ? `<cols>${genislikler.map((g, i) => `<col min="${i + 1}" max="${i + 1}" width="${g}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const satirXml = [];
  if (basliklar.length) {
    satirXml.push(`<row r="1">${basliklar.map((b, i) => hucre(`${sutunHarfi(i)}1`, b, true)).join('')}</row>`);
  }
  satirlar.forEach((satir, r) => {
    const no = r + (basliklar.length ? 2 : 1);
    satirXml.push(`<row r="${no}">${satir.map((d, i) => hucre(`${sutunHarfi(i)}${no}`, d, false)).join('')}</row>`);
  });

  const sonSatir = satirlar.length + (basliklar.length ? 1 : 0);
  const donma = basliklar.length
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    : '';
  const suzgec = basliklar.length && satirlar.length
    ? `<autoFilter ref="A1:${sutunHarfi(sutunSayisi - 1)}${sonSatir}"/>`
    : '';

  const sayfa = `${XML_BAS}<worksheet xmlns="${AD_ALANI}">`
    + `<dimension ref="A1:${sutunHarfi(sutunSayisi - 1)}${Math.max(sonSatir, 1)}"/>`
    + `<sheetViews><sheetView workbookViewId="0">${donma}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + cols
    + `<sheetData>${satirXml.join('')}</sheetData>`
    + suzgec
    + '</worksheet>';

  const dosyalar = [
    {
      ad: '[Content_Types].xml',
      veri: `${XML_BAS}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>',
    },
    {
      ad: '_rels/.rels',
      veri: `${XML_BAS}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="${ILISKI}/officeDocument" Target="xl/workbook.xml"/>`
        + '</Relationships>',
    },
    {
      ad: 'xl/workbook.xml',
      veri: `${XML_BAS}<workbook xmlns="${AD_ALANI}" xmlns:r="${ILISKI}">`
        + `<sheets><sheet name="${kacis(sayfaAdi).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>`
        + '</workbook>',
    },
    {
      ad: 'xl/_rels/workbook.xml.rels',
      veri: `${XML_BAS}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="${ILISKI}/worksheet" Target="worksheets/sheet1.xml"/>`
        + `<Relationship Id="rId2" Type="${ILISKI}/styles" Target="styles.xml"/>`
        + '</Relationships>',
    },
    {
      ad: 'xl/styles.xml',
      veri: `${XML_BAS}<styleSheet xmlns="${AD_ALANI}">`
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        + '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="2"><fill><patternFill patternType="none"/></fill>'
        + '<fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
        + '</styleSheet>',
    },
    { ad: 'xl/worksheets/sheet1.xml', veri: sayfa },
  ].map((d) => ({ ad: d.ad, veri: kodlayici.encode(d.veri) }));

  return new Blob([zipYaz(dosyalar)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ---------------------------------------------------------------- csv ---- */

/**
 * Türkçe Excel'in beklediği CSV: BOM + noktalı virgül ayraç + ondalık virgül.
 */
export function csvOlustur(basliklar, satirlar) {
  const alan = (d) => {
    if (d === null || d === undefined) return '';
    if (typeof d === 'number') return String(d).replace('.', ',');
    const s = String(d);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const metin = [basliklar, ...satirlar].map((r) => r.map(alan).join(';')).join('\r\n');
  return new Blob([`﻿${metin}\r\n`], { type: 'text/csv;charset=utf-8' });
}

/** Blob'u indirir. */
export function indir(blob, dosyaAdi) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dosyaAdi;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
