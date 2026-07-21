/**
 * Order.gs — Samijaya MVP
 *
 * Fase 4c: API order.
 * Fungsi publik: orderGetSlotAvailability, orderCreateOrder.
 * Semua operasi tulis (Orders, OrderItems, PointHistory, Members) dalam withLock(); notifikasi sesudah lock.
 * Harga/ongkir/poin/total selalu dihitung server-side — ABAIKAN nilai dari client.
 * Tidak ada dependency eksternal.
 */

// ============================================================
// HELPER INTERNAL
// ============================================================

/**
 * Hitung jarak dua koordinat (km) pakai formula Haversine.
 *
 * @param  {number} lat1
 * @param  {number} lng1
 * @param  {number} lat2
 * @param  {number} lng2
 * @return {number} jarak dalam km
 */
function _haversine(lat1, lng1, lat2, lng2) {
  var R    = 6371; // radius bumi km
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
             Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
             Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c    = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Konversi Date → "YYYY-MM-DD" timezone Asia/Jakarta.
 * Dipakai untuk perbandingan tanggal antar.
 *
 * @param  {Date} date
 * @return {string}
 */
function _toJktDateStr(date) {
  return Utilities.formatDate(date, 'Asia/Jakarta', 'yyyy-MM-dd');
}

/**
 * Konversi Date object atau string → "HH:mm" timezone Asia/Jakarta.
 * Khusus Order.gs — menghindari konflik nama dengan Catalog.gs.
 *
 * @param  {Date|string} v
 * @return {string}
 */
function _toHHMMOrder(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'HH:mm');
  if (typeof v === 'string') return v;
  return '';
}

/**
 * Konversi "HH:mm" → jumlah menit sejak 00:00.
 * Dipakai untuk perbandingan jam operasional secara numerik.
 *
 * @param  {string} hhmm — format "HH:mm"
 * @return {number}      — menit sejak 00:00 (contoh: "07:30" → 450)
 */
function _toMinutes(hhmm) {
  var parts = String(hhmm).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Generate order_id: "SJ" + YYMMDD (Asia/Jakarta) + 3 digit urut harian.
 * Dipanggil di dalam withLock sehingga aman dari race condition.
 * Hitung urutan dari baris Orders yang sudah dibaca (bukan baca ulang).
 *
 * @param  {Object[]} ordersRows — semua baris Orders, sudah dibaca sebelumnya
 * @return {string}              — contoh: "SJ260718001"
 */
function _generateOrderId(ordersRows) {
  var prefix = 'SJ' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyMMdd');
  var maxSeq = 0;
  for (var i = 0; i < ordersRows.length; i++) {
    var oid = String(ordersRows[i].order_id || '');
    if (oid.indexOf(prefix) === 0) {
      var seq = parseInt(oid.substring(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  var nextSeq = String(maxSeq + 1);
  while (nextSeq.length < 3) nextSeq = '0' + nextSeq;
  return prefix + nextSeq;
}

/**
 * Notifikasi order baru ke admin via Telegram.
 * Kirim ringkasan order sebagai teks. Tanpa tombol approval (Unit 5B).
 *
 * @param {Object} orderObj — object order yang sudah ditulis ke sheet
 * @param {Object[]} orderItems — snapshot item dari createOrder (in-memory)
 */
function _notifyAdminNewOrder(orderObj, orderItems) {
  // Susun ringkasan items
  var itemsText = '';
  try {
    itemsText = tgFormatOrderItems(orderObj.order_id, {
      html: true,
      priceStyle: 'parentheses',
      items: orderItems
    });
  } catch (e) {
    itemsText = '  (gagal baca items)';
  }

  // Format metode kirim
  var metodeInfo = String(orderObj.metode_kirim);
  if (orderObj.alamat_snapshot) {
    metodeInfo += ' — ' + orderObj.alamat_snapshot;
  }

  // Tgl antar + catatan
  var tglAntar = String(orderObj.tgl_antar || '');
  var catatan  = String(orderObj.catatan_customer || '-');

  var infoPenerima = '';
  if (String(orderObj.nama_penerima) !== String(orderObj.nama) || String(orderObj.no_hp_penerima) !== String(orderObj.no_hp)) {
    infoPenerima = '🤝 Penerima: ' + tgEscapeHtml(orderObj.nama_penerima) + ' (' + tgEscapeHtml(orderObj.no_hp_penerima) + ')\n';
  }

  var pesan = '🛒 <b>Order Baru!</b>\n\n'
    + '📋 ID: <code>' + orderObj.order_id + '</code>\n'
    + '👤 Nama: ' + tgEscapeHtml(orderObj.nama) + '\n'
    + '📞 No HP: ' + tgEscapeHtml(orderObj.no_hp) + '\n'
    + infoPenerima
    + '📦 Metode: ' + tgEscapeHtml(metodeInfo) + '\n'
    + '📅 Tgl Antar: ' + tgEscapeHtml(tglAntar) + '\n'
    + '💳 Bayar: ' + tgEscapeHtml(orderObj.metode_bayar) + '\n\n'
    + '<b>Items:</b>\n' + (itemsText || '  (kosong)') + '\n'
    + '\n💰 Subtotal: Rp' + Number(orderObj.subtotal).toLocaleString('id')
    + '\n🚚 Ongkir: Rp' + Number(orderObj.ongkir || 0).toLocaleString('id')
    + '\n🎁 Poin: -Rp' + Number(orderObj.poin_dipakai || 0).toLocaleString('id')
    + '\n<b>Total: Rp' + Number(orderObj.total).toLocaleString('id') + '</b>\n\n'
    + '📝 Catatan: ' + tgEscapeHtml(catatan);

  var opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Proses', callback_data: 'st:PROSES:' + orderObj.order_id },
          { text: '❌ Batal', callback_data: 'st:BATAL_ASK:' + orderObj.order_id }
        ]
      ]
    }
  };

  tgSendToAdmins(pesan, opts);

  try { safeLog('NOTIF', 'ORDER_NOTIFICATION_SENT', orderObj.order_id, {
    function: '_notifyAdminNewOrder', stage: 'telegram', order_id: orderObj.order_id
  }); } catch (_) {}
}

function _orderNormalizeRequestId(value) {
  if (typeof value !== 'string') return '';
  var key = value.trim().toLowerCase();
  if (key.length > 64 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) return '';
  return key;
}

function _orderCanonicalIntent(payload, member) {
  var rawItems = Array.isArray(payload.items) ? payload.items : [];
  var items = [];
  for (var i = 0; i < rawItems.length; i++) {
    var rawAddons = Array.isArray(rawItems[i].addon_ids) ? rawItems[i].addon_ids : [];
    var addonMap = {};
    for (var a = 0; a < rawAddons.length; a++) addonMap[String(rawAddons[a]).trim()] = true;
    var addonIds = Object.keys(addonMap).filter(function(id) { return !!id; }).sort();
    items.push({
      product_id: String(rawItems[i].product_id || '').trim(),
      variant_id: String(rawItems[i].variant_id || '').trim(),
      addon_ids: addonIds,
      qty: Number(rawItems[i].qty)
    });
  }
  var addressId = String(payload.address_id || '').trim();
  var normalizedReceiverName = String(payload.nama_penerima || '').trim() || String(member.nama || '').trim();
  var normalizedReceiverPhone = (String(payload.no_hp_penerima || '').trim() || String(member.no_hp || '').trim()).replace(/^\+/, '');
  var addressIntent = addressId ? { address_id: addressId } : {
    address_id: '',
    alamat_snapshot: String(payload.alamat_snapshot || '').trim(),
    lat: Number(payload.lat),
    lng: Number(payload.lng)
  };
  return {
    member_id: String(member.member_id), items: items,
    tgl_antar: String(payload.tgl_antar || '').trim(),
    metode_kirim: String(payload.metode_kirim || '').trim().toUpperCase(),
    lokasi_pickup_id: String(payload.lokasi_pickup_id || '').trim(),
    jam_pilih: String(payload.jam_pilih || '').trim(),
    slot_id: String(payload.slot_id || '').trim(),
    metode_bayar: String(payload.metode_bayar || '').trim().toUpperCase(),
    pakai_poin: payload.pakai_poin === true || String(payload.pakai_poin).toLowerCase() === 'true',
    promo_code: _promoNormalizeCode(payload.promo_code),
    nama_penerima: normalizedReceiverName,
    no_hp_penerima: normalizedReceiverPhone,
    catatan_customer: String(payload.catatan_customer || '').trim(),
    address: addressIntent
  };
}

function _orderFingerprint(payload, member) {
  return sha256(JSON.stringify(_orderCanonicalIntent(payload, member)));
}

function _orderFindByRequestId(orders, memberId, requestId) {
  for (var i = 0; i < orders.length; i++) {
    if (String(orders[i].member_id) === String(memberId) && String(orders[i].client_request_id || '').toLowerCase() === requestId) return orders[i];
  }
  return null;
}

function _orderParseCommitSnapshot(order) {
  try {
    var snapshot = JSON.parse(String(order.commit_snapshot_json || ''));
    return snapshot && snapshot.order && snapshot.response ? snapshot : null;
  } catch (_) { return null; }
}

function _orderRowsEqual(actual, expected, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (String(actual[keys[i]] == null ? '' : actual[keys[i]]) !== String(expected[keys[i]] == null ? '' : expected[keys[i]])) return false;
  }
  return true;
}

