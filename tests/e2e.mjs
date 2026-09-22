// Uygulamayı gerçek bir tarayıcıda uçtan uca sürer:
//   node tests/e2e.mjs
//
// Anthropic'e giden istek yakalanıp sahte yanıtla karşılanır — gerçek
// anahtar ve gerçek para harcanmaz, ama ocr.js'in fetch yolu, yanıtı
// çözmesi, tablonun dolması ve Excel'in üretilmesi gerçekten çalışır.
//
// Playwright kurulu değilse test atlanır (uygulamanın kendisinin hiçbir
// bağımlılığı yok; bu yalnızca geliştirme aracı):
//   npm i -D playwright && npx playwright install chromium

import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('Playwright kurulu değil — tarayıcı testi atlandı.');
  console.log('Kurmak için:  npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const KOK = fileURLToPath(new URL('..', import.meta.url));

/* ------------------------------------------------------- sahte veriler -- */

const SAHTE_SONUC = {
  musteri: 'Öz Demir Mobilya',
  malzeme: 'Suntalam 18mm beyaz',
  olcuBirimi: 'cm',
  parcalar: [
    // Kâğıttaki kural: altı tek çizgili ölçünün bir kenarı, çift çizgilinin
    // iki kenarı bantlanır.
    { satirNo: 1, olcu1: 65.6, olcu2: 58, adet: 3, altCizgi1: 0, altCizgi2: 1, grup: '', aciklama: 'kapak', okunanMetin: '65.6 x 58 = 3', guven: 'yuksek' },
    { satirNo: 2, olcu1: 78.2, olcu2: 58, adet: 14, altCizgi1: 2, altCizgi2: 0, grup: '', aciklama: '', okunanMetin: '78.2 x 58 = 14', guven: 'orta' },
    { satirNo: 3, olcu1: 79.5, olcu2: 28.2, adet: 1, altCizgi1: 0, altCizgi2: 0, grup: 'Arbolit', aciklama: '', okunanMetin: '79.5 x 28.2 = 1', guven: 'dusuk' },
    // Ölçüsü okunamamış satır: tabloda kırmızı görünmeli, Excel'e girmemeli.
    { satirNo: 4, olcu1: 0, olcu2: 40, adet: 2, altCizgi1: 0, altCizgi2: 0, grup: '', aciklama: 'okunamadı', okunanMetin: '??? x 40 = 2', guven: 'dusuk' },
  ],
  notlar: ['Sağ sütunun başında "Arbolit" yazıyor.', '5. satırın üstü çizilmiş, alınmadı.'],
};

/** Kamera fotoğrafı yerine geçecek, 1568'den büyük bir PNG üretir. */
function testGorseli(en = 2400, boy = 3200) {
  const satirlar = [];
  for (let y = 0; y < boy; y += 1) {
    const v = (y % 120) > 4 ? 245 : 120;         // kâğıt gibi yatay çizgiler
    const satir = Buffer.alloc(en * 3 + 1);
    for (let x = 0; x < en; x += 1) {
      satir[1 + x * 3] = v;
      satir[2 + x * 3] = v;
      satir[3 + x * 3] = Math.max(0, v - 8);
    }
    satirlar.push(satir);
  }
  const parca = (tur, veri) => {
    const govde = Buffer.concat([Buffer.from(tur), veri]);
    const bas = Buffer.alloc(4);
    bas.writeUInt32BE(veri.length);
    const son = Buffer.alloc(4);
    son.writeUInt32BE(crc32(govde) >>> 0);
    return Buffer.concat([bas, govde, son]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(en, 0);
  ihdr.writeUInt32BE(boy, 4);
  ihdr[8] = 8;    // bit derinliği
  ihdr[9] = 2;    // renk tipi: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr),
    parca('IDAT', deflateSync(Buffer.concat(satirlar), { level: 6 })),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- sunucu -- */

const TURLER = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sunucuBaslat() {
  const s = createServer(async (istek, yanit) => {
    try {
      let yol = decodeURIComponent(new URL(istek.url, 'http://x').pathname);
      if (yol.endsWith('/')) yol += 'index.html';
      // Dizin dışına çıkmayı engelle
      const tam = join(KOK, normalize(yol).replace(/^(\.\.[/\\])+/, ''));
      if (!tam.startsWith(KOK)) { yanit.writeHead(403).end(); return; }
      const govde = await readFile(tam);
      yanit.writeHead(200, { 'content-type': TURLER[extname(tam)] || 'application/octet-stream' });
      yanit.end(govde);
    } catch {
      yanit.writeHead(404, { 'content-type': 'text/plain' }).end('yok');
    }
  });
  return new Promise((coz) => s.listen(0, '127.0.0.1', () => coz({ s, port: s.address().port })));
}

/* ---------------------------------------------------------------- test --- */

let hata = 0;
let gecen = 0;
function bak(kosul, ad) {
  if (kosul) { gecen += 1; console.log(`  ok  ${ad}`); }
  else { hata += 1; console.error(`HATA  ${ad}`); }
}

const { s: sunucu, port } = await sunucuBaslat();
const gecici = await mkdtemp(join(tmpdir(), 'fason-e2e-'));
const gorselYolu = join(gecici, 'kagit.png');
await writeFile(gorselYolu, testGorseli());

const tarayici = await chromium.launch();
const baglam = await tarayici.newContext({ acceptDownloads: true });
const p = await baglam.newPage();

const konsol = [];
p.on('console', (m) => { if (m.type() === 'error') konsol.push(m.text()); });
p.on('pageerror', (e) => konsol.push(`pageerror: ${e.message}`));

// Blob indirmelerinde başlıksız Chromium her dosyaya "download" der; bizim
// kodun gerçekten yazdığı adı görmek için download niteliğini yakalıyoruz.
await p.addInitScript(() => {
  window.__inenAdlar = [];
  const asil = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function kaydet(...args) {
    if (this.download) window.__inenAdlar.push(this.download);
    return asil.apply(this, args);
  };
});

let istekGovdesi = null;
let istekBasliklari = null;
await p.route('https://api.anthropic.com/**', async (yol, istek) => {
  istekGovdesi = JSON.parse(istek.postData() || '{}');
  istekBasliklari = await istek.allHeaders();
  await yol.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: JSON.stringify(SAHTE_SONUC) }],
      parsed_output: SAHTE_SONUC,
      stop_reason: 'end_turn',
      usage: { input_tokens: 1750, output_tokens: 430 },
    }),
  });
});

