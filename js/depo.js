// Tarayıcı deposu. Hiçbir şey sunucuya gitmez.
//
// Gizli pencerede ya da depolama kapalıyken localStorage erişimi hata
// fırlatır; her çağrı sarmalanmış, uygulama yine de çalışır.

const ANAHTAR = 'fason-kesim-api-anahtari';
const SON_IS = 'fason-kesim-son-is';
const AYARLAR = 'fason-kesim-ayarlar';

function oku(ad) {
  try { return localStorage.getItem(ad); } catch { return null; }
}
function yaz(ad, deger) {
  try {
    if (deger === null) localStorage.removeItem(ad);
    else localStorage.setItem(ad, deger);
    return true;
  } catch { return false; }
}

export const apiAnahtari = {
  al: () => oku(ANAHTAR) || '',
  koy: (v) => yaz(ANAHTAR, v || null),
  sil: () => yaz(ANAHTAR, null),
};

export function jsonAl(ad, varsayilan) {
  const ham = oku(ad);
  if (!ham) return varsayilan;
  try { return JSON.parse(ham); } catch { return varsayilan; }
}

export function jsonYaz(ad, deger) {
  return yaz(ad, JSON.stringify(deger));
}

export const sonIs = {
  al: () => jsonAl(SON_IS, null),
  koy: (is) => jsonYaz(SON_IS, is),
  sil: () => yaz(SON_IS, null),
};

export const ayarlar = {
  al: (varsayilan) => ({ ...varsayilan, ...(jsonAl(AYARLAR, {}) || {}) }),
  koy: (a) => jsonYaz(AYARLAR, a),
};

/** Depolama gerçekten çalışıyor mu? (Gizli pencere uyarısı için.) */
export function depoCalisiyor() {
  try {
    const t = '__fk_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return true;
  } catch { return false; }
}