function _orderUpdateRequired(orderId, patch) {
  if (!updateRowById('Orders', 'order_id', orderId, patch)) throw new Error('ORDER_UPDATE_FAILED');
}

function _orderFailpoint(stage) {
  if (typeof ORDER_TEST_FAIL_STAGE !== 'undefined' && String(ORDER_TEST_FAIL_STAGE) === String(stage)) throw new Error('TEST_FAIL_' + stage);
}

function _orderEnsureRows(sheetName, idColumn, expectedRows, compareKeys) {
  if (!expectedRows || expectedRows.length === 0) return { ok: true };
  var existing = readAll(sheetName);
  var byId = {};
  for (var i = 0; i < existing.length; i++) byId[String(existing[i][idColumn])] = existing[i];
  var missing = [];
  for (var e = 0; e < expectedRows.length; e++) {
    var id = String(expectedRows[e][idColumn]);
    if (byId[id]) {
      if (!_orderRowsEqual(byId[id], expectedRows[e], compareKeys)) return { ok: false, code: 'ORDER_CHILD_CONFLICT' };
    } else {
      missing.push(expectedRows[e]);
    }
  }
  var written = appendRowsObj(sheetName, missing);
  if (written.written !== missing.length) return { ok: false, code: 'ORDER_WRITE_COUNT_MISMATCH' };
  return { ok: true };
}

function _orderMarkRecoveryRequired(orderId, stage, code) {
  var shouldAlert = true;
  try {
    var currentOrders = readAll('Orders');
    for (var i = 0; i < currentOrders.length; i++) {
      if (String(currentOrders[i].order_id) === String(orderId) && String(currentOrders[i].commit_status) === 'RECOVERY_REQUIRED' && String(currentOrders[i].commit_error_code) === String(code)) shouldAlert = false;
    }
  } catch (_) {}
  try { updateRowById('Orders', 'order_id', orderId, { commit_status: 'RECOVERY_REQUIRED', commit_stage: stage, commit_error_code: code }); } catch (_) {}
  var result = { ok: false, code: 'ORDER_RECOVERY_REQUIRED', error: 'Pesanan memerlukan pemeriksaan. Silakan hubungi admin.' };
  if (shouldAlert) result._alert = { order_id: orderId, stage: stage, code: code };
  return result;
}

function _orderCommitSnapshot(snapshot, existingOrder) {
  var orderId = snapshot.order.order_id;
  var stage = String((existingOrder || {}).commit_stage || 'PARENT_CREATED');
  try {
    var ensured = _orderEnsureRows('OrderItems', 'order_item_ref', snapshot.order_items, ['order_item_ref','order_id','product_id','nama_snapshot','harga_snapshot','qty','subtotal','variant_id','variant_nama_snapshot','nama_axis_snapshot']);
    if (!ensured.ok) return _orderMarkRecoveryRequired(orderId, stage, ensured.code);
    stage = 'ITEMS_WRITTEN'; _orderUpdateRequired(orderId, { commit_stage: stage, commit_error_code: '' }); _orderFailpoint(stage);

    ensured = _orderEnsureRows('OrderItemAddons', 'id', snapshot.addon_rows, ['id','order_id','order_item_ref','addon_id','nama_addon_snapshot','harga_snapshot']);
    if (!ensured.ok) return _orderMarkRecoveryRequired(orderId, stage, ensured.code);
    stage = 'ADDONS_WRITTEN'; _orderUpdateRequired(orderId, { commit_stage: stage, commit_error_code: '' }); _orderFailpoint(stage);

    if (snapshot.promo_usage) {
      ensured = _promoEnsureUsage(snapshot.promo_usage);
      if (!ensured.ok) return _orderMarkRecoveryRequired(orderId, stage, ensured.code);
    }
    stage = 'PROMO_WRITTEN'; _orderUpdateRequired(orderId, { commit_stage: stage, commit_error_code: '' }); _orderFailpoint(stage);

    if (snapshot.point_ledger) {
      var members = readAll('Members');
      var currentMember = null;
      for (var m = 0; m < members.length; m++) if (String(members[m].member_id) === String(snapshot.order.member_id)) currentMember = members[m];
      if (!currentMember) return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_MEMBER_NOT_FOUND');
      var balance = Number(currentMember.total_poin) || 0;
      var pointRows = readAll('PointHistory');
      var pointExisting = null;
      for (var p = 0; p < pointRows.length; p++) if (String(pointRows[p].id) === String(snapshot.point_ledger.id)) pointExisting = pointRows[p];
      if (!pointExisting) {
        if (balance !== Number(snapshot.saldo_poin_sebelum)) return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_POINT_BALANCE_CONFLICT');
        var pointWrite = appendRowsObj('PointHistory', [snapshot.point_ledger]);
        if (pointWrite.written !== 1) return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_POINT_WRITE_FAILED');
      } else if (!_orderRowsEqual(pointExisting, snapshot.point_ledger, ['id','member_id','order_id','tipe','jumlah','saldo_akhir','event_code','saldo_sebelum'])) {
        return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_POINT_EVENT_CONFLICT');
      }
      if (balance === Number(snapshot.saldo_poin_sebelum)) {
        if (!updateRowById('Members', 'member_id', snapshot.order.member_id, { total_poin: snapshot.saldo_poin_sesudah })) return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_MEMBER_UPDATE_FAILED');
      } else if (balance !== Number(snapshot.saldo_poin_sesudah)) {
        return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_POINT_BALANCE_CONFLICT');
      }
    }
    stage = 'MEMBER_UPDATED'; _orderUpdateRequired(orderId, { commit_stage: stage, commit_error_code: '' }); _orderFailpoint(stage);

    var verifyItems = readAll('OrderItems').filter(function(row) { return String(row.order_id) === orderId; });
    var verifyAddons = readAll('OrderItemAddons').filter(function(row) { return String(row.order_id) === orderId; });
    if (verifyItems.length !== Number(snapshot.expected_item_count) || verifyAddons.length !== Number(snapshot.expected_addon_count)) {
      return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_CHILD_COUNT_MISMATCH');
    }
    var committedAt = nowJkt();
    _orderFailpoint('COMMITTED');
    _orderUpdateRequired(orderId, { commit_status: 'COMMITTED', commit_stage: 'COMMITTED', commit_error_code: '', committed_at: committedAt, status_updated_at: committedAt });
    return { ok: true, data: snapshot.response, _notification: { order: snapshot.order, items: snapshot.notification_items }, _new_commit: true };
  } catch (e) {
    return _orderMarkRecoveryRequired(orderId, stage, 'ORDER_COMMIT_FAILED');
  }
}

function _orderResponseFromExisting(order) {
  var snapshot = _orderParseCommitSnapshot(order);
  if (!snapshot) return { ok: false, code: 'ORDER_RECOVERY_REQUIRED', error: 'Data pemulihan pesanan tidak tersedia.' };
  var response = snapshot.response;
  response.idempotent_replay = true;
  return { ok: true, data: response };
}

function _orderSafeAdminAlert(alert) {
  if (!alert) return;
  try { tgSendToAdmins('⚠️ Order recovery diperlukan\nID: <code>' + tgEscapeHtml(alert.order_id) + '</code>\nStage: ' + tgEscapeHtml(alert.stage) + '\nCode: ' + tgEscapeHtml(alert.code)); } catch (_) {}
}

// ============================================================
// 1. orderGetSlotAvailability(payload)
// ============================================================
/**
 * Ketersediaan slot pengiriman untuk satu tanggal tertentu.
 * Tidak butuh lock — hanya baca.
 *
 * Input:  { tanggal: "YYYY-MM-DD" }
 * Return: { ok:true, data:[{ slot_id, jam_mulai, jam_selesai, kuota, terpakai, sisa, penuh }] }
 *
 * @param  {Object} payload
 * @return {Object}
 */
