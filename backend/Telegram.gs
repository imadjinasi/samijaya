/**
 * Telegram.gs — Samijaya MVP
 *
 * Fase 5A: Fondasi Telegram bot.
 * Helper: tgApi, tgSend, tgSendToAdmins, isAdmin, waLink, fillTemplate.
 * Webhook: setWebhook, deleteWebhook.
 * Handler: handleTelegramWebhook (commands + callback_query stub).
 * Tidak ada dependency eksternal.
 */

// ============================================================
// WEBHOOK URL — WAJIB DIISI MANUAL
// ============================================================
// ISI dengan URL /exec deployment Web App Anda.
// Contoh: "https://script.google.com/macros/s/ABCDEF.../exec"
// Setelah diisi, save, lalu run setWebhook() dari editor.
var WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxwvjM6cZLD5OIbj7-huIkdonJNfQP8efvkTXGp1dIdmpNBjrAxgLDHPs3C9kPrtEMc/exec';

// ============================================================
// 1. tgApi(method, payload)
// ============================================================
/**
 * POST ke Telegram Bot API.
 * https://api.telegram.org/bot<TOKEN>/<method>
 *
 * @param  {string} method  — method Telegram API (e.g. "sendMessage")
 * @param  {Object} payload — body JSON
 * @return {Object} parsed JSON response dari Telegram
 */
function tgApi(method, payload) {
  var token = getSetting('TELEGRAM_BOT_TOKEN');
  var url = 'https://api.telegram.org/bot' + token + '/' + method;

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(url, options);
  var result = JSON.parse(resp.getContentText());

  if (!result.ok) {
    log('ERROR', 'tgApi', 'Telegram API error: ' + method, {
      method: method,
      payload: payload,
      response: result
    });
  }

  return result;
}

// ============================================================
// 2. tgSend(chatId, text, opts)
// ============================================================
/**
 * Kirim pesan via sendMessage, parse_mode HTML.
 *
 * @param  {string|number} chatId — chat ID tujuan
 * @param  {string}        text   — isi pesan (HTML)
 * @param  {Object}        opts   — opsional, bisa berisi reply_markup
 * @return {Object} hasil tgApi
 */
function tgSend(chatId, text, opts) {
  var payload = {
    chat_id: String(chatId),
    text: text,
    parse_mode: 'HTML'
  };

  if (opts && opts.reply_markup) {
    payload.reply_markup = opts.reply_markup;
  }

  return tgApi('sendMessage', payload);
}

// ============================================================
// 3. tgSendToAdmins(text, opts)
// ============================================================
/**
 * Kirim pesan ke SEMUA admin yang terdaftar di ADMIN_CHAT_IDS.
 *
 * @param {string} text — isi pesan
 * @param {Object} opts — opsional, bisa berisi reply_markup
 */
function tgSendToAdmins(text, opts) {
  var raw = getSetting('ADMIN_CHAT_IDS') || '';
  var ids = raw.split(',');
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i].trim();
    if (id) {
      tgSend(id, text, opts);
    }
  }
}

// ============================================================
// 4. isAdmin(chatId)
// ============================================================
/**
 * Cek apakah chatId terdaftar di ADMIN_CHAT_IDS.
 *
 * @param  {string|number} chatId
 * @return {boolean}
 */
function isAdmin(chatId) {
  var raw = getSetting('ADMIN_CHAT_IDS') || '';
  var ids = raw.split(',');
  var target = String(chatId).trim();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i].trim() === target) return true;
  }
  return false;
}

// ============================================================
// 5. waLink(nomor, pesan)
// ============================================================
/**
 * Generate link WhatsApp Click-to-Chat.
 * Nomor sudah format 62xxx.
 *
 * @param  {string} nomor — nomor HP format 62xxx
 * @param  {string} pesan — teks pesan
 * @return {string} URL wa.me
 */
function waLink(nomor, pesan) {
  return 'https://wa.me/' + nomor + '?text=' + encodeURIComponent(pesan);
}

// ============================================================
// 6. fillTemplate(kode, dataObj)
// ============================================================
/**
 * Baca template dari sheet MessageTemplates berdasarkan kode.
 * Ganti semua placeholder {KEY} dengan dataObj[KEY].
 * Fallback jika template tidak ditemukan.
 *
 * @param  {string} kode    — kode template (e.g. "OTP")
 * @param  {Object} dataObj — data untuk replace placeholder
 * @return {string} pesan hasil render
 */
