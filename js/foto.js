// Fotoğrafı okumaya hazır hâle getirir.
//
// Kameradan çıkan 4000 piksellik dosyayı olduğu gibi göndermek boşuna para
// ve zaman: model görseli zaten uzun kenarı 1568 piksele indiriyor. Burada
// biz küçültüyoruz — hem yükleme hızlanıyor hem telefonun verisi yanmıyor.

export const UZUN_KENAR = 1568;

/**
 * Seçilen dosyayı küçültüp base64'e çevirir.
 * @returns {Promise<{base64, tur, onizleme, en, boy, ad, kb}>}
 */
export async function gorselHazirla(dosya) {
  if (!dosya) throw new Error('Dosya yok.');
  if (!/^image\//.test(dosya.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(dosya.name || '')) {
    throw new Error(`"${dosya.name || 'dosya'}" bir görsel değil.`);
  }

  let resim;
  try {
    // from-image: telefonun yan çektiği fotoğraf düz gelsin.
    resim = await createImageBitmap(dosya, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      `"${dosya.name || 'Fotoğraf'}" açılamadı. iPhone'daysan Ayarlar → Kamera → `
      + 'Biçimler → "En Uyumlu" yapıp yeniden çek, ya da fotoğrafı JPEG olarak paylaş.',
    );
  }

  const oran = Math.min(1, UZUN_KENAR / Math.max(resim.width, resim.height));
  const en = Math.max(1, Math.round(resim.width * oran));
  const boy = Math.max(1, Math.round(resim.height * oran));

  const tuval = document.createElement('canvas');
  tuval.width = en;
  tuval.height = boy;
  const ctx = tuval.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // Beyaz zemin: saydam PNG'ler JPEG'e çevrilince siyah olmasın.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, en, boy);
  ctx.drawImage(resim, 0, 0, en, boy);
  resim.close?.();

  const veriUrl = tuval.toDataURL('image/jpeg', 0.85);
  const base64 = veriUrl.slice(veriUrl.indexOf(',') + 1);

  return {
    base64,
    tur: 'image/jpeg',
    onizleme: veriUrl,
    en,
    boy,
    ad: dosya.name || 'fotoğraf',
    kb: Math.round((base64.length * 3) / 4 / 1024),
  };
}