function orderGetSlotAvailability(payload) {
  var tanggal = String(payload.tanggal || '').trim();
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return { ok: false, code: 'BAD_REQUEST', error: 'tanggal wajib format YYYY-MM-DD' };
  }

  // Baca sekali, proses di memori
  var allSlots  = readAll('DeliverySlots');
  var allOrders = readAll('Orders');

  var result = [];
  for (var i = 0; i < allSlots.length; i++) {
    var slot = allSlots[i];
    if (String(slot.status) !== 'aktif') continue;

    var slotId = String(slot.slot_id);
    var kuota  = Number(slot.kuota) || 0;

    // Hitung terpakai: order di tanggal + slot ini, status bukan BATAL
    var terpakai = 0;
    for (var j = 0; j < allOrders.length; j++) {
      var ord    = allOrders[j];
      var ordTgl = ord.tgl_antar;
      if (ordTgl instanceof Date) ordTgl = _toJktDateStr(ordTgl);
      else ordTgl = String(ordTgl).trim();

      var ordCommit = String(ord.commit_status || '').trim().toUpperCase();
      var reservesSlot = ordCommit === 'CREATING' || ordCommit === 'RECOVERY_REQUIRED' ||
        (isOrderCommittedRow(ord) && String(ord.status) !== 'BATAL');
      if (ordTgl === tanggal && String(ord.slot_id) === slotId && reservesSlot) {
        terpakai++;
      }
    }

    var sisa = kuota - terpakai;
    if (sisa < 0) sisa = 0;

    result.push({
      slot_id:     slotId,
      jam_mulai:   _toHHMMOrder(slot.jam_mulai),    // Date→"HH:mm" Asia/Jakarta
      jam_selesai: _toHHMMOrder(slot.jam_selesai),
      kuota:       kuota,
      terpakai:    terpakai,
      sisa:        sisa,
      penuh:       sisa <= 0
    });
  }

  return { ok: true, data: result };
}

// ============================================================
// 2. orderCreateOrder(payload, token)
// ============================================================
/**
 * Buat/recover order secara idempotent di dalam lock; notifikasi Telegram dijalankan setelah lock dilepas.
 *
 * Input payload: {
 *   metode_kirim,      // "AMBIL" | "OJOL" | "DIANTAR"
 *   lokasi_pickup_id,  // wajib untuk AMBIL & OJOL
 *   jam_pilih,         // wajib untuk AMBIL & OJOL — disimpan ke catatan
 *   address_id,        // opsional (referensi MemberAddresses)
 *   alamat_snapshot,   // wajib untuk DIANTAR (teks bebas)
 *   lat,               // wajib untuk DIANTAR
 *   lng,               // wajib untuk DIANTAR
 *   slot_id,           // wajib untuk DIANTAR
 *   tgl_antar,         // wajib untuk DIANTAR "YYYY-MM-DD"
 *   metode_bayar,      // "COD" | "TRANSFER"
 *   pakai_poin,        // boolean
 *   promo_code,        // opsional; backend validasi & hitung ulang
 *   items: [{ product_id, qty }],
 *   catatan_customer
 * }
 *
 * @param  {Object} payload
 * @param  {string} token
 * @return {Object}
 */