function fillTemplate(kode, dataObj) {
  var rows = readAll('MessageTemplates');
  var template = null;

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].kode) === kode) {
      template = String(rows[i].isi);
      break;
    }
  }

  if (!template) {
    // Fallback sederhana
    var parts = [kode + ':'];
    for (var key in dataObj) {
      if (dataObj.hasOwnProperty(key)) {
        parts.push(key + '=' + dataObj[key]);
      }
    }
    return parts.join(' ');
  }

  // Replace semua {KEY} yang ada di dataObj
  for (var key in dataObj) {
    if (dataObj.hasOwnProperty(key)) {
      var placeholder = new RegExp('\\{' + key + '\\}', 'g');
      template = template.replace(placeholder, String(dataObj[key]));
    }
  }

  return template;
}

// ============================================================
// 7. setWebhook()
// ============================================================
/**
 * Set Telegram webhook ke URL Web App /exec.
 * Jalankan SEKALI dari editor setelah mengisi WEBHOOK_URL di atas.
 *
 * Cara pakai:
 * 1. Isi WEBHOOK_URL di atas file ini dengan URL /exec deployment.
 * 2. Save file (clasp push).
 * 3. Buka Apps Script editor → pilih fungsi setWebhook → Run.
 */
function setWebhook() {
  if (!WEBHOOK_URL) {
    Logger.log('ERROR: WEBHOOK_URL belum diisi. Isi konstanta WEBHOOK_URL di atas file Telegram.gs dengan URL /exec deployment, lalu run lagi.');
    return;
  }

  var secret = getSetting('TELEGRAM_SECRET');
  if (!secret) {
    Logger.log('ERROR: TELEGRAM_SECRET belum diisi di sheet Settings.');
    return;
  }

  var result = tgApi('setWebhook', {
    url: WEBHOOK_URL,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query']
  });

  Logger.log('setWebhook result: ' + JSON.stringify(result));
}

// ============================================================
// 8. deleteWebhook()
// ============================================================
/**
 * Hapus webhook Telegram. Jalankan dari editor jika perlu reset.
 */
function deleteWebhook() {
  var result = tgApi('deleteWebhook', {});
  Logger.log('deleteWebhook result: ' + JSON.stringify(result));
}

// ============================================================
// 9. handleTelegramWebhook(update)
// ============================================================
/**
 * Handler utama untuk update Telegram.
 * Dipanggil dari Router.gs setelah verifikasi secret.
 *
 * @param  {Object} update — Telegram update object
 * @return {Object} {ok:true} untuk response ke Telegram
 */
