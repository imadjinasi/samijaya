/**
 * Declarative Spreadsheet schema contract for production sheets.
 * Required headers are the minimum safe contract. Additive headers remain
 * optional so deployments from earlier phases can be inspected safely.
 */
var SHEET_SCHEMA_REGISTRY = {
  Settings: { required: ['key','value'], optional: ['keterangan'], primary_id: 'key', unique: true },
  Members: { required: ['member_id','nama','no_hp','total_poin','total_belanja','created_at','status'], optional: ['tgl_lahir','email','last_seen_orders_at'], primary_id: 'member_id', unique: true },
  Sessions: { required: ['token','no_hp','member_id','otp','otp_expires_at','otp_used','session_expires_at','created_at'], optional: ['otp_failed_attempts','otp_locked_at'], primary_id: 'token', unique: true },
  MemberAddresses: { required: ['address_id','member_id','label','detail','latitude','longitude','created_at','status','is_default'], optional: ['alamat_snapshot'], primary_id: 'address_id', unique: true },
  Products: { required: ['product_id','nama','harga','kategori_id','tersedia','status'], optional: ['foto_file_id','deskripsi','badge_promo','urutan'], primary_id: 'product_id', unique: true },
  Categories: { required: ['kategori_id','nama','status'], optional: ['urutan'], primary_id: 'kategori_id', unique: true },
  PickupLocations: { required: ['lokasi_id','nama','alamat','latitude','longitude','status'], optional: ['jam_buka','jam_tutup'], primary_id: 'lokasi_id', unique: true },
  DeliverySlots: { required: ['slot_id','jam_mulai','jam_selesai','kuota','status'], optional: [], primary_id: 'slot_id', unique: true },
  Holidays: { required: ['tanggal'], optional: ['keterangan'] },
  Orders: { required: ['order_id','member_id','nama','no_hp','tgl_antar','metode_kirim','subtotal','poin_dipakai','total','metode_bayar','status','created_at','updated_at'], optional: ['lokasi_pickup_id','address_id','alamat_snapshot','lat','lng','jarak_km','ongkir','slot_id','catatan_customer','catatan_admin','timeline_json','nama_penerima','no_hp_penerima','status_updated_at','promo_id','promo_code','promo_nama','ongkir_sebelum_promo','promo_diskon_subtotal','promo_diskon_produk','promo_diskon_ongkir','promo_diskon_total','promo_bonus_poin','promo_multiplier_poin','poin_earn_dasar','poin_earn_final','promo_snapshot_json','client_request_id','request_fingerprint','commit_status','commit_stage','commit_error_code','commit_snapshot_json','committed_at','transaction_status','transaction_stage','transaction_error_code','transaction_snapshot_json','cancelled_at','cancelled_by','cancel_reason'], json: ['timeline_json','promo_snapshot_json','commit_snapshot_json','transaction_snapshot_json'], primary_id: 'order_id', unique: true },
  OrderItems: { required: ['order_id','product_id','nama_snapshot','harga_snapshot','qty','subtotal'], optional: ['variant_id','variant_nama_snapshot','nama_axis_snapshot','order_item_ref'] },
  ProductVariants: { required: ['variant_id','product_id','nama_axis','nama_varian','harga','urutan','aktif'], optional: ['created_at','updated_at'], primary_id: 'variant_id', unique: true },
  ProductAddons: { required: ['addon_id','product_id','nama_addon','harga','urutan','aktif'], optional: ['created_at','updated_at'], primary_id: 'addon_id', unique: true },
  OrderItemAddons: { required: ['id','order_id','order_item_ref','addon_id','nama_addon_snapshot','harga_snapshot'], optional: ['created_at'], primary_id: 'id', unique: true },
  PointHistory: { required: ['id','member_id','order_id','tipe','jumlah','saldo_akhir','keterangan','created_at'], optional: ['event_code','saldo_sebelum','event_status','event_snapshot_json'], json: ['event_snapshot_json'], primary_id: 'id', unique: true },
  Reviews: { required: ['review_id','order_id','member_id','rating','ulasan','status','created_at'], optional: ['request_fingerprint','updated_at'], primary_id: 'review_id', unique: true },
  PromoCodes: { required: ['promo_id','kode','nama','aktif','min_subtotal','metode_kirim','limit_total','limit_per_member','limit_harian'], optional: ['deskripsi','catatan_customer','mulai_at','berakhir_at','hari_berlaku','jam_mulai','jam_berakhir','max_subtotal','required_product_ids','required_kategori_ids','required_match_mode','member_baru_only','whitelist_member_ids','bisa_dengan_poin','diskon_subtotal_tipe','diskon_subtotal_nilai','diskon_subtotal_max','diskon_produk_ids','diskon_produk_tipe','diskon_produk_nilai','diskon_produk_max','diskon_ongkir_tipe','diskon_ongkir_nilai','diskon_ongkir_max','bonus_poin','multiplier_poin','created_at','updated_at'], primary_id: 'promo_id', unique: true },
  PromoUsage: { required: ['usage_id','promo_id','promo_code','order_id','member_id','status','used_at'], optional: ['used_date','cancelled_at','promo_diskon_subtotal','promo_diskon_produk','promo_diskon_ongkir','promo_diskon_total','promo_bonus_poin','promo_multiplier_poin'], primary_id: 'usage_id', unique: true },
  MessageTemplates: { required: ['kode','isi'], optional: ['keterangan'], primary_id: 'kode', unique: true },
  Campaigns: { required: ['campaign_id','judul','status'], optional: ['deskripsi','gambar_file_id','gambar_url','link_url','kode_promo','tanggal_mulai','tanggal_selesai','urutan'], primary_id: 'campaign_id', unique: true },
  Logs: { required: ['timestamp','tipe','ref_id','pesan','detail_json'], optional: [], json: ['detail_json'] }
};

function schemaGet(sheetName) {
  return Object.prototype.hasOwnProperty.call(SHEET_SCHEMA_REGISTRY, sheetName) ? SHEET_SCHEMA_REGISTRY[sheetName] : null;
}

function schemaValidateHeaders(sheetName, headers) {
  var spec = schemaGet(sheetName);
  if (!spec) return headers;
  for (var i = 0; i < spec.required.length; i++) {
    if (headers.indexOf(spec.required[i]) === -1) throw new Error('SCHEMA_MISSING_REQUIRED_HEADER:' + sheetName + ':' + spec.required[i]);
  }
  return headers;
}

/** Read-only deployment audit. Does not mutate or repair production data. */
function auditPhase8BSchemaReadOnly() {
  var report = { ok: true, sheets: {} };
  for (var sheetName in SHEET_SCHEMA_REGISTRY) {
    if (!Object.prototype.hasOwnProperty.call(SHEET_SCHEMA_REGISTRY, sheetName)) continue;
    try {
      var headers = getSheetHeaders(sheetName);
      var duplicateIds = schemaFindDuplicatePrimaryIds(sheetName);
      report.sheets[sheetName] = { ok: duplicateIds.length === 0, header_count: headers.length, duplicate_primary_ids: duplicateIds };
      if (duplicateIds.length) report.ok = false;
    } catch (e) {
      report.ok = false;
      report.sheets[sheetName] = { ok: false, code: String(e && e.message || e).substring(0, 160) };
    }
  }
  return report;
}