function orderCreateOrder(payload, token) {
  payload = payload || {};
  var lockResult = withLock(function () {

    // ----------------------------------------------------------
    // 1. Validasi sesi
    // ----------------------------------------------------------
    var member = requireSession(token);
    if (!member) {
      return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid atau kedaluwarsa' };
    }

    var requestId = _orderNormalizeRequestId(payload.client_request_id);
    if (!requestId) return { ok: false, code: 'BAD_REQUEST', error: 'client_request_id tidak valid' };
    var requestFingerprint = _orderFingerprint(payload, member);
    var allOrders = readAll('Orders');
    var existingAttempt = _orderFindByRequestId(allOrders, member.member_id, requestId);
    if (existingAttempt) {
      if (String(existingAttempt.request_fingerprint || '') !== requestFingerprint) {
        return { ok: false, code: 'ORDER_IDEMPOTENCY_CONFLICT', error: 'Checkout key sudah dipakai untuk payload berbeda.' };
      }
      var existingStatus = String(existingAttempt.commit_status || '').trim().toUpperCase();
      if (existingStatus === 'COMMITTED') return _orderResponseFromExisting(existingAttempt);
      var existingSnapshot = _orderParseCommitSnapshot(existingAttempt);
      if (!existingSnapshot) return _orderMarkRecoveryRequired(String(existingAttempt.order_id), String(existingAttempt.commit_stage || ''), 'ORDER_SNAPSHOT_INVALID');
      return _orderCommitSnapshot(existingSnapshot, existingAttempt);
    }

    for (var unresolvedIndex = 0; unresolvedIndex < allOrders.length; unresolvedIndex++) {
      var unresolvedStatus = String(allOrders[unresolvedIndex].commit_status || '').trim().toUpperCase();
      if (unresolvedStatus === 'CREATING' || unresolvedStatus === 'RECOVERY_REQUIRED') {
        return { ok: false, code: 'ORDER_RECOVERY_REQUIRED', error: 'Sistem sedang memulihkan transaksi sebelumnya.', _alert: {
          order_id: String(allOrders[unresolvedIndex].order_id || ''), stage: String(allOrders[unresolvedIndex].commit_stage || ''), code: 'UNRESOLVED_ORDER_BLOCK'
        } };
      }
    }

    // ----------------------------------------------------------
    // 2. Toko buka
    // ----------------------------------------------------------
    if (getSetting('TOKO_BUKA') !== '1') {
      return { ok: false, code: 'TOKO_TUTUP', error: 'Toko sedang tutup' };
    }

    // ----------------------------------------------------------
    // 3. Validasi struktur items
    // ----------------------------------------------------------
    var items = payload.items;
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Items tidak boleh kosong' };
    }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.product_id) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Setiap item harus memiliki product_id' };
      }
      var qtyNum = Number(it.qty);
      // qty harus integer positif, maksimal 99 (cegah abuse)
      if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > 99) {
        return { ok: false, code: 'BAD_REQUEST', error: 'qty harus bilangan bulat 1–99' };
      }
    }

    // ----------------------------------------------------------
    // 4. Validasi produk & harga dari sheet — ABAIKAN harga client
    // ----------------------------------------------------------
    var allProducts = readAll('Products');
    var productMap  = {};
    for (var i = 0; i < allProducts.length; i++) {
      productMap[String(allProducts[i].product_id)] = allProducts[i];
    }

    // Baca varian & add-on masing-masing sekali, lalu bangun map di memori.
    var allVariants = readAll('ProductVariants');
    var allAddons = readAll('ProductAddons');
    var variantsGrouped = {};
    var variantMap = {};
    var addonMap = {};
    for (var vi = 0; vi < allVariants.length; vi++) {
      var variantRow = allVariants[vi];
      var variantIdKey = String(variantRow.variant_id);
      var variantProductKey = String(variantRow.product_id);
      variantMap[variantIdKey] = variantRow;
      if (_promoIsTruthy(variantRow.aktif)) {
        if (!variantsGrouped[variantProductKey]) variantsGrouped[variantProductKey] = [];
        variantsGrouped[variantProductKey].push(variantRow);
      }
    }
    for (var adi = 0; adi < allAddons.length; adi++) {
      addonMap[String(allAddons[adi].addon_id)] = allAddons[adi];
    }

    var lineItems = [];
    var subtotal  = 0; // subtotal = harga produk saja, TIDAK termasuk ongkir
    for (var i = 0; i < items.length; i++) {
      var pid  = String(items[i].product_id);
      var qty  = Number(items[i].qty);
      var prod = productMap[pid];

      if (!prod || String(prod.status) !== 'aktif' || Number(prod.tersedia) !== 1) {
        var prodName = prod ? String(prod.nama) : pid;
        return { ok: false, code: 'PRODUK_TIDAK_TERSEDIA', error: prodName + ' tidak tersedia' };
      }

      var hargaItem = 0;
      var varIdSnapshot = '';
      var varNamaSnapshot = '';
      var axisNamaSnapshot = '';
      
      var variantsForThisProduct = variantsGrouped[pid] || [];
      var isProductBervarian = variantsForThisProduct.length > 0;
      
      if (items[i].variant_id) {
        var varian = variantMap[String(items[i].variant_id)];
        if (!varian) {
          return { ok: false, code: 'VARIANT_NOT_FOUND', error: 'Varian tidak ditemukan' };
        }
        if (!_promoIsTruthy(varian.aktif)) {
          return { ok: false, code: 'VARIANT_INACTIVE', error: 'Varian "' + varian.nama_varian + '" sedang tidak tersedia' };
        }
        if (String(varian.product_id) !== pid) {
          return { ok: false, code: 'VARIANT_MISMATCH', error: 'Varian tidak sesuai dengan produk' };
        }
        
        hargaItem = (Number(prod.harga) || 0) + (Number(varian.harga) || 0);
        varIdSnapshot = String(varian.variant_id);
        varNamaSnapshot = String(varian.nama_varian);
        axisNamaSnapshot = String(varian.nama_axis || '');
      } else {
        if (isProductBervarian) {
          return { ok: false, code: 'VARIANT_REQUIRED', error: 'Produk "' + prod.nama + '" wajib pilih varian' };
        }
        hargaItem = Number(prod.harga) || 0;
      }

      var selectedAddonIds = items[i].addon_ids || [];
      if (!Array.isArray(selectedAddonIds)) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Format addon_ids tidak valid' };
      }
      var selectedAddonSeen = {};
      for (var duplicateIndex = 0; duplicateIndex < selectedAddonIds.length; duplicateIndex++) {
        var duplicateKey = String(selectedAddonIds[duplicateIndex]);
        if (selectedAddonSeen[duplicateKey]) return { ok: false, code: 'DUPLICATE_ADDON', error: 'Add-on yang sama tidak boleh dipilih lebih dari sekali' };
        selectedAddonSeen[duplicateKey] = true;
      }
      var addonSnapshots = [];
      var addonTotal = 0;

      for (var ai = 0; ai < selectedAddonIds.length; ai++) {
        var addon = addonMap[String(selectedAddonIds[ai])];
        if (!addon) return { ok: false, code: 'ADDON_NOT_FOUND', error: 'Add-on tidak ditemukan' };
        if (!_promoIsTruthy(addon.aktif)) return { ok: false, code: 'ADDON_INACTIVE', error: 'Add-on "' + addon.nama_addon + '" tidak tersedia' };
        if (String(addon.product_id) !== pid) return { ok: false, code: 'ADDON_MISMATCH', error: 'Add-on tidak sesuai produk' };
        var addonPrice = Number(addon.harga) || 0;
        addonTotal += addonPrice;
        addonSnapshots.push({ addon_id: addon.addon_id, nama_addon: addon.nama_addon, harga: addonPrice });
      }

      hargaItem = hargaItem + addonTotal; // harga final = dasar + varian + Σaddon

      var subtotalItem = hargaItem * qty;
      subtotal += subtotalItem;

      lineItems.push({
        product_id:     pid,
        kategori_id:    String(prod.kategori_id || ''),
        nama_snapshot:  String(prod.nama),
        harga_snapshot: hargaItem,
        qty:            qty,
        subtotal:       subtotalItem,
        variant_id:     varIdSnapshot,
        variant_nama_snapshot: varNamaSnapshot,
        nama_axis_snapshot: axisNamaSnapshot,
        addon_snapshots: addonSnapshots
      });
    }

    // ----------------------------------------------------------
    // 5. Baca PickupLocations & Orders sekali — dipakai semua branch
    //    Orders dipakai untuk kuota slot (DIANTAR) + _generateOrderId
    // ----------------------------------------------------------
    var allPickup = readAll('PickupLocations');
    var pickupMap = {};
    var pickupArr = [];
    for (var i = 0; i < allPickup.length; i++) {
      if (String(allPickup[i].status) === 'aktif') {
        var locKey = String(allPickup[i].lokasi_id);
        pickupMap[locKey] = allPickup[i];
        pickupArr.push(allPickup[i]);
      }
    }

    // allOrders sudah dibaca setelah validasi idempotency dan dipakai ulang di bawah.

    // ----------------------------------------------------------
    // 5. Validasi metode_kirim & hitung ongkir server-side
    // ----------------------------------------------------------
    var metodeKirim    = String(payload.metode_kirim || '');
    var ongkir         = 0;
    var slotId         = '';
    var lokasiPickupId = '';
    var namaLokasi     = '';
    var alamatSnapshot = '';
    var latFinal       = '';
    var lngFinal       = '';
    var jarakKmFinal   = '';
    var jamPilih       = '';

    // ----------------------------------------------------------
    // 5.1 Validasi tanggal_antar untuk SEMUA metode
    // ----------------------------------------------------------
    var tglAntar = String(payload.tgl_antar || '').trim();
    if (!tglAntar || !/^\d{4}-\d{2}-\d{2}$/.test(tglAntar)) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Tanggal wajib diisi' };
    }

    var now = new Date();
    var todayJkt = _toJktDateStr(now);
    if (tglAntar < todayJkt) {
      return { ok: false, code: 'TANGGAL_TIDAK_VALID', error: 'Tanggal tidak boleh di masa lampau' };
    }

    var jktHour = parseInt(Utilities.formatDate(now, 'Asia/Jakarta', 'HH'), 10);
    var minDays = (jktHour >= 18) ? 2 : 1;
    var minDateObj = new Date(now.getTime() + minDays * 24 * 60 * 60 * 1000);
    var minDateStr = _toJktDateStr(minDateObj);

    if (tglAntar < minDateStr) {
      return { ok: false, code: 'TANGGAL_TERLALU_CEPAT', error: 'Pemesanan minimal H+1. Pesanan di atas jam 18.00 WIB minimal H+2.' };
    }

    var allHolidays = readAll('Holidays');
    for (var i = 0; i < allHolidays.length; i++) {
      var holTgl = allHolidays[i].tanggal;
      if (holTgl instanceof Date) holTgl = _toJktDateStr(holTgl);
      else holTgl = String(holTgl).trim();
      if (holTgl === tglAntar) {
        return { ok: false, code: 'HARI_LIBUR', error: 'Tanggal yang dipilih adalah hari libur' };
      }
    }

    // ---- AMBIL -----------------------------------------------
    if (metodeKirim === 'AMBIL' || metodeKirim === 'OJOL') {
      lokasiPickupId = String(payload.lokasi_pickup_id || '').trim();
      if (!lokasiPickupId || !pickupMap[lokasiPickupId]) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Lokasi pickup tidak valid' };
      }
      jamPilih = String(payload.jam_pilih || '').trim();
      if (!jamPilih) {
        return { ok: false, code: 'BAD_REQUEST', error: 'jam_pilih wajib diisi' };
      }
      // Validasi format jam_pilih
      if (!/^\d{1,2}:\d{2}$/.test(jamPilih)) {
        return { ok: false, code: 'BAD_REQUEST', error: 'jam_pilih harus format HH:mm' };
      }

      // --- Validasi jam operasional lokasi pickup ---
      var lokObj   = pickupMap[lokasiPickupId];
      var jamBuka  = _toHHMMOrder(lokObj.jam_buka);   // Date dari Sheets → "HH:mm"
      var jamTutup = _toHHMMOrder(lokObj.jam_tutup);
      var mPilih   = _toMinutes(jamPilih);
      var mBuka    = _toMinutes(jamBuka);
      var mTutup   = _toMinutes(jamTutup);
      if (mPilih < mBuka || mPilih > mTutup) {
        return {
          ok: false,
          code: 'JAM_LUAR_OPERASIONAL',
          error: 'Jam di luar jam operasional ' + String(lokObj.nama) + ' (' + jamBuka + '\u2013' + jamTutup + ')'
        };
      }

      namaLokasi     = String(lokObj.nama);
      alamatSnapshot = namaLokasi; // untuk AMBIL/OJOL, alamat_snapshot = nama lokasi pickup
      ongkir         = 0;
      slotId         = '';

    // ---- DIANTAR ---------------------------------------------
    } else if (metodeKirim === 'DIANTAR') {
      var authoritativeAddressId = String(payload.address_id || '').trim();
      var authoritativeAddress = null;
      if (authoritativeAddressId) {
        var memberAddresses = readAll('MemberAddresses');
        for (var addressIndex = 0; addressIndex < memberAddresses.length; addressIndex++) {
          if (String(memberAddresses[addressIndex].address_id) === authoritativeAddressId) {
            authoritativeAddress = memberAddresses[addressIndex];
            break;
          }
        }
        var addressStatus = String((authoritativeAddress || {}).status || '').trim().toLowerCase();
        var addressActive = addressStatus === 'aktif' || addressStatus === 'true' || addressStatus === '1' || addressStatus === 'ya';
        if (!authoritativeAddress || String(authoritativeAddress.member_id) !== String(member.member_id) || !addressActive) {
          return { ok: false, code: 'ADDRESS_NOT_FOUND', error: 'Alamat tersimpan tidak valid atau tidak aktif' };
        }
        payload.lat = authoritativeAddress.latitude;
        payload.lng = authoritativeAddress.longitude;
        var addressParts = [];
        if (authoritativeAddress.label) addressParts.push(String(authoritativeAddress.label).trim());
        if (authoritativeAddress.alamat_snapshot) addressParts.push(String(authoritativeAddress.alamat_snapshot).trim());
        if (authoritativeAddress.detail) addressParts.push(String(authoritativeAddress.detail).trim());
        payload.alamat_snapshot = addressParts.filter(function(value) { return !!value; }).join(' — ');
      }
      // Validasi koordinat tujuan — jangan pakai !lat karena 0 falsy
      var latRaw = payload.lat;
      var lngRaw = payload.lng;
      if (latRaw === undefined || latRaw === null || latRaw === '' ||
          lngRaw === undefined || lngRaw === null || lngRaw === '') {
        return { ok: false, code: 'BAD_REQUEST', error: 'lat dan lng wajib untuk metode DIANTAR' };
      }
      var latTujuan = Number(latRaw);
      var lngTujuan = Number(lngRaw);
      if (!isFinite(latTujuan) || !isFinite(lngTujuan) || latTujuan < -90 || latTujuan > 90 || lngTujuan < -180 || lngTujuan > 180) {
        return { ok: false, code: 'BAD_REQUEST', error: 'lat dan lng harus berupa angka valid' };
      }

      // Cari origin pickup terdekat (hanya pickup yang punya lat/lng != 0)
      var bestPickup = null;
      var bestDist   = Infinity;
      for (var i = 0; i < pickupArr.length; i++) {
        var pLat = Number(pickupArr[i].latitude);
        var pLng = Number(pickupArr[i].longitude);
        if (!pLat || !pLng) continue;
        var d = _haversine(pLat, pLng, latTujuan, lngTujuan);
        if (d < bestDist) { bestDist = d; bestPickup = pickupArr[i]; }
      }
      if (!bestPickup) {
        return { ok: false, code: 'LUAR_JANGKAUAN', error: 'Tidak ada titik asal pengiriman yang tersedia' };
      }

      // Hitung jarak & ongkir — semua parameter dari Settings, BUKAN dari client
      var faktorKoreksi    = Number(getSetting('ONGKIR_FAKTOR_KOREKSI')) || 1.3;
      var radiusMax        = Number(getSetting('ONGKIR_RADIUS_MAX_KM'))  || 15;
      var ongkirPerKm      = Number(getSetting('ONGKIR_PER_KM'))         || 1000;
      var minOrderDelivery = Number(getSetting('MIN_ORDER_DELIVERY'))     || 0;
      var jarakTerkoreksi  = bestDist * faktorKoreksi;

      if (jarakTerkoreksi > radiusMax) {
        return {
          ok: false,
          code: 'LUAR_JANGKAUAN',
          error: 'Lokasi pengiriman di luar jangkauan (' + (Math.round(jarakTerkoreksi * 10) / 10) + ' km)'
        };
      }
      if (subtotal < minOrderDelivery) {
        return {
          ok: false,
          code: 'MIN_ORDER',
          error: 'Minimum order untuk pengiriman adalah Rp' + minOrderDelivery
        };
      }

      if (jarakTerkoreksi <= 5) {
        ongkir = 0;
      } else {
        ongkir = Math.round(jarakTerkoreksi) * ongkirPerKm;
      }
      jarakKmFinal = Math.round(jarakTerkoreksi * 100) / 100; // 2 desimal
      latFinal     = latTujuan;
      lngFinal     = lngTujuan;
      lokasiPickupId = '';

      // slot_id wajib
      slotId = String(payload.slot_id || '').trim();
      if (!slotId) {
        return { ok: false, code: 'BAD_REQUEST', error: 'slot_id wajib untuk metode DIANTAR' };
      }

      // Validasi slot ada & aktif di DeliverySlots
      var allSlots = readAll('DeliverySlots');
      var slotObj  = null;
      for (var i = 0; i < allSlots.length; i++) {
        if (String(allSlots[i].slot_id) === slotId && String(allSlots[i].status) === 'aktif') {
          slotObj = allSlots[i];
          break;
        }
      }
      if (!slotObj) {
        return { ok: false, code: 'BAD_REQUEST', error: 'slot_id tidak valid atau tidak aktif' };
      }

      // Cek kuota slot (aman dari balapan: kita dalam lock & pakai allOrders yg sudah dibaca)
      var terpakai = 0;
      for (var i = 0; i < allOrders.length; i++) {
        var ord    = allOrders[i];
        var ordTgl = ord.tgl_antar;
        if (ordTgl instanceof Date) ordTgl = _toJktDateStr(ordTgl);
        else ordTgl = String(ordTgl).trim();
        var ordCommit = String(ord.commit_status || '').trim().toUpperCase();
        var reservesSlot = ordCommit === 'CREATING' || ordCommit === 'RECOVERY_REQUIRED' ||
          (isOrderCommittedRow(ord) && String(ord.status) !== 'BATAL');
        if (ordTgl === tglAntar && String(ord.slot_id) === slotId && reservesSlot) {
          terpakai++;
        }
      }
      if (terpakai >= Number(slotObj.kuota)) {
        return { ok: false, code: 'SLOT_PENUH', error: 'Slot pengiriman untuk tanggal ini sudah penuh' };
      }

      alamatSnapshot = String(payload.alamat_snapshot || '').trim();
      if (!alamatSnapshot || alamatSnapshot.length > 500) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Alamat pengiriman wajib diisi dan maksimal 500 karakter' };
      }

    } else {
      return {
        ok: false,
        code: 'BAD_REQUEST',
        error: 'metode_kirim tidak valid. Gunakan AMBIL, OJOL, atau DIANTAR'
      };
    }

    // ----------------------------------------------------------
    // 6. Validasi Penerima (DIANTAR / OJOL)
    // ----------------------------------------------------------
    var namaPenerimaFinal = String(member.nama);
    var noHpPenerimaFinal = String(member.no_hp);

    if (metodeKirim === 'DIANTAR' || metodeKirim === 'OJOL') {
      var rawNamaPenerima = payload.nama_penerima;
      var rawNoHpPenerima = payload.no_hp_penerima;

      if (rawNamaPenerima !== undefined && rawNamaPenerima !== null && String(rawNamaPenerima).trim() !== '') {
        var strNama = String(rawNamaPenerima).trim();
        if (strNama.length < 2) {
          return { ok: false, code: 'NAMA_PENERIMA_TIDAK_VALID', error: 'Nama penerima tidak valid' };
        }
        namaPenerimaFinal = strNama;
      }

      if (rawNoHpPenerima !== undefined && rawNoHpPenerima !== null && String(rawNoHpPenerima).trim() !== '') {
        var inputHp = String(rawNoHpPenerima).trim();
        var testHp = inputHp.replace(/^\+/, '');
        if (!/^\d+$/.test(testHp) || testHp.length < 10 || testHp.length > 14 || !/^(08|628)/.test(testHp)) {
          return { ok: false, code: 'NO_HP_PENERIMA_TIDAK_VALID', error: 'Nomor HP penerima tidak valid' };
        }
        noHpPenerimaFinal = inputHp;
      }
    }

    // ----------------------------------------------------------
    // 7. Validasi & hitung promo, lalu redeem poin.
    //    Cek limit dan tulis usage tetap di dalam lock transaksi ini.
    // ----------------------------------------------------------
    var saldoPoinLama = Number(member.total_poin) || 0;
    var pakaiPoin = payload.pakai_poin === true || String(payload.pakai_poin).toLowerCase() === 'true';
    var promoCode = _promoNormalizeCode(payload.promo_code);
    var ongkirSebelumPromo = ongkir;
    var promoContext = {
      now: now,
      member_id: String(member.member_id),
      subtotal: subtotal,
      ongkir: ongkirSebelumPromo,
      metode_kirim: metodeKirim,
      line_items: lineItems,
      pakai_poin: pakaiPoin,
      saldo_poin: saldoPoinLama,
      orders: allOrders
    };
    var promoResult;
    var promoEvaluation = null;
    if (promoCode) {
      var promoRows = readAll('PromoCodes');
      var promoUsageRows = readAll('PromoUsage');
      promoEvaluation = _promoEvaluate(promoCode, promoContext, promoRows, promoUsageRows);
      if (!promoEvaluation.ok) return promoEvaluation;
      promoResult = promoEvaluation.data;
    } else {
      promoResult = _promoCalculateWithoutCode(promoContext);
    }
    ongkir = promoResult.ongkir_setelah_promo;
    var poinDipakai = promoResult.poin_dipakai;
    var total = promoResult.total;

    // ----------------------------------------------------------
    // 8. Generate order_id
    //    Dipanggil di dalam lock & pakai allOrders yg sama — aman dari balapan
    // ----------------------------------------------------------
    var orderId = _generateOrderId(allOrders);

    // ----------------------------------------------------------
    // 9. Susun catatan_customer final
    //    AMBIL → prepend "[Ambil jam {jam_pilih} di {nama_lokasi}] "
    //    OJOL  → prepend "[Jemput jam {jam_pilih} di {nama_lokasi}] "
    //    DIANTAR → catatan asli apa adanya
    //    (jam_pilih tidak punya kolom sendiri di Orders — disimpan di sini)
    // ----------------------------------------------------------
    var catatanAsli  = String(payload.catatan_customer || '').trim();
    var catatanFinal;
    if (metodeKirim === 'AMBIL') {
      catatanFinal = '[Ambil jam ' + jamPilih + ' di ' + namaLokasi + '] ' + catatanAsli;
    } else if (metodeKirim === 'OJOL') {
      catatanFinal = '[Jemput jam ' + jamPilih + ' di ' + namaLokasi + '] ' + catatanAsli;
    } else {
      catatanFinal = catatanAsli;
    }

    // ----------------------------------------------------------
    // 10. Tulis ke sheet — semua dalam lock
    // ----------------------------------------------------------
    var now    = new Date();
    var nowStr = nowJkt();
    var timeline = JSON.stringify([{ status: 'MENUNGGU', at: nowStr }]);

    // a. Orders — satu baris lengkap sesuai kolom CONTRACT
    var orderObj = {
      order_id:         orderId,
      member_id:        member.member_id,
      nama:             String(member.nama),
      no_hp:            String(member.no_hp),
      tgl_antar:        tglAntar,
      metode_kirim:     metodeKirim,
      lokasi_pickup_id: lokasiPickupId,
      address_id:       String(payload.address_id || ''),
      alamat_snapshot:  alamatSnapshot,
      lat:              latFinal,
      lng:              lngFinal,
      jarak_km:         jarakKmFinal,
      ongkir:           ongkir,
      ongkir_sebelum_promo: ongkirSebelumPromo,
      slot_id:          slotId,
      subtotal:         subtotal,         // harga produk saja, TIDAK termasuk ongkir
      poin_dipakai:     poinDipakai,
      total:            total,
      promo_id:         promoResult.promo_id,
      promo_code:       promoResult.promo_code,
      promo_nama:       promoResult.promo_nama,
      promo_diskon_subtotal: promoResult.diskon_subtotal,
      promo_diskon_produk: promoResult.diskon_produk,
      promo_diskon_ongkir: promoResult.diskon_ongkir,
      promo_diskon_total: promoResult.diskon_total,
      promo_bonus_poin: promoResult.bonus_poin,
      promo_multiplier_poin: promoResult.multiplier_poin,
      poin_earn_dasar: promoResult.poin_earn_dasar,
      poin_earn_final: promoResult.poin_earn_final,
      promo_snapshot_json: promoEvaluation ? JSON.stringify({
        promo: promoEvaluation.promo,
        calculation: promoResult
      }) : '',
      metode_bayar:     String(payload.metode_bayar || ''),
      status:           'MENUNGGU',
      catatan_customer: catatanFinal,
      catatan_admin:    '',
      created_at:       nowStr,
      updated_at:       nowStr,
      status_updated_at: '',
      timeline_json:    timeline,
      nama_penerima:    namaPenerimaFinal,
      no_hp_penerima:   noHpPenerimaFinal,
      client_request_id: requestId,
      request_fingerprint: requestFingerprint,
      commit_status: 'CREATING',
      commit_stage: 'PARENT_CREATED',
      commit_error_code: '',
      committed_at: ''
    };
    var orderItemRows = [];
    var addonRows = [];
    for (var i = 0; i < lineItems.length; i++) {
      var itemRef = orderId + '_' + i;
      lineItems[i].order_item_ref = itemRef;
      orderItemRows.push({
        order_item_ref: itemRef,
        order_id:       orderId,
        product_id:     lineItems[i].product_id,
        nama_snapshot:  lineItems[i].nama_snapshot,
        harga_snapshot: lineItems[i].harga_snapshot,
        qty:            lineItems[i].qty,
        subtotal:       lineItems[i].subtotal,
        variant_id:     lineItems[i].variant_id,
        variant_nama_snapshot: lineItems[i].variant_nama_snapshot,
        nama_axis_snapshot: lineItems[i].nama_axis_snapshot
      });
      var snaps = lineItems[i].addon_snapshots;
      for (var s = 0; s < snaps.length; s++) {
        addonRows.push({
          id: 'OIA_' + sha256(itemRef + '|' + String(snaps[s].addon_id)).substring(0, 24),
          order_id: orderId,
          order_item_ref: itemRef,
          addon_id: snaps[s].addon_id,
          nama_addon_snapshot: snaps[s].nama_addon,
          harga_snapshot: snaps[s].harga,
          created_at: nowStr
        });
      }
    }
    var promoUsageExpected = null;
    if (promoResult.promo_id) {
      promoUsageExpected = {
        usage_id: 'PRU_ORDER_' + orderId,
        promo_id: String(promoResult.promo_id), promo_code: String(promoResult.promo_code),
        order_id: orderId, member_id: String(member.member_id), status: 'DIGUNAKAN',
        used_at: nowStr, used_date: Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd'), cancelled_at: '',
        promo_diskon_subtotal: promoResult.diskon_subtotal, promo_diskon_produk: promoResult.diskon_produk,
        promo_diskon_ongkir: promoResult.diskon_ongkir, promo_diskon_total: promoResult.diskon_total,
        promo_bonus_poin: promoResult.bonus_poin, promo_multiplier_poin: promoResult.multiplier_poin
      };
    }
    var pointLedgerExpected = null;
    var saldoAkhir = saldoPoinLama;
    if (poinDipakai > 0) {
      saldoAkhir = saldoPoinLama - poinDipakai;
      if (saldoAkhir < 0) {
        try { safeLog('ERROR', 'ORDER_POINT_GUARD', orderId, { function: 'orderCreateOrder', stage: 'point_guard', order_id: orderId }); } catch (_) {}
        return { ok: false, code: 'POIN_TIDAK_CUKUP', error: 'Saldo poin tidak mencukupi' };
      }
      pointLedgerExpected = {
        id:          'PTH_ORDER_REDEEM_' + orderId,
        member_id:   member.member_id,
        order_id:    orderId,
        tipe:        'PAKAI',
        jumlah:      -poinDipakai,
        saldo_sebelum: saldoPoinLama,
        saldo_akhir: saldoAkhir,
        event_code: 'ORDER_REDEEMED',
        event_status: 'APPLIED',
        event_snapshot_json: JSON.stringify({ before: saldoPoinLama, after: saldoAkhir, amount: -poinDipakai }),
        keterangan:  'Redeem order ' + orderId,
        created_at:  nowStr
      };
    }
    var metodeBayar = String(payload.metode_bayar || '');
    var bayar       = null;
    if (metodeBayar === 'TRANSFER') {
      bayar = {
        qris_file_id:   getSetting('QRIS_FILE_ID'),
        rekening_bank:  getSetting('REKENING_BANK'),
        rekening_nomor: getSetting('REKENING_NOMOR'),
        rekening_nama:  getSetting('REKENING_NAMA')
      };
    }
    var responseData = {
        order_id:     orderId,
        subtotal:     subtotal,
        ongkir:       ongkir,
        ongkir_sebelum_promo: ongkirSebelumPromo,
        promo_code: promoResult.promo_code,
        promo_nama: promoResult.promo_nama,
        promo_diskon_subtotal: promoResult.diskon_subtotal,
        promo_diskon_produk: promoResult.diskon_produk,
        promo_diskon_ongkir: promoResult.diskon_ongkir,
        promo_diskon_total: promoResult.diskon_total,
        promo_catatan_customer: promoResult.catatan_customer,
        poin_dipakai: poinDipakai,
        poin_earn_dasar: promoResult.poin_earn_dasar,
        promo_bonus_poin: promoResult.bonus_poin,
        promo_multiplier_poin: promoResult.multiplier_poin,
        poin_earn_final: promoResult.poin_earn_final,
        total:        total,
        metode_bayar: metodeBayar,
        status:       'MENUNGGU',
        bayar:        bayar,
        wa_toko:      getSetting('NOMOR_WA_TOKO')
    };
    var commitSnapshot = {
      version: 1,
      order: orderObj,
      order_items: orderItemRows,
      addon_rows: addonRows,
      promo_usage: promoUsageExpected,
      point_ledger: pointLedgerExpected,
      saldo_poin_sebelum: saldoPoinLama,
      saldo_poin_sesudah: saldoAkhir,
      expected_item_count: orderItemRows.length,
      expected_addon_count: addonRows.length,
      response: responseData,
      notification_items: lineItems
    };
    orderObj.commit_snapshot_json = JSON.stringify(commitSnapshot);
    var parentWrite;
    try { parentWrite = appendRowsObj('Orders', [orderObj]); }
    catch (_) {
      var parentExists = _orderFindByRequestId(readAll('Orders'), member.member_id, requestId);
      return parentExists ? _orderMarkRecoveryRequired(orderId, 'PARENT_CREATED', 'ORDER_PARENT_WRITE_UNCERTAIN') : { ok: false, code: 'INTERNAL', error: 'Gagal membuat pesanan' };
    }
    if (parentWrite.written !== 1) return _orderMarkRecoveryRequired(orderId, 'PARENT_CREATED', 'ORDER_PARENT_WRITE_COUNT');
    try { _orderFailpoint('PARENT_CREATED'); } catch (_) { return _orderMarkRecoveryRequired(orderId, 'PARENT_CREATED', 'ORDER_COMMIT_FAILED'); }
    return _orderCommitSnapshot(commitSnapshot, orderObj);

  }); // end withLock
  if (lockResult && lockResult._alert) _orderSafeAdminAlert(lockResult._alert);
  if (lockResult && lockResult.ok && lockResult._notification && lockResult._new_commit) {
    try {
      _notifyAdminNewOrder(lockResult._notification.order, lockResult._notification.items);
    } catch (notifyErr) {
      try { safeLog('ERROR', 'ORDER_NOTIFICATION_FAILED', lockResult.data.order_id, { function: 'orderCreateOrder', stage: 'telegram', order_id: lockResult.data.order_id }); } catch (_) {}
    }
  }
  if (lockResult) {
    delete lockResult._notification;
    delete lockResult._new_commit;
    delete lockResult._alert;
  }
  return lockResult;
}