function handleTelegramWebhook(update) {
  try {
    // Idempotency sudah dijaga di Router.gs (cache update_id sebelum handler dipanggil).

    // --- Message ---
    if (update.message) {
      var message = update.message;
      var chatId  = String(message.chat.id);
      var text    = String(message.text || '').trim();

      // /myid — siapa pun boleh
      if (text === '/myid') {
        tgSend(chatId, 'Chat ID Anda: <code>' + chatId + '</code>');
        return { ok: true };
      }

      // /start
      if (text === '/start') {
        var greeting = '👋 Halo! Selamat datang di Bot Admin Samijaya.';
        if (isAdmin(chatId)) {
          greeting += '\n✅ Anda terdaftar sebagai admin.';
        } else {
          greeting += '\n🤖 Bot admin Samijaya.';
        }
        tgSend(chatId, greeting);
        return { ok: true };
      }

      // /login <password>
      if (text.indexOf('/login') === 0) {
        var parts    = text.split(/\s+/);
        var password = parts.length > 1 ? parts.slice(1).join(' ') : '';

        if (!password) {
          tgSend(chatId, '⚠️ Gunakan: /login &lt;password&gt;');
          return { ok: true };
        }

        // Cek apakah sudah admin
        if (isAdmin(chatId)) {
          tgSend(chatId, 'ℹ️ Anda sudah terdaftar sebagai admin.');
          return { ok: true };
        }

        // Hash password & bandingkan
        var inputHash    = sha256(password);
        var expectedHash = getSetting('ADMIN_PASSWORD_HASH');

        if (!expectedHash || inputHash !== expectedHash) {
          tgSend(chatId, '❌ Password salah.');
          return { ok: true };
        }

        // Password cocok → tambahkan chatId ke ADMIN_CHAT_IDS
        var currentIds = getSetting('ADMIN_CHAT_IDS') || '';
        var newIds;
        if (currentIds.trim()) {
          newIds = currentIds + ',' + chatId;
        } else {
          newIds = chatId;
        }

        // Tulis balik ke sheet Settings
        updateRowById('Settings', 'key', 'ADMIN_CHAT_IDS', { value: newIds });
        clearSettingsCache();

        tgSend(chatId, '✅ Login berhasil, Anda kini terdaftar sebagai admin.');
        log('ACTIVITY', chatId, 'Admin login via Telegram', { chat_id: chatId });
        return { ok: true };
      }

      // Command lain
      if (text.indexOf('/') === 0) {
        if (isAdmin(chatId)) {
          handleAdminCommand(chatId, text);
        } else {
          tgSend(chatId, '❓ Perintah tidak dikenal. Anda bukan admin.');
        }
        return { ok: true };
      }

      // Pesan biasa (bukan command) — abaikan
      return { ok: true };
    }

    // --- Callback Query ---
    if (update.callback_query) {
      var cb = update.callback_query;
      var cbId = String(cb.id);
      var chatId = String(cb.from.id);
      var data = String(cb.data || '');
      var message = cb.message;
      var msgId = message ? String(message.message_id) : '';
      var chatMsgId = message ? String(message.chat.id) : '';
      
      if (!isAdmin(chatId)) {
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Bukan admin', show_alert: true });
        return { ok: true };
      }
      
      if (data.indexOf('st:') !== 0) {
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Aksi diabaikan' });
        return { ok: true };
      }
      
      var parts = data.split(':');
      var prefix = parts[0];
      var aksi = parts[1];
      var orderId = parts[2];
      
      var allOrders = readAll('Orders');
      var order = null;
      for (var i = 0; i < allOrders.length; i++) {
        if (String(allOrders[i].order_id) === String(orderId)) {
          order = allOrders[i];
          break;
        }
      }
      
      if (!order) {
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Order tidak ditemukan', show_alert: true });
        return { ok: true };
      }

      var textLama = message ? (message.text || '') : '';
      
      function getCabang(ord) {
        if (ord.metode_kirim === 'DIANTAR') return ord.alamat_snapshot || '-';
        try {
          var locs = readAll('PickupLocations');
          for (var j = 0; j < locs.length; j++) {
            if (String(locs[j].lokasi_id) === String(ord.lokasi_pickup_id)) return locs[j].nama;
          }
        } catch (e) {}
        return '-';
      }

      function buildActionRow(ord, waUrl) {
        var row = [{text: '💬 WA Customer', url: waUrl}];
        if (ord.metode_kirim === 'DIANTAR' && ord.lat && ord.lng) {
          row.push({text: '🗺️ Buka Maps ke Lokasi Antar', url: 'https://www.google.com/maps/dir/?api=1&destination=' + ord.lat + ',' + ord.lng});
        }
        return row;
      }
      
      function buildMarkup(st, ord) {
        var kb = [];
        var td = {
          NAMA: ord.nama, ORDER_ID: ord.order_id, TOTAL: Number(ord.total).toLocaleString('id'), CABANG: getCabang(ord), POINT: 0
        };
        if (st === 'MENUNGGU') {
          kb.push([{text: '✅ Proses', callback_data: 'st:PROSES:'+ord.order_id}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+ord.order_id}]);
        } else if (st === 'DIPROSES') {
          kb.push([{text: '🟢 Siap', callback_data: 'st:SIAP:'+ord.order_id}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+ord.order_id}]);
          kb.push(buildActionRow(ord, waLink(ord.no_hp, fillTemplate(resolveTemplateCode('ORDER_DIPROSES', ord.metode_kirim), td))));
        } else if (st === 'SIAP') {
          kb.push([{text: '✅ Selesai', callback_data: 'st:SELESAI_ASK:'+ord.order_id}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+ord.order_id}]);
          kb.push(buildActionRow(ord, waLink(ord.no_hp, fillTemplate(resolveTemplateCode('ORDER_SIAP', ord.metode_kirim), td))));
        }
        return kb;
      }

      function resolveTemplateCode(baseCode, metodeKirim) {
        var specificCode = baseCode + '_' + metodeKirim;
        var rows = readAll('MessageTemplates');
        for (var k = 0; k < rows.length; k++) {
          if (String(rows[k].kode) === specificCode) return specificCode;
        }
        return baseCode;
      }

      function notifyOtherAdmins(stBaru) {
        var raw = getSetting('ADMIN_CHAT_IDS') || '';
        var ids = raw.split(',');
        var msg = '🔔 Update: order ' + orderId + ' → ' + stBaru + ' (oleh admin ' + chatId + ')';
        for (var k = 0; k < ids.length; k++) {
          var id = ids[k].trim();
          if (id && id !== chatId) tgSend(id, msg);
        }
      }

      var res = null;
      var waUrl = '';
      var tmplData = {
        NAMA: order.nama,
        ORDER_ID: order.order_id,
        TOTAL: Number(order.total).toLocaleString('id'),
        CABANG: getCabang(order),
        POINT: 0
      };
      
      if (aksi === 'PROSES') {
        res = orderUpdateStatus(orderId, 'DIPROSES', chatId);
        if (res && res.ok) {
          notifyOtherAdmins('DIPROSES');
          waUrl = waLink(order.no_hp, fillTemplate(resolveTemplateCode('ORDER_DIPROSES', order.metode_kirim), tmplData));
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: textLama + '\n\n🟡 Status: DIPROSES',
            reply_markup: { inline_keyboard: [[{text: '🟢 Siap', callback_data: 'st:SIAP:'+orderId}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+orderId}], buildActionRow(order, waUrl)] }
          });
        }
      }
      else if (aksi === 'SIAP') {
        res = orderUpdateStatus(orderId, 'SIAP', chatId);
        if (res && res.ok) {
          notifyOtherAdmins('SIAP');
          waUrl = waLink(order.no_hp, fillTemplate(resolveTemplateCode('ORDER_SIAP', order.metode_kirim), tmplData));
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: textLama + '\n\n🟢 Status: SIAP',
            reply_markup: { inline_keyboard: [[{text: '✅ Selesai', callback_data: 'st:SELESAI_ASK:'+orderId}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+orderId}], buildActionRow(order, waUrl)] }
          });
        }
      }
      else if (aksi === 'BATAL_ASK') {
        tgApi('editMessageReplyMarkup', {
          chat_id: chatMsgId, message_id: msgId,
          reply_markup: { inline_keyboard: [[{text: 'Ya, batalkan', callback_data: 'st:BATAL_YES:'+orderId}, {text: 'Tidak, kembali', callback_data: 'st:BATAL_NO:'+orderId}]] }
        });
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Konfirmasi pembatalan' });
        return { ok: true };
      }
      else if (aksi === 'BATAL_NO') {
        tgApi('editMessageReplyMarkup', {
          chat_id: chatMsgId, message_id: msgId,
          reply_markup: { inline_keyboard: buildMarkup(order.status, order) }
        });
      }
      else if (aksi === 'BATAL_YES') {
        res = orderUpdateStatus(orderId, 'BATAL', chatId);
        if (res && res.ok) {
          notifyOtherAdmins('BATAL');
          waUrl = waLink(order.no_hp, fillTemplate(resolveTemplateCode('ORDER_BATAL', order.metode_kirim), tmplData));
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: textLama + '\n\n❌ Status: BATAL',
            reply_markup: { inline_keyboard: [[{text: '💬 WA Customer', url: waUrl}]] }
          });
        }
      }
      else if (aksi === 'SELESAI_ASK') {
        tgApi('editMessageReplyMarkup', {
          chat_id: chatMsgId, message_id: msgId,
          reply_markup: { inline_keyboard: [[{text: 'Ya, selesaikan', callback_data: 'st:SELESAI_YES:'+orderId}, {text: 'Tidak, kembali', callback_data: 'st:SELESAI_NO:'+orderId}]] }
        });
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Konfirmasi selesai' });
        return { ok: true };
      }
      else if (aksi === 'SELESAI_NO') {
        tgApi('editMessageReplyMarkup', {
          chat_id: chatMsgId, message_id: msgId,
          reply_markup: { inline_keyboard: buildMarkup(order.status, order) }
        });
      }
      else if (aksi === 'SELESAI_YES') {
        res = orderUpdateStatus(orderId, 'SELESAI', chatId);
        if (res && res.ok) {
          notifyOtherAdmins('SELESAI');
          tmplData.POINT = res.data.poin_ditambah || 0;
          waUrl = waLink(order.no_hp, fillTemplate(resolveTemplateCode('ORDER_SELESAI', order.metode_kirim), tmplData));
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: textLama + '\n\n✅ Status: SELESAI (+' + tmplData.POINT + ' poin)',
            reply_markup: { inline_keyboard: [[{text: '💬 WA Customer', url: waUrl}]] }
          });
        }
      }

      if (res && !res.ok) {
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Gagal: ' + res.error, show_alert: true });
        return { ok: true };
      }

      tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Berhasil' });
      return { ok: true };
    }

    // Update lain — abaikan
    return { ok: true };

  } catch (err) {
    log('ERROR', 'handleTelegramWebhook', err.message, { stack: err.stack });
    return { ok: true }; // Tetap ok agar Telegram tidak retry terus
  }
}

