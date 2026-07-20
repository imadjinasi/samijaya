/**
 * Catalog.gs — Samijaya MVP
 *
 * Fase 3: API katalog publik.
 * Fungsi: catalogGetCatalog.
 * Di-cache CacheService 5 menit.
 * Tidak ada dependency eksternal.
 */

// ============================================================
// KEY SETTINGS PUBLIK — hanya ini yang boleh di-expose ke frontend
// ============================================================
var _PUBLIC_SETTING_KEYS = [
  'ONGKIR_PER_KM',
  'ONGKIR_FAKTOR_KOREKSI',
  'ONGKIR_RADIUS_MAX_KM',
  'MIN_ORDER_DELIVERY',
  'TOKO_BUKA',
  'NOMOR_WA_TOKO',
  'QRIS_FILE_ID',
  'REKENING_BANK',
  'REKENING_NOMOR',
  'REKENING_NAMA'
];

var _CATALOG_CACHE_KEY = 'catalog_cache';
var _CATALOG_CACHE_TTL = 300; // 5 menit

// ============================================================
// 1. catalogGetCatalog()
// ============================================================
/**
 * Return satu object berisi semua data publik.
 * Di-cache pakai CacheService 5 menit.
 *
 * @return {Object} {ok:true, data:{categories, products, pickupLocations, deliverySlots, holidays, settings}}
 */
function catalogGetCatalog() {
  // Cek cache dulu
  var cache = CacheService.getScriptCache();
  var cached = cache.get(_CATALOG_CACHE_KEY);
  if (cached) {
    try {
      return { ok: true, data: JSON.parse(cached) };
    } catch (e) {
      // Cache rusak, lanjut baca dari sheet
    }
  }



  // --- Categories ---
  var allCategories = readAll('Categories');
  var categories = [];
  for (var i = 0; i < allCategories.length; i++) {
    if (String(allCategories[i].status) === 'aktif') {
      categories.push(allCategories[i]);
    }
  }
  categories.sort(function (a, b) { return Number(a.urutan) - Number(b.urutan); });

  // --- Products ---
  var allProducts = readAll('Products');
  var products = [];
  for (var i = 0; i < allProducts.length; i++) {
    var p = allProducts[i];
    if (String(p.status) === 'aktif') {
      // Tambahkan foto_url
      var fotoFileId = String(p.foto_file_id || '').trim();
      p.foto_url = fotoFileId
        ? 'https://drive.google.com/thumbnail?id=' + fotoFileId + '&sz=w400'
        : '';
      products.push(p);
    }
  }
  products.sort(function (a, b) { return Number(a.urutan) - Number(b.urutan); });

  // === BARU: attach varian per produk ===
  var variantsGrouped = variantsGroupByProduct();
  products = products.map(function(p) {
    var vs = variantsGrouped[p.product_id] || [];
    p.variants = vs; // array (kosong kalau tanpa varian)
    p.has_variants = vs.length > 0; // helper flag untuk frontend
    return p;
  });
  function toHHMM(v) {
    if (v instanceof Date) return Utilities.formatDate(v, "Asia/Jakarta", "HH:mm");
    if (typeof v === 'string') return v;
    return "";
  }
  function toYMD(v) {
    if (v instanceof Date) return Utilities.formatDate(v, "Asia/Jakarta", "yyyy-MM-dd");
    if (typeof v === 'string') return v;
    return "";
  }

  // --- PickupLocations ---
  var allPickup = readAll('PickupLocations');
  var pickupLocations = [];
  for (var i = 0; i < allPickup.length; i++) {
    if (String(allPickup[i].status) === 'aktif') {
      var loc = allPickup[i];
      loc.jam_buka = toHHMM(loc.jam_buka);
      loc.jam_tutup = toHHMM(loc.jam_tutup);
      pickupLocations.push(loc);
    }
  }

  // --- DeliverySlots ---
  var allSlots = readAll('DeliverySlots');
  var deliverySlots = [];
  for (var i = 0; i < allSlots.length; i++) {
    if (String(allSlots[i].status) === 'aktif') {
      var slot = allSlots[i];
      slot.jam_mulai = toHHMM(slot.jam_mulai);
      slot.jam_selesai = toHHMM(slot.jam_selesai);
      deliverySlots.push(slot);
    }
  }

  // --- Holidays (tanggal >= hari ini) ---
  var allHolidays = readAll('Holidays');
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayMs = today.getTime();
  var holidays = [];
  for (var i = 0; i < allHolidays.length; i++) {
    var tgl = new Date(allHolidays[i].tanggal);
    tgl.setHours(0, 0, 0, 0);
    if (tgl.getTime() >= todayMs) {
      var hol = allHolidays[i];
      hol.tanggal = toYMD(hol.tanggal);
      holidays.push(hol);
    }
  }

  // --- Settings publik ---
  var allSettings = readAll('Settings');
  var settings = {};
  for (var i = 0; i < allSettings.length; i++) {
    var key = String(allSettings[i].key);
    for (var j = 0; j < _PUBLIC_SETTING_KEYS.length; j++) {
      if (key === _PUBLIC_SETTING_KEYS[j]) {
        settings[key] = allSettings[i].value;
        break;
      }
    }
  }

  // Susun result
  var catalogData = {
    categories: categories,
    products: products,
    pickupLocations: pickupLocations,
    deliverySlots: deliverySlots,
    holidays: holidays,
    settings: settings
  };

  // Simpan ke cache (stringify seluruh object)
  try {
    var catalogStr = JSON.stringify(catalogData);
    cache.put(_CATALOG_CACHE_KEY, catalogStr, _CATALOG_CACHE_TTL);
  } catch (e) {
    // Gagal cache (misalnya terlalu besar), lanjut tanpa error
    log('ERROR', 'catalog_cache', 'Gagal cache catalog: ' + e.message, null);
  }

  return { ok: true, data: catalogData };
}