/** Lookup read-only hasil checkout berdasarkan key milik session. */
function orderGetByRequestId(payload, token) {
  var member = requireSession(token);
  if (!member) return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid atau kedaluwarsa' };
  var requestId = _orderNormalizeRequestId((payload || {}).client_request_id);
  if (!requestId) return { ok: false, code: 'BAD_REQUEST', error: 'client_request_id tidak valid' };
  var order = _orderFindByRequestId(readAll('Orders'), member.member_id, requestId);
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND', error: 'Pesanan belum ditemukan' };
  var status = String(order.commit_status || '').trim().toUpperCase();
  if (status === 'COMMITTED') return _orderResponseFromExisting(order);
  if (status === 'CREATING') return { ok: false, code: 'ORDER_STILL_PROCESSING', error: 'Pesanan masih diproses' };
  return { ok: false, code: 'ORDER_RECOVERY_REQUIRED', error: 'Pesanan memerlukan pemeriksaan admin' };
}

// ============================================================
// 3. orderUpdateStatus(orderId, newStatus, actorChatId)
// ============================================================
/**
 * Update status order dan tambah poin jika SELESAI.
 * Validasi transisi dan idempotency penambahan poin.
 *
 * @param  {string} orderId
 * @param  {string} newStatus
 * @param  {string} actorChatId
 * @return {Object}
 */