try {
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  bak(await p.title() === 'Fason Kesim — Ölçü Okuyucu', 'sayfa açıldı');

  // --- ÜCRETSİZ YOL: elle yazma/yapıştırma. Programın omurgası bu;
  // API anahtarı olmadan da tam çalışmalı.
  await p.fill('#toplu-giris', ['29x58=1', '65.6x58=3 0/1', '78.2x58=14 2/0', 'zırva satır'].join('\n'));
  await p.click('#toplu-ekle');
  await p.waitForSelector('#tablo-govde tr', { timeout: 10000 });
  const elleSatir = await p.locator('#tablo-govde tr').evaluateAll(
    (trs) => trs.filter((t) => t.querySelector('td.sira')).length,
  );
  bak(elleSatir === 3, `anahtarsız 3 satır eklendi (${elleSatir})`);
  bak((await p.inputValue('#toplu-giris')).trim() === 'zırva satır',
    'anlaşılmayan satır kutuda kaldı, anlaşılanlar silindi');
  bak((await p.textContent('#giris-durum')).includes('anlaşılmadı'), 'hatalı satır bildirildi');
  const elleBant = await p.locator('#tablo-govde select.bant').evaluateAll((g) => g.map((x) => x.value));
  bak(elleBant.slice(0, 6).join(',') === '0,0,0,1,2,0', `bant yazımı çözüldü (${elleBant.slice(0, 6)})`);
  bak((await p.textContent('#ozet')).includes('18 parça'), 'adetler = ile doğru okundu');

  // Elle eklenenleri temizleyip otomatik yola geç
  await p.click('#tabloyu-temizle');
  await p.waitForTimeout(200);
  await p.fill('#toplu-giris', '');

  await p.click('#otomatik-kutusu > summary');
  // Anahtar yokken düğme ölü durmamalı: ne gerektiğini söylemeli ve
  // basınca anahtar kutusuna götürmeli. (Usta "düğme koyu, deneyemedim"
  // dediği için eklendi.)
  bak(!(await p.isDisabled('#oku-dugmesi')), 'anahtar yokken düğme ölü değil');
  bak((await p.textContent('#oku-dugmesi')).includes('anahtar'),
    `düğme eksiği söylüyor (${(await p.textContent('#oku-dugmesi')).trim()})`);
  await p.click('#oku-dugmesi');
  await p.waitForTimeout(200);
  bak((await p.textContent('#durum')).includes('anahtar'), 'basınca anahtarın gerektiğini açıklıyor');
  bak(await p.evaluate(() => document.getElementById('anahtar-kutusu').open),
    'anahtar kutusu kendiliğinden açıldı');

  await p.fill('#api-anahtari', `sk-ant-api03-${'a'.repeat(40)}`);
  bak(await p.textContent('#anahtar-durum') === 'kayıtlı', 'anahtar biçimi kabul edildi');
  bak((await p.textContent('#oku-dugmesi')).includes('fotoğraf'),
    'anahtar girilince eksik olarak fotoğrafı gösteriyor');

  await p.setInputFiles('#dosya-girisi', gorselYolu);
  await p.waitForSelector('.foto img', { timeout: 15000 });
  const altyazi = await p.textContent('.foto figcaption');
  bak(/1\. sayfa/.test(altyazi), 'fotoğraf eklendi');
  bak(/×1568|1568×/.test(altyazi), `uzun kenar 1568'e indirildi (${altyazi})`);

  bak((await p.textContent('#oku-dugmesi')).trim() === 'Ölçüleri oku', 'her şey tamam, düğme okumaya hazır');
  await p.click('#oku-dugmesi');
  await p.waitForSelector('#tablo-govde tr', { timeout: 20000 });

  bak(istekGovdesi?.model === 'claude-opus-5', 'istek doğru modele gitti');
  bak(istekGovdesi?.output_config?.format?.type === 'json_schema', 'yapılandırılmış çıktı istendi');
  bak(istekGovdesi?.max_tokens > 0, 'max_tokens verildi');
  bak(istekGovdesi?.messages?.[0]?.content?.[0]?.type === 'image', 'görsel gönderildi');
  bak(istekGovdesi?.messages?.[0]?.content?.[0]?.source?.media_type === 'image/jpeg', 'görsel JPEG olarak gitti');
  bak(istekBasliklari?.['anthropic-dangerous-direct-browser-access'] === 'true', 'tarayıcıdan doğrudan erişim başlığı var');
  bak(istekBasliklari?.['anthropic-version'] === '2023-06-01', 'sürüm başlığı doğru');

  const satirSay = () => p.locator('#tablo-govde tr').evaluateAll(
    (trs) => trs.filter((t) => t.querySelector('td.sira')).length,
  );
  bak(await satirSay() === 4, 'tabloda 4 satır var');
  bak(await p.inputValue('#musteri') === 'Öz Demir Mobilya', 'müşteri adı dolduruldu');
  bak((await p.inputValue('#malzeme')).includes('Suntalam'), 'malzeme dolduruldu');
  bak(await p.locator('tr.guven-dusuk').count() === 2, 'düşük güvenli satırlar işaretlendi');
  bak(await p.locator('tr.guven-orta').count() === 1, 'orta güvenli satır işaretlendi');
  bak(await p.locator('tr.hatali').count() === 1, 'ölçüsü eksik satır hatalı işaretlendi');
  bak(await p.locator('#notlar li').count() === 2, 'kâğıt notları gösterildi');
  bak(await p.locator('#tablo-govde .okunan').first().inputValue() === '65.6 x 58 = 3',
    'kâğıtta yazan sütunu dolu');
  bak(await p.inputValue('#birim') === 'cm', 'birim kâğıttan cm olarak alındı');
  // Alt çizgi sayıları bant seçimlerine dönmüş mü?
  const bantlar = await p.locator('#tablo-govde select.bant').evaluateAll((g) => g.map((x) => x.value));
  bak(bantlar.slice(0, 4).join(',') === '0,1,2,0', `bant sayıları alt çizgiden geldi (${bantlar.slice(0, 4)})`);
  bak(await p.locator('#tablo-govde .grup').nth(2).inputValue() === 'Arbolit', 'öbek başlığı satıra yazıldı');
  const ozet = (await p.textContent('#ozet')).replace(/\s+/g, ' ');
  bak(/4 satır/.test(ozet) && /1 eksik satır/.test(ozet), `özet doğru (${ozet})`);
  bak(/\$0\./.test(await p.textContent('#durum')), 'okuma maliyeti gösterildi');

  await p.fill('#hizli-giris', '72.7x22.7=1 2/2 // test');
  await p.press('#hizli-giris', 'Enter');
  await p.waitForFunction(
    () => [...document.querySelectorAll('#tablo-govde tr')].filter((t) => t.querySelector('td.sira')).length === 5,
    null, { timeout: 5000 },
  );
  bak(true, 'elle satır eklendi');

  const [inenXlsx] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.click('#excel-indir'),
  ]);
  const xlsxYolu = join(gecici, 'cikti.xlsx');
  await inenXlsx.saveAs(xlsxYolu);
  const adlar = await p.evaluate(() => window.__inenAdlar);
  bak(/^Öz Demir Mobilya \d{4}-\d{2}-\d{2}\.xlsx$/.test(adlar.at(-1)),
    `dosya adı müşteri + tarihten kuruldu (${adlar.at(-1)})`);
  const bayt = readFileSync(xlsxYolu);
  bak(bayt[0] === 0x50 && bayt[1] === 0x4b, 'inen dosya geçerli zip');
  const icerik = bayt.toString('utf8');
  bak(icerik.includes('<v>65.6</v>'), 'ölçü Excel’e sayı olarak gitti');
  bak(icerik.includes('Öz Demir Mobilya') === false, 'müşteri adı sayfaya değil dosya adına yazıldı');
  bak(!icerik.includes('okunamadı'), 'ölçüsü eksik satır Excel’e girmedi');
  bak(icerik.includes('65.6 x 58 = 3'), 'kâğıtta yazan sütunu Excel’e gitti');

  // Makine biçimi: şablonun sütun düzeniyle birebir inmeli.
  await p.click('#makine-kutusu > summary');
  await p.fill('#plaka-renk', 'BEYAZ');
  await p.fill('#plaka-olcu', '2100x2800');
  await p.fill('#bant-isareti', 'X');
  const [inenMakine] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.click('#makine-indir'),
  ]);
  const makineYolu = join(gecici, 'makine.xlsx');
  await inenMakine.saveAs(makineYolu);
  const adlarM = await p.evaluate(() => window.__inenAdlar);
  bak(adlarM.at(-1).endsWith(' MAKINE.xlsx'), `makine dosyası ayrı adla indi (${adlarM.at(-1)})`);
  const makineIcerik = readFileSync(makineYolu).toString('utf8');
  for (const baslik of ['PLAKA RENK', 'PLAKA ÖLÇÜ', 'ÖLÇÜ BOY', 'ÖLÇÜ EN', 'ÖLÇÜ ADET', 'YÖN', 'BAND BOY', 'BAND EN']) {
    bak(makineIcerik.includes(baslik), `makine başlığı yerinde: ${baslik}`);
  }
  bak(makineIcerik.includes('BEYAZ') && makineIcerik.includes('2100x2800'),
    'plaka bilgisi satırlara yazıldı');
  bak(makineIcerik.includes('Arbolit'), 'öbek başlığı PLAKA RENK sütununa geçti');

  const [inenCsv] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.click('#csv-indir'),
  ]);
  await inenCsv.saveAs(join(gecici, 'cikti.csv'));
  const adlar2 = await p.evaluate(() => window.__inenAdlar);
  bak(adlar2.at(-1).endsWith('.csv'), 'CSV de indi');

  // Telefon genişliği: sayfanın tamamı yana kaymamalı, tablo kendi
  // kutusunda kaymalı. (Bu denetim gerçek bir taşma hatası yakaladı.)
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  const tasma = await p.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  bak(tasma <= 1, `telefonda yatay taşma yok (${tasma}px)`);

  bak(konsol.length === 0, `konsol temiz${konsol.length ? `: ${konsol.join(' | ')}` : ''}`);
} finally {
  await tarayici.close();
  sunucu.close();
}

console.log(`\n${gecen}/${gecen + hata} tarayıcı testi geçti.`);
if (hata) { console.error('BAŞARISIZ'); process.exit(1); }
