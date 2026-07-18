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
          tgSend(chatId, 'ℹ️ Perintah belum tersedia.');
        } else {
          tgSend(chatId, '❓ Perintah tidak dikenal.');
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
      
      function buildMarkup(st, ord) {
        var kb = [];
        var td = {
          NAMA: ord.nama, ORDER_ID: ord.order_id, TOTAL: Number(ord.total).toLocaleString('id'), CABANG: getCabang(ord), POINT: 0
        };
        if (st === 'MENUNGGU') {
          kb.push([{text: '✅ Proses', callback_data: 'st:PROSES:'+ord.order_id}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+ord.order_id}]);
        } else if (st === 'DIPROSES') {
          kb.push([{text: '🟢 Siap', callback_data: 'st:SIAP:'+ord.order_id}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+ord.order_id}]);
          kb.push([{text: '💬 WA Customer', url: waLink(ord.no_hp, fillTemplate(resolveTemplateCode('ORDER_DIPROSES', ord.metode_kirim), td))}]);
        } else if (st === 'SIAP') {
          kb.push([{text: '✅ Selesai', callback_data: 'st:SELESAI_ASK:'+ord.order_id}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+ord.order_id}]);
          kb.push([{text: '💬 WA Customer', url: waLink(ord.no_hp, fillTemplate(resolveTemplateCode('ORDER_SIAP', ord.metode_kirim), td))}]);
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
            reply_markup: { inline_keyboard: [[{text: '🟢 Siap', callback_data: 'st:SIAP:'+orderId}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+orderId}], [{text: '💬 WA Customer', url: waUrl}]] }
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
            reply_markup: { inline_keyboard: [[{text: '✅ Selesai', callback_data: 'st:SELESAI_ASK:'+orderId}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+orderId}], [{text: '💬 WA Customer', url: waUrl}]] }
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