function orderUpdateStatus(orderId, newStatus, actorChatId, cancelReason) {
  orderId = transactionNormalizeOrderId(orderId);
  newStatus = String(newStatus == null ? '' : newStatus).trim().toUpperCase();
  actorChatId = String(actorChatId == null ? '' : actorChatId).trim();
  if (!orderId || ['MENUNGGU','DIPROSES','SIAP','DIANTAR','SELESAI','BATAL'].indexOf(newStatus) === -1) return { ok: false, code: 'BAD_REQUEST', error: 'Input status tidak valid' };
  if (!actorChatId || typeof isAdmin !== 'function' || !isAdmin(actorChatId)) return { ok: false, code: 'UNAUTHORIZED_ACTOR', error: 'Aktor tidak berwenang' };
  var safeReason = transactionSafeText(cancelReason || 'Dibatalkan oleh admin', 300);
  if (newStatus === 'BATAL' && safeReason === null) return { ok: false, code: 'CANCEL_REASON_INVALID', error: 'Alasan pembatalan tidak valid' };

  return withLock(function () {
    if (!isAdmin(actorChatId)) return { ok: false, code: 'UNAUTHORIZED_ACTOR', error: 'Aktor tidak berwenang' };
    var allOrders = readAll('Orders');
    var order = null;
    for (var i = 0; i < allOrders.length; i++) {
      if (String(allOrders[i].order_id) === String(orderId) && isOrderCommittedRow(allOrders[i])) {
        order = allOrders[i];
        break;
      }
    }
    if (!order) return { ok: false, code: 'ORDER_NOT_FOUND', error: 'Order tidak ditemukan' };

    var oldStatus = String(order.status || '').trim().toUpperCase();
    if (oldStatus === newStatus) return { ok: true, data: { order: order, unchanged: true, poin_ditambah: 0 } };
    if (oldStatus === 'SELESAI' || oldStatus === 'BATAL') return { ok: false, code: 'STATUS_FINAL', error: 'Order sudah final' };
    var allowed = {
      MENUNGGU: { DIPROSES: true, BATAL: true },
      DIPROSES: { SIAP: true, BATAL: true },
      SIAP: { SELESAI: true, BATAL: true, DIANTAR: true },
      DIANTAR: { SELESAI: true, BATAL: true }
    };
    if (!allowed[oldStatus] || !allowed[oldStatus][newStatus]) return { ok: false, code: 'TRANSISI_TIDAK_VALID', error: 'Transisi ' + oldStatus + ' ke ' + newStatus + ' tidak valid' };
    var metode = String(order.metode_kirim || '').trim().toUpperCase();
    if (newStatus === 'DIANTAR' && metode !== 'DIANTAR') return { ok: false, code: 'TRANSISI_METODE_TIDAK_VALID', error: 'Status DIANTAR hanya untuk pengantaran internal' };

    var now = new Date();
    var nowStr = nowJkt();
    
    var timeline = [];
    try { timeline = JSON.parse(order.timeline_json); } catch (e) {}
    timeline.push({ status: newStatus, at: nowStr, by: actorChatId });
    
    var updateData = {
      status: newStatus,
      updated_at: nowStr,
      status_updated_at: nowStr,
      timeline_json: JSON.stringify(timeline)
    };
    
    var snapshot = null;
    var transactionState = String(order.transaction_status || '').trim().toUpperCase();
    if ((transactionState === 'PENDING' || transactionState === 'RECOVERY_REQUIRED') && String(order.transaction_snapshot_json || '').trim()) {
      try { snapshot = JSON.parse(order.transaction_snapshot_json); } catch (_) { return { ok: false, code: 'ORDER_TRANSACTION_SNAPSHOT_INVALID', error: 'Snapshot transaksi tidak valid' }; }
      if (String(snapshot.target_status) !== newStatus || String(snapshot.source_status) !== oldStatus) return { ok: false, code: 'ORDER_TRANSACTION_CONFLICT', error: 'Order memiliki transaksi tertunda yang berbeda' };
    }
    var members = readAll('Members');
    var member = null;
    for (var mi = 0; mi < members.length; mi++) if (String(members[mi].member_id) === String(order.member_id)) member = members[mi];
    if (!member) return { ok: false, code: 'MEMBER_NOT_FOUND', error: 'Member tidak ditemukan' };
    if (!snapshot) {
      var pointBalance = transactionStrictInteger(member.total_poin, 0, 1000000000);
      var spendBalance = transactionStrictInteger(member.total_belanja || 0, 0, 1000000000000);
      var orderPointUsed = transactionStrictInteger(order.poin_dipakai || 0, 0, 1000000000);
      var orderTotal = transactionStrictInteger(order.total || 0, 0, 1000000000000);
      if (pointBalance === null || spendBalance === null || orderPointUsed === null || orderTotal === null) return { ok: false, code: 'MEMBER_BALANCE_INVALID', error: 'Nilai transaksi tidak valid' };
      snapshot = { version: 1, order_id: orderId, member_id: String(order.member_id), source_status: oldStatus,
        target_status: newStatus, actor: actorChatId, at: nowStr, cancel_reason: newStatus === 'BATAL' ? safeReason : '',
        point_before: pointBalance, point_after: pointBalance + (newStatus === 'BATAL' ? orderPointUsed : 0),
        spend_before: spendBalance, spend_after: spendBalance + (newStatus === 'SELESAI' ? orderTotal : 0) };
      if (!updateRowById('Orders', 'order_id', orderId, { transaction_status: 'PENDING', transaction_stage: 'SNAPSHOT_WRITTEN', transaction_error_code: '', transaction_snapshot_json: JSON.stringify(snapshot) })) return { ok: false, code: 'ORDER_TRANSACTION_WRITE_FAILED', error: 'Transaksi tidak dapat dimulai' };
      try { _orderStatusFailpoint('SNAPSHOT_WRITTEN'); } catch (_) { return _orderStatusRecovery(orderId, 'SNAPSHOT_WRITTEN', 'ORDER_STATUS_FAILPOINT'); }
    }
    var poin_ditambah = 0;

    if (newStatus === 'BATAL') {
      var poinDipakai = Number(order.poin_dipakai) || 0;
      if (poinDipakai > 0) {
        var histories = readAll('PointHistory');
        var legacyAmbiguous = false;
        for (var j = 0; j < histories.length; j++) {
          if (String(histories[j].order_id) === String(orderId) && String(histories[j].tipe).toUpperCase() === 'KOREKSI' && String(histories[j].id) !== 'PTH_ORDER_REFUND_' + orderId) legacyAmbiguous = true;
        }
        if (legacyAmbiguous) return _orderStatusRecovery(orderId, 'REFUND_REDEEM', 'POINT_LEGACY_AMBIGUOUS');
        var refund = pointEnsureBalanceEvent({ id: 'PTH_ORDER_REFUND_' + orderId, member_id: order.member_id, order_id: orderId,
          tipe: 'KOREKSI', jumlah: poinDipakai, saldo_sebelum: snapshot.point_before, saldo_akhir: snapshot.point_after,
          event_code: 'ORDER_REDEEM_REFUNDED', keterangan: 'Pengembalian poin order batal ' + orderId, created_at: snapshot.at });
        if (!refund.ok) return _orderStatusRecovery(orderId, 'REFUND_REDEEM', refund.code);
        try { _orderStatusFailpoint('REFUND_REDEEM'); } catch (_) { return _orderStatusRecovery(orderId, 'REFUND_REDEEM', 'ORDER_STATUS_FAILPOINT'); }
      }
      if (String(order.promo_id || '').trim()) {
        var promoRefund = _promoRefundUsageByOrder(orderId, snapshot.at);
        if (!promoRefund.ok) return _orderStatusRecovery(orderId, 'PROMO_CANCEL', promoRefund.code);
        try { _orderStatusFailpoint('PROMO_CANCEL'); } catch (_) { return _orderStatusRecovery(orderId, 'PROMO_CANCEL', 'ORDER_STATUS_FAILPOINT'); }
      }
      updateData.cancelled_at = snapshot.at;
      updateData.cancelled_by = actorChatId;
      updateData.cancel_reason = safeReason;
    }
    if (newStatus === 'SELESAI') {
      var currentSpend = transactionStrictInteger(member.total_belanja || 0, 0, 1000000000000);
      if (currentSpend === snapshot.spend_before) {
        if (!updateRowById('Members', 'member_id', member.member_id, { total_belanja: snapshot.spend_after })) return _orderStatusRecovery(orderId, 'TOTAL_BELANJA', 'MEMBER_SPEND_WRITE_FAILED');
      } else if (currentSpend !== snapshot.spend_after) return _orderStatusRecovery(orderId, 'TOTAL_BELANJA', 'MEMBER_SPEND_CONFLICT');
      try { _orderStatusFailpoint('TOTAL_BELANJA'); } catch (_) { return _orderStatusRecovery(orderId, 'TOTAL_BELANJA', 'ORDER_STATUS_FAILPOINT'); }
    }
    updateData.transaction_status = 'APPLIED';
    updateData.transaction_stage = 'ORDER_UPDATED';
    updateData.transaction_error_code = '';
    try { _orderStatusFailpoint('ORDER_UPDATED'); } catch (_) { return _orderStatusRecovery(orderId, 'ORDER_UPDATED', 'ORDER_STATUS_FAILPOINT'); }
    if (!updateRowById('Orders', 'order_id', orderId, updateData)) return _orderStatusRecovery(orderId, 'ORDER_UPDATED', 'ORDER_STATUS_WRITE_FAILED');
    order.status = newStatus; // update obyek lokal untuk return
    
    if (newStatus === 'SELESAI') {
      return { ok: true, data: { order: order, poin_ditambah: poin_ditambah } };
    }
    return { ok: true, data: { order: order } };
  });
}

