// Tarayıcısız doğrulama:  node tests/fason.test.mjs
import assert from 'node:assert/strict';

import {
  bantKodCoz, bantKodYaz, uzunKisa, kesimOlcusu, bitmisOlcu, bantUzunlugu,
  parcaDogrula, ciftGirisBul, isOzeti, yeniParca,
  AYAR_VARSAYILAN, MALZEME_VARSAYILAN, FIYAT_VARSAYILAN,
} from '../js/olcu.js';
import { satirCoz, metinCoz } from '../js/parse.js';
import { yerlestir, parcalariAc, yerlesimDogrula } from '../js/yerlesim.js';
import { xlsxOlustur, csvOlustur, sutunHarfi } from '../js/xlsx.js';
import { SEMA, anahtarGecerliBicimde, MODEL } from '../js/ocr.js';

// Testler sırayla ve BEKLENEREK koşar. Eşzamansız bir test'i beklemeyen
// koşucu, hata fırlatan testi "ok" diye yazıp sonra çöküyordu.
const sira = [];
function test(ad, fn) { sira.push({ ad, fn }); }

let gecen = 0;
async function kosur() {
  for (const { ad, fn } of sira) {
    try {
      await fn();
      gecen += 1;
      console.log(`  ok  ${ad}`);
    } catch (err) {
      console.error(`HATA  ${ad}\n      ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${gecen}/${sira.length} test geçti.`);
  if (process.exitCode) console.error('BAŞARISIZ');
}

const ayar = { ...AYAR_VARSAYILAN };
const malzeme = { ...MALZEME_VARSAYILAN };

/* ------------------------------------------------------------ bant kodu -- */

test('uzun kenar en>boy iken üst/alt olur', () => {
  assert.deepEqual(uzunKisa(600, 400).uzun, ['ust', 'alt']);
  assert.deepEqual(uzunKisa(400, 600).uzun, ['sol', 'sag']);
});

test('1U1K bir uzun bir kısa kenarı işaretler', () => {
  const { bant } = bantKodCoz('1U1K', 600, 400);
  assert.equal(bant.ust, true);
  assert.equal(bant.alt, false);
  assert.equal(bant.sol, true);
  assert.equal(bant.sag, false);
});

test('4 ve 2U2K dört kenarı da işaretler', () => {
  for (const kod of ['4', '4K', '2U2K', 'TAM']) {
    const { bant } = bantKodCoz(kod, 600, 400);
    assert.equal(Object.values(bant).filter(Boolean).length, 4, kod);
  }
});

test('boş, yok, 0 hiçbir kenarı işaretlemez', () => {
  for (const kod of ['', '0', 'yok', '-', null, undefined]) {
    const { bant } = bantKodCoz(kod, 600, 400);
    assert.equal(Object.values(bant).filter(Boolean).length, 0, String(kod));
  }
});

test('açık biçim [1010] doğrudan kenar verir', () => {
  const { bant } = bantKodCoz('[1010]', 600, 400);
  assert.deepEqual(bant, { ust: true, alt: false, sol: true, sag: false });
});

test('anlamsız kod uyarı döndürür, kenar işaretlemez', () => {
  const r = bantKodCoz('ZZZ', 600, 400);
  assert.ok(r.uyari);
  assert.equal(Object.values(r.bant).filter(Boolean).length, 0);
});

test('3 uzun kenar kabul edilmez', () => {
  assert.ok(bantKodCoz('3U', 600, 400).uyari);
});

test('kod yaz-oku gidiş dönüşü bozulmaz', () => {
  for (const kod of ['1U1K', '2U1K', '1U', '2K', '2U2K']) {
    const { bant } = bantKodCoz(kod, 600, 400);
    const geri = bantKodYaz(bant, 600, 400);
    const { bant: bant2 } = bantKodCoz(geri === '4 kenar' ? '4' : geri, 600, 400);
    assert.deepEqual(bant2, bant, kod);
  }
});

/* --------------------------------------------------------------- ölçü ---- */

test('bitmiş ölçüden bant payı düşülür', () => {
  const p = yeniParca({ en: 600, boy: 400, bant: { ust: true, sol: true } });
  const a = { ...ayar, olcuTipi: 'bitmis', bantKalinlik: 1 };
  // ust bantlı → boy 1 mm düşer; sol bantlı → en 1 mm düşer
  assert.deepEqual(kesimOlcusu(p, a), { en: 599, boy: 399 });
  assert.deepEqual(bitmisOlcu(p, a), { en: 600, boy: 400 });
});

test('ham ölçüde kesim aynen kalır, bitmiş büyür', () => {
  const p = yeniParca({ en: 600, boy: 400, bant: { ust: true, alt: true } });
  const a = { ...ayar, olcuTipi: 'ham', bantKalinlik: 2 };
  assert.deepEqual(kesimOlcusu(p, a), { en: 600, boy: 400 });
  assert.deepEqual(bitmisOlcu(p, a), { en: 600, boy: 404 });
});

test('bant uzunluğu kenar boyu + fire, adetle çarpılır', () => {
  const p = yeniParca({ en: 600, boy: 400, adet: 2, bant: { ust: true, sol: true } });
  const a = { ...ayar, olcuTipi: 'ham', bantFire: 10 };
  // ust = en = 600, sol = boy = 400 → (610 + 410) * 2
  assert.equal(bantUzunlugu(p, a), 2040);
});

test('bantsız parçanın bant uzunluğu sıfır', () => {
  assert.equal(bantUzunlugu(yeniParca({ en: 600, boy: 400, adet: 5 }), ayar), 0);
});

/* ---------------------------------------------------------- doğrulama ---- */

test('sıfır ölçü hata verir', () => {
  const n = parcaDogrula(yeniParca({ en: 0, boy: 400 }), ayar, malzeme);
  assert.ok(n.some((x) => x.duzey === 'hata'));
});

test('levhadan büyük parça hata verir', () => {
  const p = yeniParca({ en: 3000, boy: 400, adet: 1 });
  assert.ok(parcaDogrula(p, ayar, malzeme).some((x) => x.duzey === 'hata'));
});

test('levhaya ancak çevrilince sığan parça damar serbestse geçer', () => {
  // 2700 levhanın eninden (2100) uzun, boyuna (2800) sığar
  const serbest = yeniParca({ en: 2700, boy: 400, damar: 'serbest' });
  const damarli = yeniParca({ en: 2700, boy: 400, damar: 'boy' });
  assert.ok(!parcaDogrula(serbest, ayar, malzeme).some((x) => x.duzey === 'hata'));
  assert.ok(parcaDogrula(damarli, ayar, malzeme).some((x) => x.duzey === 'hata'));
});

test('3 kenar bant uyarı üretir', () => {
  const p = yeniParca({ en: 600, boy: 400, bant: { ust: true, alt: true, sol: true } });
  assert.ok(parcaDogrula(p, ayar, malzeme).some((x) => /3 kenar/.test(x.mesaj)));
});

test('çift giriş bulunur', () => {
  const a = yeniParca({ en: 600, boy: 400 });
  const b = yeniParca({ en: 600, boy: 400 });
  const c = yeniParca({ en: 700, boy: 400 });
  const gruplar = ciftGirisBul([a, b, c]);
  assert.equal(gruplar.length, 1);
  assert.equal(gruplar[0].length, 2);
});

test('iş özeti alan ve adet toplar, hatalıyı saymaz', () => {
  const is = {
    ayar: { ...ayar, olcuTipi: 'ham' },
    malzeme,
    fiyat: { ...FIYAT_VARSAYILAN, m2: 100 },
    parcalar: [
      yeniParca({ en: 1000, boy: 1000, adet: 2 }),   // 2 m²
      yeniParca({ en: 0, boy: 500, adet: 3 }),       // hatalı, sayılmaz
    ],
  };
  const o = isOzeti(is);
  assert.equal(o.m2, 2);
  assert.equal(o.adet, 2);
  assert.equal(o.hata, 1);
  assert.equal(o.tutar.kesim, 200);
});

/* ------------------------------------------------------------ ayrıştırıcı */

test('temel biçim: 600x400 2 1U1K', () => {
  const r = satirCoz('600x400 2 1U1K');
  assert.ok(r.ok);
  assert.equal(r.parca.en, 600);
  assert.equal(r.parca.boy, 400);
  assert.equal(r.parca.adet, 2);
  assert.equal(bantKodYaz(r.parca.bant, 600, 400), '1U1K');
});

test('ayraç olarak x, *, /, × ve boşluk çalışır', () => {
  for (const s of ['600x400', '600*400', '600/400', '600×400', '600 400']) {
    const r = satirCoz(s);
    assert.ok(r.ok, s);
    assert.equal(r.parca.en, 600, s);
    assert.equal(r.parca.boy, 400, s);
  }
});

test('adet biçimleri: x2, /3, 2 ad, çıplak sayı', () => {
  assert.equal(satirCoz('600x400 x2').parca.adet, 2);
  assert.equal(satirCoz('600x400/3').parca.adet, 3);
  assert.equal(satirCoz('600x400 4 ad').parca.adet, 4);
  assert.equal(satirCoz('600x400 5').parca.adet, 5);
  assert.equal(satirCoz('600x400').parca.adet, 1);
});

test('ondalık virgül kabul edilir', () => {
  assert.equal(satirCoz('600,5x400').parca.en, 600.5);
});

test('sıra numarası ve açıklama ayıklanır', () => {
  const r = satirCoz('3) 720x450 6 2U1K // üst raf');
  assert.ok(r.ok);
  assert.equal(r.parca.en, 720);
  assert.equal(r.parca.adet, 6);
  assert.equal(r.parca.aciklama, 'üst raf');
});

test('damar işareti okunur', () => {
  assert.equal(satirCoz('600x400 2 d').parca.damar, 'boy');
  assert.equal(satirCoz('600x400 2').parca.damar, 'serbest');
});

test('cm birimi 10 ile çarpılır', () => {
  const r = satirCoz('60x40 2', { birim: 'cm' });
  assert.equal(r.parca.en, 600);
  assert.equal(r.parca.boy, 400);
});

test('ölçüsüz satır hata döndürür, çökmez', () => {
  for (const s of ['abc', '', '   ', 'merhaba dünya']) {
    assert.equal(satirCoz(s).ok, false, JSON.stringify(s));
  }
});

test('çok satırlı metin: geçerliler ayrılır, hatalılar bildirilir', () => {
  const { parcalar, hatalar } = metinCoz('600x400 2\nsaçma\n700x300 1U', {});
  assert.equal(parcalar.length, 2);
  assert.equal(hatalar.length, 1);
  assert.equal(hatalar[0].satirNo, 2);
});

/* ------------------------------------------------------------- yerleşim -- */

test('parçalar adet kadar açılır ve etiketlenir', () => {
  const acik = parcalariAc([yeniParca({ en: 600, boy: 400, adet: 3 })], { ...ayar, olcuTipi: 'ham' });
  assert.equal(acik.length, 3);
  assert.deepEqual(acik.map((p) => p.etiket), ['1-1', '1-2', '1-3']);
});

test('yerleşim: hiçbir parça taşmaz, üst üste binmez', () => {
  const parcalar = [
    yeniParca({ en: 720, boy: 570, adet: 10 }),
    yeniParca({ en: 2070, boy: 570, adet: 4, damar: 'boy' }),
    yeniParca({ en: 396, boy: 570, adet: 16 }),
    yeniParca({ en: 800, boy: 350, adet: 6 }),
  ];
  const r = yerlestir(parcalar, ayar, malzeme);
  assert.deepEqual(yerlesimDogrula(r), []);
  assert.equal(r.sigmayan.length, 0);
  const konan = r.levhalar.reduce((t, l) => t + l.yerlesimler.length, 0);
  assert.equal(konan, 36);
  assert.ok(r.doluluk > 50 && r.doluluk <= 100, `doluluk ${r.doluluk}`);
});

test('levhaya sığmayan parça ayrı listelenir, yerleşimi bozmaz', () => {
  const r = yerlestir(
    [yeniParca({ en: 5000, boy: 400, adet: 1 }), yeniParca({ en: 600, boy: 400, adet: 2 })],
    ayar, malzeme,
  );
  assert.equal(r.sigmayan.length, 1);
  assert.equal(r.levhalar.reduce((t, l) => t + l.yerlesimler.length, 0), 2);
});

test('damarlı parça yerleşimde çevrilmez', () => {
  const r = yerlestir([yeniParca({ en: 400, boy: 2700, adet: 1, damar: 'boy' })], ayar, malzeme);
  const y = r.levhalar[0].yerlesimler[0];
  assert.equal(y.cevrik, false);
  assert.equal(y.en, 400);
});

test('boş liste çökmeden boş sonuç verir', () => {
  const r = yerlestir([], ayar, malzeme);
  assert.equal(r.levhaSayisi, 0);
  assert.equal(r.doluluk, 0);
});

test('kertik payı yerleşimde hesaba katılır', () => {
  // Tam 2 parça yan yana sığacak genişlikte levha; kertikle birlikte sığmaz.
  const dar = { ...malzeme, levhaEn: 1220, levhaBoy: 600 };
  const a = { ...ayar, kenarPayi: 0, kerf: 10, olcuTipi: 'ham' };
  const r = yerlestir([yeniParca({ en: 610, boy: 300, adet: 2 })], a, dar);
  const ilk = r.levhalar[0].yerlesimler;
  const yanYana = ilk.length === 2 && ilk[0].y === ilk[1].y;
  assert.equal(yanYana, false, '10 mm kertikle 610+610 bir sıraya sığmamalı');
});

/* ---------------------------------------------------------------- xlsx -- */

test('sütun harfleri doğru', () => {
  assert.equal(sutunHarfi(0), 'A');
  assert.equal(sutunHarfi(25), 'Z');
  assert.equal(sutunHarfi(26), 'AA');
  assert.equal(sutunHarfi(51), 'AZ');
});

test('xlsx geçerli bir zip ve içinde beklenen parçalar var', async () => {
  const blob = xlsxOlustur({
    sayfaAdi: 'Kesim Listesi',
    basliklar: ['Sıra', 'En', 'Boy'],
    satirlar: [[1, 720, 570], [2, 396.5, 570]],
  });
  const bayt = new Uint8Array(await blob.arrayBuffer());
  // Zip imzası
  assert.deepEqual([...bayt.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  // Son kayıt (EOCD) imzası
  const son = bayt.slice(-22);
  assert.deepEqual([...son.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
  const metin = Buffer.from(bayt).toString('latin1');
  for (const parca of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
    assert.ok(metin.includes(parca), parca);
  }
  assert.ok(blob.type.includes('spreadsheetml'));
});

test('xlsx sayıyı sayı, metni metin olarak yazar', async () => {
  const blob = xlsxOlustur({ basliklar: ['A'], satirlar: [[720], ['yazı']] });
  const metin = Buffer.from(await blob.arrayBuffer()).toString('utf8');
  assert.ok(metin.includes('<v>720</v>'), 'sayı <v> içinde olmalı');
  assert.ok(metin.includes('t="inlineStr"'), 'metin inlineStr olmalı');
});

test('xlsx XML kaçışları bozulmaz', async () => {
  const blob = xlsxOlustur({ basliklar: ['A'], satirlar: [['<raf> & "kapak"']] });
  const metin = Buffer.from(await blob.arrayBuffer()).toString('utf8');
  assert.ok(metin.includes('&lt;raf&gt; &amp; "kapak"'));
  assert.ok(!metin.includes('<raf>'));
});

test('xlsx Türkçe karakterleri korur', async () => {
  const blob = xlsxOlustur({ basliklar: ['Açıklama'], satirlar: [['üst şık göğüs ÇĞİÖŞÜ']] });
  const metin = Buffer.from(await blob.arrayBuffer()).toString('utf8');
  assert.ok(metin.includes('üst şık göğüs ÇĞİÖŞÜ'));
});

test('boş tablo da geçerli xlsx üretir', async () => {
  const blob = xlsxOlustur({ basliklar: [], satirlar: [] });
  const bayt = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bayt.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

test('csv Excel biçiminde: BOM, noktalı virgül, ondalık virgül', async () => {
  const blob = csvOlustur(['En', 'Boy'], [[720, 396.5]]);
  // BOM'u ham baytlarda ararız: Blob.text() UTF-8 çözerken BOM'u yutuyor,
  // ama Excel'in gördüğü şey dosyadaki baytlar.
  const bayt = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bayt.slice(0, 3)], [0xEF, 0xBB, 0xBF], 'dosya BOM ile başlamalı');
  const metin = await blob.text();
  assert.ok(metin.includes('En;Boy'), 'ayraç noktalı virgül olmalı');
  assert.ok(metin.includes('720;396,5'), 'ondalık virgül olmalı');
});

test('csv içinde noktalı virgül ve tırnak varsa kaçırılır', async () => {
  const metin = await csvOlustur(['A'], [['bir;iki'], ['üç"dört']]).text();
  assert.ok(metin.includes('"bir;iki"'));
  assert.ok(metin.includes('"üç""dört"'));
});

/* ----------------------------------------------------------------- ocr -- */

test('OCR şeması yapılandırılmış çıktı kurallarına uyar', () => {
  const denetle = (dugum, yol = 'kok') => {
    if (dugum.type === 'object') {
      assert.equal(dugum.additionalProperties, false, `${yol}: additionalProperties false olmalı`);
      assert.ok(Array.isArray(dugum.required), `${yol}: required olmalı`);
      const alanlar = Object.keys(dugum.properties || {});
      assert.deepEqual([...dugum.required].sort(), [...alanlar].sort(),
        `${yol}: her alan required olmalı`);
      for (const [ad, alt] of Object.entries(dugum.properties)) denetle(alt, `${yol}.${ad}`);
    } else if (dugum.type === 'array') {
      denetle(dugum.items, `${yol}[]`);
    } else {
      // Desteklenmeyen kısıtlar şemaya girmemeli
      for (const yasak of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf']) {
        assert.equal(dugum[yasak], undefined, `${yol}: ${yasak} desteklenmiyor`);
      }
    }
  };
  denetle(SEMA);
});

test('OCR şeması gereken alanları içerir', () => {
  const p = SEMA.properties.parcalar.items.properties;
  for (const alan of ['satirNo', 'en', 'boy', 'adet', 'bantKod', 'aciklama', 'okunanMetin', 'guven']) {
    assert.ok(p[alan], alan);
  }
  assert.deepEqual(p.guven.enum, ['yuksek', 'orta', 'dusuk']);
  assert.deepEqual(SEMA.properties.olcuBirimi.enum, ['mm', 'cm']);
});

test('model kimliği tarih eki taşımaz', () => {
  assert.equal(MODEL, 'claude-opus-5');
  assert.ok(!/\d{8}$/.test(MODEL), 'model kimliğine tarih eklenmemeli');
});

test('API anahtarı biçim denetimi', () => {
  assert.equal(anahtarGecerliBicimde(`sk-ant-api03-${'a'.repeat(40)}`), true);
  assert.equal(anahtarGecerliBicimde('kısa'), false);
  assert.equal(anahtarGecerliBicimde(''), false);
  assert.equal(anahtarGecerliBicimde(null), false);
});

await kosur();