// ============================================================
// 10. handleAdminCommand(chatId, text)
// ============================================================
/**
 * Dispatcher untuk berbagai perintah admin via Telegram.
 *
 * @param {string} chatId 
 * @param {string} text 
 */
function handleAdminCommand(chatId, text) {
  var parts = text.split(/\s+/);
  var cmd = parts[0].toLowerCase();
  var args = parts.slice(1);

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getJktDateStr(date) {
    return Utilities.formatDate(date, 'Asia/Jakarta', 'yyyy-MM-dd');
  }

  if (cmd === '/help') {
    var msg = '🛠 <b>Daftar Perintah Admin</b>\n\n'
      + '/pending — daftar order berjalan\n'
      + '/order &lt;ID&gt; — detail lengkap sebuah order\n'
      + '/omzet — omzet hari ini\n'
      + '/laporan harian — omzet 7 hari terakhir\n'
      + '/laporan bulanan — omzet 4 minggu terakhir\n'
      + '/tutuptoko — set toko tutup sementara\n'
      + '/bukatoko — buka kembali toko\n'
      + '/tutupslot &lt;id&gt; — nonaktifkan slot antar\n'
      + '/bukaslot &lt;id&gt; — aktifkan slot antar\n'
      + '/produk &lt;id&gt; on|off — ubah ketersediaan produk\n'
      + '/banner &lt;id&gt; on|off — ubah status banner\n'
      + '/clearcache — hapus cache settings & katalog';
    tgSend(chatId, msg);
    return;
  }

  if (cmd === '/pending') {
    var orders = readAll('Orders');
    var pendingList = [];
    // Urutkan dari yang terbaru
    orders.sort(function(a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    for (var i = 0; i < orders.length; i++) {
      var st = String(orders[i].status);
      if (st === 'MENUNGGU' || st === 'DIPROSES' || st === 'SIAP') {
        pendingList.push(orders[i]);
      }
    }

    if (pendingList.length === 0) {
      tgSend(chatId, 'ℹ️ Tidak ada order berjalan.');
      return;
    }

    var lines = ['🛒 <b>Daftar Order Berjalan</b>\n'];
    var max = Math.min(pendingList.length, 20);
    for (var j = 0; j < max; j++) {
      var o = pendingList[j];
      lines.push('<code>' + o.order_id + '</code> • ' + esc(o.nama) + ' • ' + o.metode_kirim + ' • Rp' + Number(o.total).toLocaleString('id') + ' • ' + o.status);
    }
    if (pendingList.length > 20) {
      lines.push('\n<i>(Menampilkan 20 order terbaru dari ' + pendingList.length + ')</i>');
    }
    tgSend(chatId, lines.join('\n'));
    return;
  }

  if (cmd === '/order') {
    if (args.length < 1) {
      tgSend(chatId, '⚠️ Format: /order &lt;ORDER_ID&gt;');
      return;
    }
    var oid = args[0].toUpperCase();
    var orders = readAll('Orders');
    var order = null;
    for (var i = 0; i < orders.length; i++) {
      if (String(orders[i].order_id) === oid) {
        order = orders[i];
        break;
      }
    }
    if (!order) {
      tgSend(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    var orderItems = readAll('OrderItems');
    var itemsHtml = '';
    for (var k = 0; k < orderItems.length; k++) {
      if (String(orderItems[k].order_id) === oid) {
        itemsHtml += esc(orderItems[k].nama_snapshot) + ' × ' + orderItems[k].qty + ' = Rp' + Number(orderItems[k].subtotal).toLocaleString('id') + '\n';
      }
    }

    var tl = '';
    try {
      var tArr = JSON.parse(order.timeline_json);
      for (var t = 0; t < tArr.length; t++) {
        var jkt = Utilities.formatDate(new Date(tArr[t].at), 'Asia/Jakarta', 'dd-MM-yy HH:mm');
        tl += jkt + ' : ' + tArr[t].status + '\n';
      }
    } catch (e) { tl = '-'; }

    var msg = '📄 <b>Detail Order ' + oid + '</b>\n\n'
      + '👤 Nama: ' + esc(order.nama) + '\n'
      + '📞 HP: ' + esc(order.no_hp) + '\n'
      + '📦 Metode: ' + esc(order.metode_kirim) + '\n'
      + '📅 Tgl Antar: ' + esc(order.tgl_antar) + '\n'
      + '📍 Alamat/Tujuan: ' + esc(order.alamat_snapshot) + '\n\n'
      + '<b>Daftar Item:</b>\n'
      + (itemsHtml || '(kosong)\n')
      + '\n💰 Subtotal: Rp' + Number(order.subtotal).toLocaleString('id') + '\n'
      + '🚚 Ongkir: Rp' + Number(order.ongkir || 0).toLocaleString('id') + '\n'
      + '🎁 Poin: -Rp' + Number(order.poin_dipakai || 0).toLocaleString('id') + '\n'
      + '💳 <b>Total: Rp' + Number(order.total).toLocaleString('id') + '</b> (' + esc(order.metode_bayar) + ')\n\n'
      + '📝 Catatan: ' + esc(order.catatan_customer || '-') + '\n'
      + '⚙️ Catatan Admin: ' + esc(order.catatan_admin || '-') + '\n\n'
      + '<b>Status Saat Ini:</b> ' + order.status + '\n'
      + '<b>Timeline:</b>\n<pre>' + tl + '</pre>';
      
    tgSend(chatId, msg);
    return;
  }

  if (cmd === '/omzet') {
    var today = getJktDateStr(new Date());
    var orders = readAll('Orders');
    var count = 0;
    var sumSub = 0, sumOngkir = 0, sumPoin = 0, sumTotal = 0;
    
    for (var i = 0; i < orders.length; i++) {
      var d = getJktDateStr(new Date(orders[i].created_at));
      if (d === today && String(orders[i].status) !== 'BATAL') {
        count++;
        sumSub += Number(orders[i].subtotal) || 0;
        sumOngkir += Number(orders[i].ongkir) || 0;
        sumPoin += Number(orders[i].poin_dipakai) || 0;
        sumTotal += Number(orders[i].total) || 0;
      }
    }

    if (count === 0) {
      tgSend(chatId, 'ℹ️ Belum ada order hari ini.');
      return;
    }

    var msg = '📈 <b>Omzet Hari Ini (' + today + ')</b>\n\n'
      + 'Jumlah Order: ' + count + '\n'
      + 'Subtotal Produk: Rp' + sumSub.toLocaleString('id') + '\n'
      + 'Ongkir: Rp' + sumOngkir.toLocaleString('id') + '\n'
      + 'Poin Dipakai: -Rp' + sumPoin.toLocaleString('id') + '\n'
      + '<b>Omzet Total: Rp' + sumTotal.toLocaleString('id') + '</b>';
      
    tgSend(chatId, msg);
    return;
  }

  if (cmd === '/laporan') {
    var jenis = args[0] ? args[0].toLowerCase() : '';
    if (jenis !== 'harian' && jenis !== 'bulanan') {
      tgSend(chatId, '⚠️ Format: /laporan harian | /laporan bulanan');
      return;
    }

    var orders = readAll('Orders');
    var now = new Date();
    // Normalisasi offset ke Asia/Jakarta 
    var jktOffset = 7 * 60 * 60 * 1000;
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    var nowJkt = new Date(utc + jktOffset);

    if (jenis === 'harian') {
      var daysData = {};
      var totalOrder = 0;
      var totalOmzet = 0;
      
      // Init 7 hari ke belakang (termasuk hari ini)
      for (var d = 0; d < 7; d++) {
        var dt = new Date(nowJkt.getTime() - (d * 24 * 60 * 60 * 1000));
        var dStr = getJktDateStr(dt);
        daysData[dStr] = { count: 0, omzet: 0 };
      }
      
      for (var i = 0; i < orders.length; i++) {
        var oDt = new Date(orders[i].created_at);
        var oUtc = oDt.getTime() + (oDt.getTimezoneOffset() * 60000);
        var oJkt = new Date(oUtc + jktOffset);
        var oStr = getJktDateStr(oJkt);
        
        if (daysData[oStr] && String(orders[i].status) !== 'BATAL') {
          daysData[oStr].count++;
          daysData[oStr].omzet += (Number(orders[i].total) || 0);
          totalOrder++;
          totalOmzet += (Number(orders[i].total) || 0);
        }
      }

      var tbl = 'Tanggal    | Jml | Omzet\n';
      tbl    += '-------------------------\n';
      var keys = Object.keys(daysData).sort(); // lama ke baru
      for (var k = 0; k < keys.length; k++) {
        var kd = keys[k].substring(5); // MM-DD
        var c = String(daysData[keys[k]].count);
        while (c.length < 3) c = c + ' ';
        tbl += kd + ' | ' + c + ' | ' + daysData[keys[k]].omzet.toLocaleString('id') + '\n';
      }
      tbl += '-------------------------\n';
      tbl += 'TOTAL      | ' + totalOrder + ' | ' + totalOmzet.toLocaleString('id');

      tgSend(chatId, '📊 <b>Laporan Harian (7 Hari)</b>\n<pre>' + tbl + '</pre>');
      return;
    }

    if (jenis === 'bulanan') {
      var weeksData = [];
      // Cari Senin dari minggu ini
      var currentDay = nowJkt.getDay(); // 0=Minggu, 1=Senin
      var diffToMonday = currentDay === 0 ? 6 : currentDay - 1;
      var currentMonday = new Date(nowJkt.getTime() - (diffToMonday * 24 * 60 * 60 * 1000));
      currentMonday.setHours(0,0,0,0);
      
      // Init 4 minggu ke belakang
      for (var w = 3; w >= 0; w--) {
        var wStart = new Date(currentMonday.getTime() - (w * 7 * 24 * 60 * 60 * 1000));
        var wEnd = new Date(wStart.getTime() + (6 * 24 * 60 * 60 * 1000));
        weeksData.push({
          start: wStart,
          end: wEnd,
          label: getJktDateStr(wStart).substring(5) + ' s/d ' + getJktDateStr(wEnd).substring(5),
          count: 0,
          omzet: 0
        });
      }

      var totalOrder = 0;
      var totalOmzet = 0;

      for (var i = 0; i < orders.length; i++) {
        var oDt = new Date(orders[i].created_at);
        var oUtc = oDt.getTime() + (oDt.getTimezoneOffset() * 60000);
        var oJkt = new Date(oUtc + jktOffset);
        
        if (String(orders[i].status) === 'BATAL') continue;
        
        for (var w = 0; w < weeksData.length; w++) {
          if (oJkt >= weeksData[w].start && oJkt <= new Date(weeksData[w].end.getTime() + 86399999)) {
            weeksData[w].count++;
            weeksData[w].omzet += (Number(orders[i].total) || 0);
            totalOrder++;
            totalOmzet += (Number(orders[i].total) || 0);
            break;
          }
        }
      }

      var tbl = 'Minggu              | Jml | Omzet\n';
      tbl    += '---------------------------------\n';
      for (var w = 0; w < weeksData.length; w++) {
        var l = weeksData[w].label;
        while (l.length < 19) l += ' ';
        var c = String(weeksData[w].count);
        while (c.length < 3) c += ' ';
        tbl += l + ' | ' + c + ' | ' + weeksData[w].omzet.toLocaleString('id') + '\n';
      }
      tbl += '---------------------------------\n';
      tbl += 'TOTAL               | ' + totalOrder + ' | ' + totalOmzet.toLocaleString('id');

      tgSend(chatId, '📊 <b>Laporan Bulanan (4 Minggu)</b>\n<pre>' + tbl + '</pre>');
      return;
    }
  }

  if (cmd === '/tutuptoko') {
    withLock(function() {
      updateRowById('Settings', 'key', 'TOKO_BUKA', { value: '0' });
    });
    clearSettingsCache();
    CacheService.getScriptCache().remove('catalog_cache');
    tgSend(chatId, '🛑 Toko sudah TUTUP. Order baru akan ditolak.');
    return;
  }

  if (cmd === '/bukatoko') {
    withLock(function() {
      updateRowById('Settings', 'key', 'TOKO_BUKA', { value: '1' });
    });
    clearSettingsCache();
    CacheService.getScriptCache().remove('catalog_cache');
    tgSend(chatId, '✅ Toko sudah BUKA.');
    return;
  }

  if (cmd === '/tutupslot' || cmd === '/bukaslot') {
    if (args.length < 1) {
      tgSend(chatId, '⚠️ Format: ' + cmd + ' &lt;slot_id&gt;');
      return;
    }
    var slotId = args[0];
    var slots = readAll('DeliverySlots');
    var found = false;
    for (var i = 0; i < slots.length; i++) {
      if (String(slots[i].slot_id) === slotId) {
        found = true;
        break;
      }
    }
    if (!found) {
      tgSend(chatId, '❌ Slot tidak ditemukan.');
      return;
    }
    
    var newStatus = cmd === '/tutupslot' ? 'nonaktif' : 'aktif';
    withLock(function() {
      updateRowById('DeliverySlots', 'slot_id', slotId, { status: newStatus });
    });
    clearSettingsCache();
    CacheService.getScriptCache().remove('catalog_cache');
    
    if (newStatus === 'nonaktif') {
      tgSend(chatId, '🛑 Slot <code>' + esc(slotId) + '</code> sudah ditutup.');
    } else {
      tgSend(chatId, '✅ Slot <code>' + esc(slotId) + '</code> sudah dibuka.');
    }
    return;
  }

  if (cmd === '/produk') {
    if (args.length < 1) {
      var prods = readAll('Products');
      var lines = ['📦 <b>Daftar Produk</b>\n'];
      var max = Math.min(prods.length, 50);
      for (var i = 0; i < max; i++) {
        var p = prods[i];
        var stateStr = Number(p.tersedia) === 1 ? 'on' : 'off';
        lines.push('<code>' + p.product_id + '</code> • ' + esc(p.nama) + ' • Rp' + Number(p.harga).toLocaleString('id') + ' • ' + stateStr);
      }
      if (prods.length > 50) lines.push('\n<i>(Menampilkan 50 baris pertama)</i>');
      tgSend(chatId, lines.join('\n'));
      return;
    }

    if (args.length < 2) {
      tgSend(chatId, '⚠️ Format: /produk &lt;id&gt; on|off\nAtau ketik /produk untuk melihat daftar.');
      return;
    }
    var pid = args[0];
    var state = args[1].toLowerCase();
    if (state !== 'on' && state !== 'off') {
      tgSend(chatId, '⚠️ Format: /produk &lt;id&gt; on|off');
      return;
    }

    var prods = readAll('Products');
    var prod = null;
    for (var i = 0; i < prods.length; i++) {
      if (String(prods[i].product_id) === pid) {
        prod = prods[i];
        break;
      }
    }
    if (!prod) {
      tgSend(chatId, '❌ Produk tidak ditemukan.');
      return;
    }

    var tersedia = state === 'on' ? '1' : '0';
    var statusText = state === 'on' ? 'tersedia' : 'tidak tersedia';
    
    withLock(function() {
      updateRowById('Products', 'product_id', pid, { tersedia: tersedia });
    });
    clearSettingsCache();
    CacheService.getScriptCache().remove('catalog_cache');
    
    tgSend(chatId, '📦 Produk <b>' + esc(prod.nama) + '</b> → ' + statusText);
    return;
  }

  if (cmd === '/banner') {
    if (args.length < 1) {
      var banners = readAll('Banners');
      var lines = ['🖼 <b>Daftar Banner</b>\n'];
      var max = Math.min(banners.length, 50);
      for (var i = 0; i < max; i++) {
        var b = banners[i];
        lines.push('<code>' + b.banner_id + '</code> • ' + esc(b.judul) + ' • ' + b.status);
      }
      if (banners.length > 50) lines.push('\n<i>(Menampilkan 50 baris pertama)</i>');
      tgSend(chatId, lines.join('\n'));
      return;
    }

    if (args.length < 2) {
      tgSend(chatId, '⚠️ Format: /banner &lt;id&gt; on|off\nAtau ketik /banner untuk melihat daftar.');
      return;
    }
    var bid = args[0];
    var state = args[1].toLowerCase();
    if (state !== 'on' && state !== 'off') {
      tgSend(chatId, '⚠️ Format: /banner &lt;id&gt; on|off');
      return;
    }

    var banners = readAll('Banners');
    var banner = null;
    for (var i = 0; i < banners.length; i++) {
      if (String(banners[i].banner_id) === bid) {
        banner = banners[i];
        break;
      }
    }
    if (!banner) {
      tgSend(chatId, '❌ Banner tidak ditemukan.');
      return;
    }

    var status = state === 'on' ? 'aktif' : 'nonaktif';
    withLock(function() {
      updateRowById('Banners', 'banner_id', bid, { status: status });
    });
    clearSettingsCache();
    CacheService.getScriptCache().remove('catalog_cache');
    
    tgSend(chatId, '🖼 Banner <b>' + esc(banner.judul) + '</b> → ' + status);
    return;
  }

  if (cmd === '/clearcache') {
    clearSettingsCache();
    CacheService.getScriptCache().remove('catalog_cache');
    tgSend(chatId, '🧹 Cache dibersihkan. Settings & katalog akan dibaca ulang.');
    return;
  }

  tgSend(chatId, '❓ Perintah tidak dikenal. Ketik /help untuk daftar perintah.');
}

