/**
 * Backend fungsi varian produk (Fase 7.8).
 * Baca varian dari sheet ProductVariants dan expose ke frontend via getCatalog.
 * 
 * Admin CRUD manual via edit sheet — tidak ada fungsi write/delete di sini.
 */

/**
 * Baca SEMUA varian aktif dari sheet ProductVariants.
 * Return: array of variant objects.
 */
function variantsReadAllActive() {
  var rows = readAll('ProductVariants');
  if (!rows || rows.length === 0) return [];
  
  // Filter hanya varian aktif
  var active = rows.filter(function(v) {
    var af = String(v.aktif).toLowerCase();
    return af === 'true' || af === '1' || af === 'ya';
  });
  
  // Sort by product_id lalu urutan
  active.sort(function(a, b) {
    if (a.product_id !== b.product_id) return String(a.product_id).localeCompare(String(b.product_id));
    return (Number(a.urutan) || 0) - (Number(b.urutan) || 0);
  });
  
  // Coerce tipe untuk downstream aman
  return active.map(function(v) {
    return {
      variant_id: String(v.variant_id),
      product_id: String(v.product_id),
      nama_axis: String(v.nama_axis),
      nama_varian: String(v.nama_varian),
      harga: Number(v.harga) || 0,
      urutan: Number(v.urutan) || 0,
      aktif: true
    };
  });
}

/**
 * Group varian aktif per product_id.
 * Return: object { product_id: [variant, variant, ...] }
 */
function variantsGroupByProduct() {
  var all = variantsReadAllActive();
  var grouped = {};
  for (var i = 0; i < all.length; i++) {
    var v = all[i];
    if (!grouped[v.product_id]) grouped[v.product_id] = [];
    grouped[v.product_id].push(v);
  }
  return grouped;
}

/**
 * Cari 1 varian berdasarkan variant_id (dari SEMUA varian, termasuk yang non-aktif).
 * Berguna untuk validasi order lama yang refer varian yang mungkin sudah di-deactivate.
 * Return: variant object atau null kalau tidak ditemukan.
 */
function variantFindById(variantId) {
  if (!variantId) return null;
  var rows = readAll('ProductVariants');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].variant_id) === String(variantId)) {
      var v = rows[i];
      return {
        variant_id: String(v.variant_id),
        product_id: String(v.product_id),
        nama_axis: String(v.nama_axis),
        nama_varian: String(v.nama_varian),
        harga: Number(v.harga) || 0,
        urutan: Number(v.urutan) || 0,
        aktif: (String(v.aktif).toLowerCase() === 'true' || String(v.aktif) === '1' || String(v.aktif).toLowerCase() === 'ya')
      };
    }
  }
  return null;
}
