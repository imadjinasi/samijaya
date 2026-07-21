/**
 * Backend fungsi add-on produk (Fase 7.8-D).
 */

function addonsReadAllActive() {
  var rows = readAll('ProductAddons');
  if (!rows || rows.length === 0) return [];
  var active = rows.filter(function(a) {
    var af = String(a.aktif).toLowerCase();
    return af === 'true' || af === '1' || af === 'ya';
  });
  active.sort(function(a, b) {
    if (a.product_id !== b.product_id) return String(a.product_id).localeCompare(String(b.product_id));
    return (Number(a.urutan) || 0) - (Number(b.urutan) || 0);
  });
  return active.map(function(a) {
    return {
      addon_id: String(a.addon_id),
      product_id: String(a.product_id),
      nama_addon: String(a.nama_addon),
      harga: Number(a.harga) || 0,
      urutan: Number(a.urutan) || 0,
      aktif: true
    };
  });
}

function addonsGroupByProduct() {
  var all = addonsReadAllActive();
  var grouped = {};
  for (var i = 0; i < all.length; i++) {
    var a = all[i];
    if (!grouped[a.product_id]) grouped[a.product_id] = [];
    grouped[a.product_id].push(a);
  }
  return grouped;
}

function addonFindById(addonId) {
  if (!addonId) return null;
  var rows = readAll('ProductAddons');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].addon_id) === String(addonId)) {
      var a = rows[i];
      return {
        addon_id: String(a.addon_id),
        product_id: String(a.product_id),
        nama_addon: String(a.nama_addon),
        harga: Number(a.harga) || 0,
        aktif: (String(a.aktif).toLowerCase()==='true'||String(a.aktif)==='1'||String(a.aktif).toLowerCase()==='ya')
      };
    }
  }
  return null;
}