function _orderStatusRecovery(orderId, stage, code) {
  updateRowById('Orders', 'order_id', orderId, { transaction_status: 'RECOVERY_REQUIRED', transaction_stage: stage, transaction_error_code: code });
  return { ok: false, code: 'ORDER_TRANSACTION_RECOVERY_REQUIRED', error: 'Transaksi order memerlukan rekonsiliasi', detail_code: code };
}

function _orderStatusFailpoint(stage) {
  if (typeof ORDER_STATUS_TEST_FAIL_STAGE !== 'undefined' && String(ORDER_STATUS_TEST_FAIL_STAGE) === String(stage)) throw new Error('ORDER_STATUS_FAILPOINT_' + stage);
}

/**
 * Mengambil daftar 20 pesanan terakhir milik member.
 */
function orderGetMyOrders(payload, token) {
  var session = requireSession(token);
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  var memberId = session.member_id;

  // Baca sheet Orders
  var allOrders = readAll('Orders');
  var userOrders = [];
  for (var i = 0; i < allOrders.length; i++) {
    if (isOrderCommittedRow(allOrders[i]) && allOrders[i].member_id === memberId) {
      userOrders.push(allOrders[i]);
    }
  }

  // Sort by created_at DESC (terbaru dulu)
  userOrders.sort(function(a, b) {
    var da = new Date(a.created_at).getTime();
    var db = new Date(b.created_at).getTime();
    return db - da;
  });

  // Batasi 20 order
  userOrders = userOrders.slice(0, 20);

  if (userOrders.length === 0) {
    return { ok: true, data: { orders: [] } };
  }

  var orderIds = userOrders.map(function(row) { return row.order_id; });

  // Baca add-on sekali, lalu kelompokkan berdasarkan order_item_ref.
  var allAddons = readAll('OrderItemAddons');
  var addonsByRef = {};
  for (var a = 0; a < allAddons.length; a++) {
    var addonOrderId = allAddons[a].order_id;
    if (orderIds.indexOf(addonOrderId) !== -1) {
      var addonRef = String(allAddons[a].order_item_ref || '');
      if (!addonRef) continue;
      var addonKey = '$' + addonRef;
      if (!addonsByRef[addonKey]) addonsByRef[addonKey] = [];
      addonsByRef[addonKey].push({
        addon_id: String(allAddons[a].addon_id || ''),
        nama_addon_snapshot: String(allAddons[a].nama_addon_snapshot || ''),
        harga_snapshot: allAddons[a].harga_snapshot
      });
    }
  }

  // Baca sheet OrderItems
  var allItems = readAll('OrderItems');
  var itemsByOrderId = {};
  for (var k = 0; k < allItems.length; k++) {
    var oid = allItems[k].order_id;
    if (orderIds.indexOf(oid) !== -1) {
      if (!itemsByOrderId[oid]) itemsByOrderId[oid] = [];
      var itemRef = String(allItems[k].order_item_ref || '');
      itemsByOrderId[oid].push({
        order_item_ref: itemRef,
        variant_id: String(allItems[k].variant_id || ''),
        variant_nama_snapshot: String(allItems[k].variant_nama_snapshot || ''),
        nama_axis_snapshot: String(allItems[k].nama_axis_snapshot || ''),
        nama_snapshot: String(allItems[k].nama_snapshot || ''),
        harga_snapshot: allItems[k].harga_snapshot,
        qty: allItems[k].qty,
        subtotal: allItems[k].subtotal,
        addons: addonsByRef['$' + itemRef] || []
      });
    }
  }

  // Baca sheet Reviews
  var allReviews = readAll('Reviews');
  var reviewsByOrderId = {};
  for (var r = 0; r < allReviews.length; r++) {
    var rev = allReviews[r];
    if (String(rev.status) !== 'expired' && orderIds.indexOf(rev.order_id) !== -1) {
      reviewsByOrderId[rev.order_id] = {
        rating: rev.rating,
        ulasan: rev.ulasan,
        status: rev.status
      };
    }
  }

  var resultOrders = [];
  for (var j = 0; j < userOrders.length; j++) {
    var row = userOrders[j];
    var oid = row.order_id;

    var timeline = [];
    try { if (row.timeline_json) timeline = JSON.parse(row.timeline_json); } catch(e) { timeline = []; }

    var namaPemesan = String(row.nama || '');
    var noHpPemesan = String(row.no_hp || '');
    var namaPenerima = String(row.nama_penerima || '');
    var noHpPenerima = String(row.no_hp_penerima || '');
    
    // Fallback untuk order lama yang kolom penerima-nya kosong
    if (!namaPenerima) namaPenerima = namaPemesan;
    if (!noHpPenerima) noHpPenerima = noHpPemesan;

    resultOrders.push({
      order_id: oid,
      tgl_antar: row.tgl_antar,
      metode_kirim: row.metode_kirim,
      metode_bayar: row.metode_bayar,
      status: row.status,
      subtotal: row.subtotal,
      ongkir: row.ongkir,
      ongkir_sebelum_promo: row.ongkir_sebelum_promo,
      promo_id: String(row.promo_id || ''),
      promo_code: String(row.promo_code || ''),
      promo_nama: String(row.promo_nama || ''),
      promo_diskon_subtotal: Number(row.promo_diskon_subtotal) || 0,
      promo_diskon_produk: Number(row.promo_diskon_produk) || 0,
      promo_diskon_ongkir: Number(row.promo_diskon_ongkir) || 0,
      promo_diskon_total: Number(row.promo_diskon_total) || 0,
      promo_bonus_poin: Number(row.promo_bonus_poin) || 0,
      promo_multiplier_poin: Number(row.promo_multiplier_poin) || 1,
      poin_earn_dasar: Number(row.poin_earn_dasar) || 0,
      poin_earn_final: Number(row.poin_earn_final) || 0,
      poin_dipakai: row.poin_dipakai,
      total: row.total,
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
      status_updated_at: _orderSeenTimestampString(row.status_updated_at),
      timeline: timeline,
      alamat_snapshot: row.alamat_snapshot,
      lokasi_pickup_id: row.lokasi_pickup_id,
      catatan_customer: row.catatan_customer,
      nama: namaPemesan,
      no_hp: noHpPemesan,
      nama_penerima: namaPenerima,
      no_hp_penerima: noHpPenerima,
      items: itemsByOrderId[oid] || [],
      review: reviewsByOrderId[oid] || null
    });
  }

  return { ok: true, data: { orders: resultOrders } };
}

// ============================================================
// 5. orderMarkSeen(payload, token)
// ============================================================
/**
 * Tandai semua update status order milik member sebagai sudah dilihat.
 * Timestamp server dikembalikan agar state frontend lintas device konsisten.
 */
function orderMarkSeen(payload, token) {
  var session = requireSession(token);
  if (!session) return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid' };

  var seenAt = nowJkt();
  var lockResult = withLock(function () {
    var updated = updateRowById('Members', 'member_id', session.member_id, {
      last_seen_orders_at: seenAt
    });
    if (!updated) {
      return { ok: false, code: 'MEMBER_NOT_FOUND', error: 'Member tidak ditemukan' };
    }
    return { ok: true };
  });

  if (!lockResult.ok) return lockResult;
  return { ok: true, data: { last_seen_orders_at: String(seenAt) } };
}
