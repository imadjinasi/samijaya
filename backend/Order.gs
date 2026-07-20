/**
 * Order.gs — Samijaya MVP
 *
 * Fase 4c: API order.
 * Fungsi publik: orderGetSlotAvailability, orderCreateOrder.
 * Semua operasi tulis (Orders, OrderItems, PointHistory, Members) dalam withLock().
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
 */
function _notifyAdminNewOrder(orderObj) {
  // Susun ringkasan items
  var itemsText = '';
  try {
    var orderItems = readAll('OrderItems');
    for (var i = 0; i < orderItems.length; i++) {
      if (String(orderItems[i].order_id) === String(orderObj.order_id)) {
        itemsText += '  • ' + orderItems[i].nama_snapshot
          + ' x' + orderItems[i].qty
          + ' (Rp' + Number(orderItems[i].subtotal).toLocaleString('id') + ')\n';
      }
    }
  } catch (e) {
    itemsText = '  (gagal baca items)\n';
  }

  // Format metode kirim
  var metodeInfo = String(orderObj.metode_kirim);
  if (orderObj.alamat_snapshot) {
    metodeInfo += ' — ' + orderObj.alamat_snapshot;
  }

  // Tgl antar + catatan
  var tglAntar = String(orderObj.tgl_antar || '');
  var catatan  = String(orderObj.catatan_customer || '-');

  var pesan = '🛒 <b>Order Baru!</b>\n\n'
    + '📋 ID: <code>' + orderObj.order_id + '</code>\n'
    + '👤 Nama: ' + orderObj.nama + '\n'
    + '📞 No HP: ' + orderObj.no_hp + '\n'
    + '📦 Metode: ' + metodeInfo + '\n'
    + '📅 Tgl Antar: ' + tglAntar + '\n'
    + '💳 Bayar: ' + orderObj.metode_bayar + '\n\n'
    + '<b>Items:</b>\n' + (itemsText || '  (kosong)\n')
    + '\n💰 Subtotal: Rp' + Number(orderObj.subtotal).toLocaleString('id')
    + '\n🚚 Ongkir: Rp' + Number(orderObj.ongkir || 0).toLocaleString('id')
    + '\n🎁 Poin: -Rp' + Number(orderObj.poin_dipakai || 0).toLocaleString('id')
    + '\n<b>Total: Rp' + Number(orderObj.total).toLocaleString('id') + '</b>\n\n'
    + '📝 Catatan: ' + catatan;

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

  log('NOTIF', orderObj.order_id, 'Notif order baru dikirim ke admin Telegram', {
    member_id:    orderObj.member_id,
    nama:         orderObj.nama,
    total:        orderObj.total,
    metode_kirim: orderObj.metode_kirim,
    metode_bayar: orderObj.metode_bayar,
    status:       orderObj.status
  });
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

      if (ordTgl === tanggal &&
          String(ord.slot_id) === slotId &&
          String(ord.status)  !== 'BATAL') {
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
 * Buat order baru. Seluruh proses (validasi → tulis → poin → notif) dalam withLock().
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
 *   items: [{ product_id, qty }],
 *   catatan_customer
 * }
 *
 * @param  {Object} payload
 * @param  {string} token
 * @return {Object}
 */
function orderCreateOrder(payload, token) {
  return withLock(function () {

    // ----------------------------------------------------------
    // 1. Validasi sesi
    // ----------------------------------------------------------
    var member = requireSession(token);
    if (!member) {
      return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid atau kedaluwarsa' };
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

      var harga        = Number(prod.harga);  // harga dari sheet
      var subtotalItem = harga * qty;
      subtotal += subtotalItem;

      lineItems.push({
        product_id:     pid,
        nama_snapshot:  String(prod.nama),
        harga_snapshot: harga,
        qty:            qty,
        subtotal:       subtotalItem
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

    var allOrders = readAll('Orders'); // satu baca, dipakai ulang di bawah

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
      // Validasi koordinat tujuan — jangan pakai !lat karena 0 falsy
      var latRaw = payload.lat;
      var lngRaw = payload.lng;
      if (latRaw === undefined || latRaw === null || latRaw === '' ||
          lngRaw === undefined || lngRaw === null || lngRaw === '') {
        return { ok: false, code: 'BAD_REQUEST', error: 'lat dan lng wajib untuk metode DIANTAR' };
      }
      var latTujuan = Number(latRaw);
      var lngTujuan = Number(lngRaw);
      if (isNaN(latTujuan) || isNaN(lngTujuan)) {
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
        if (ordTgl === tglAntar &&
            String(ord.slot_id) === slotId &&
            String(ord.status)  !== 'BATAL') {
          terpakai++;
        }
      }
      if (terpakai >= Number(slotObj.kuota)) {
        return { ok: false, code: 'SLOT_PENUH', error: 'Slot pengiriman untuk tanggal ini sudah penuh' };
      }

      alamatSnapshot = String(payload.alamat_snapshot || '').trim();

    } else {
      return {
        ok: false,
        code: 'BAD_REQUEST',
        error: 'metode_kirim tidak valid. Gunakan AMBIL, OJOL, atau DIANTAR'
      };
    }

    // ----------------------------------------------------------
    // 7. Hitung poin
    //    subtotal = harga produk saja (TIDAK termasuk ongkir)
    //    total    = subtotal + ongkir − poin_dipakai
    // ----------------------------------------------------------
    var totalSebelumPoin = subtotal + ongkir;
    var poinDipakai      = 0;
    var saldoPoinLama    = Number(member.total_poin) || 0;

    if (payload.pakai_poin === true || String(payload.pakai_poin) === 'true') {
      var minRedeem = Number(getSetting('POINT_MIN_REDEEM')) || 0;
      if (saldoPoinLama > 0 && saldoPoinLama >= minRedeem) {
        // 1 poin = Rp1, total tidak boleh < 0
        poinDipakai = Math.min(saldoPoinLama, totalSebelumPoin);
      }
      // Kalau saldo < minRedeem → abaikan, poinDipakai tetap 0, JANGAN error
    }

    var total = totalSebelumPoin - poinDipakai;

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
      slot_id:          slotId,
      subtotal:         subtotal,         // harga produk saja, TIDAK termasuk ongkir
      poin_dipakai:     poinDipakai,
      total:            total,            // subtotal + ongkir − poin_dipakai
      metode_bayar:     String(payload.metode_bayar || ''),
      status:           'MENUNGGU',
      catatan_customer: catatanFinal,
      catatan_admin:    '',
      created_at:       nowStr,
      updated_at:       nowStr,
      timeline_json:    timeline
    };
    appendRowObj('Orders', orderObj);

    // b. OrderItems — satu baris per item
    for (var i = 0; i < lineItems.length; i++) {
      appendRowObj('OrderItems', {
        order_id:       orderId,
        product_id:     lineItems[i].product_id,
        nama_snapshot:  lineItems[i].nama_snapshot,
        harga_snapshot: lineItems[i].harga_snapshot,
        qty:            lineItems[i].qty,
        subtotal:       lineItems[i].subtotal
      });
    }

    // c. Poin — tulis PointHistory & update Members.total_poin (hanya jika poin dipakai)
    //    Poin PENAMBAHAN dari order ini TIDAK sekarang — hanya saat status SELESAI (Fase 5)
    if (poinDipakai > 0) {
      var saldoAkhir = saldoPoinLama - poinDipakai;
      if (saldoAkhir < 0) {
        log('ERROR', 'GUARD_POIN', 'Guard poin minus dicegah di checkout', { member_id: member.member_id, saldo: saldoPoinLama, pakai: poinDipakai });
        return { ok: false, code: 'POIN_TIDAK_CUKUP', error: 'Saldo poin tidak mencukupi' };
      }
      appendRowObj('PointHistory', {
        id:          genId('PTH'),
        member_id:   member.member_id,
        order_id:    orderId,
        tipe:        'PAKAI',
        jumlah:      -poinDipakai,
        saldo_akhir: saldoAkhir,
        keterangan:  'Redeem order ' + orderId,
        created_at:  nowStr
      });
      updateRowById('Members', 'member_id', member.member_id, {
        total_poin: saldoAkhir
      });
    }

    // ----------------------------------------------------------
    // 11. Notifikasi admin (placeholder)
    // ----------------------------------------------------------
    _notifyAdminNewOrder(orderObj);

    // ----------------------------------------------------------
    // 12. Return response
    //    bayar: info pembayaran untuk frontend (TRANSFER → isi, selainnya → null)
    //    wa_toko: selalu disertakan (untuk tombol kirim bukti transfer via WA)
    // ----------------------------------------------------------
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

    return {
      ok: true,
      data: {
        order_id:     orderId,
        subtotal:     subtotal,
        ongkir:       ongkir,
        poin_dipakai: poinDipakai,
        total:        total,
        metode_bayar: metodeBayar,
        status:       'MENUNGGU',
        bayar:        bayar,
        wa_toko:      getSetting('NOMOR_WA_TOKO')
      }
    };

  }); // end withLock
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
function orderUpdateStatus(orderId, newStatus, actorChatId) {
  return withLock(function () {
    var allOrders = readAll('Orders');
    var order = null;
    for (var i = 0; i < allOrders.length; i++) {
      if (String(allOrders[i].order_id) === String(orderId)) {
        order = allOrders[i];
        break;
      }
    }
    if (!order) return { ok: false, code: 'ORDER_NOT_FOUND', error: 'Order tidak ditemukan' };

    var oldStatus = String(order.status);
    
    // Validasi transisi
    var valid = false;
    if (oldStatus === 'SELESAI' || oldStatus === 'BATAL') {
      return { ok: false, code: 'STATUS_FINAL', error: 'Order sudah final' };
    }
    
    if (oldStatus === 'MENUNGGU' && (newStatus === 'DIPROSES' || newStatus === 'BATAL')) valid = true;
    else if (oldStatus === 'DIPROSES' && (newStatus === 'SIAP' || newStatus === 'BATAL')) valid = true;
    else if (oldStatus === 'SIAP' && (newStatus === 'SELESAI' || newStatus === 'BATAL')) valid = true;
    
    if (!valid) return { ok: false, code: 'TRANSISI_TIDAK_VALID', error: 'Transisi ' + oldStatus + ' ke ' + newStatus + ' tidak valid' };

    var now = new Date();
    var nowStr = nowJkt();
    
    var timeline = [];
    try { timeline = JSON.parse(order.timeline_json); } catch (e) {}
    timeline.push({ status: newStatus, at: nowStr, by: actorChatId });
    
    var updateData = {
      status: newStatus,
      updated_at: nowStr,
      timeline_json: JSON.stringify(timeline)
    };
    
    var poin_ditambah = 0;
    
    if (newStatus === 'BATAL') {
      var poinDipakai = Number(order.poin_dipakai) || 0;
      if (poinDipakai > 0) {
        var histories = readAll('PointHistory');
        var alreadyRefunded = false;
        for (var j = 0; j < histories.length; j++) {
          if (String(histories[j].order_id) === String(orderId) && String(histories[j].tipe) === 'KOREKSI') {
            alreadyRefunded = true;
            break;
          }
        }
        
        if (!alreadyRefunded) {
          var allMembers = readAll('Members');
          var member = null;
          for (var m = 0; m < allMembers.length; m++) {
            if (String(allMembers[m].member_id) === String(order.member_id)) {
              member = allMembers[m];
              break;
            }
          }
          
          if (member) {
            var saldoBaru = (Number(member.total_poin) || 0) + poinDipakai;
            
            updateRowById('Members', 'member_id', member.member_id, {
              total_poin: saldoBaru
            });
            
            appendRowObj('PointHistory', {
              id: genId('PTH'),
              member_id: member.member_id,
              order_id: orderId,
              tipe: 'KOREKSI',
              jumlah: poinDipakai,
              saldo_akhir: saldoBaru,
              keterangan: 'Pengembalian poin dari order ' + orderId + ' batal',
              created_at: nowStr
            });
          }
        }
      }
    }
    
    if (newStatus === 'SELESAI') {
      var total = Number(order.total) || 0;
      var allMembers = readAll('Members');
      var member = null;
      for (var m = 0; m < allMembers.length; m++) {
        if (String(allMembers[m].member_id) === String(order.member_id)) {
          member = allMembers[m];
          break;
        }
      }
      
      if (member) {
        var totalBelanjaBaru = (Number(member.total_belanja) || 0) + total;
        updateRowById('Members', 'member_id', member.member_id, {
          total_belanja: totalBelanjaBaru
        });
      }
      // Poin tidak ditambah di sini. Diberikan saat customer submit ulasan (max 7 hari).
    }
    
    updateRowById('Orders', 'order_id', orderId, updateData);
    order.status = newStatus; // update obyek lokal untuk return
    
    if (newStatus === 'SELESAI') {
      return { ok: true, data: { order: order, poin_ditambah: poin_ditambah } };
    }
    return { ok: true, data: { order: order } };
  });
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
    if (allOrders[i].member_id === memberId) {
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

  // Baca sheet OrderItems
  var allItems = readAll('OrderItems');
  var itemsByOrderId = {};
  for (var k = 0; k < allItems.length; k++) {
    var oid = allItems[k].order_id;
    if (orderIds.indexOf(oid) !== -1) {
      if (!itemsByOrderId[oid]) itemsByOrderId[oid] = [];
      itemsByOrderId[oid].push({
        nama_snapshot: allItems[k].nama_snapshot,
        harga_snapshot: allItems[k].harga_snapshot,
        qty: allItems[k].qty,
        subtotal: allItems[k].subtotal
      });
    }
  }

  // Baca sheet Reviews
  var allReviews = readAll('Reviews');
  var reviewsByOrderId = {};
  for (var r = 0; r < allReviews.length; r++) {
    var rev = allReviews[r];
    if (String(rev.status) === 'aktif' && orderIds.indexOf(rev.order_id) !== -1) {
      reviewsByOrderId[rev.order_id] = {
        rating: rev.rating,
        ulasan: rev.ulasan
      };
    }
  }

  var resultOrders = [];
  for (var j = 0; j < userOrders.length; j++) {
    var row = userOrders[j];
    var oid = row.order_id;

    var timeline = [];
    try { if (row.timeline_json) timeline = JSON.parse(row.timeline_json); } catch(e) { timeline = []; }

    resultOrders.push({
      order_id: oid,
      tgl_antar: row.tgl_antar,
      metode_kirim: row.metode_kirim,
      metode_bayar: row.metode_bayar,
      status: row.status,
      subtotal: row.subtotal,
      ongkir: row.ongkir,
      poin_dipakai: row.poin_dipakai,
      total: row.total,
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
      timeline: timeline,
      alamat_snapshot: row.alamat_snapshot,
      lokasi_pickup_id: row.lokasi_pickup_id,
      catatan_customer: row.catatan_customer,
      items: itemsByOrderId[oid] || [],
      review: reviewsByOrderId[oid] || null
    });
  }

  return { ok: true, data: { orders: resultOrders } };
}
