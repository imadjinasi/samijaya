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

/** Escape data dinamis yang akan disisipkan ke parse_mode HTML. */
function tgEscapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Parse slash command secara exact, case-insensitive, termasuk suffix @bot. */
function tgParseCommand(text) {
  var raw = String(text == null ? '' : text).trim();
  var match = raw.match(/^(\/[a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  var argText = String(match[3] || '').trim();
  return {
    command: match[1].toLowerCase(),
    bot_username: String(match[2] || ''),
    arg_text: argText,
    args: argText ? argText.split(/\s+/) : []
  };
}

/** Pecah pesan panjang pada batas baris; tidak memotong tag/entity HTML. */
function tgChunkHtml(text, maxLength) {
  var max = Number(maxLength) || 3850;
  var source = String(text == null ? '' : text);
  if (!source) return [];
  if (source.length <= max) return [source];

  var lines = source.split('\n');
  var chunks = [];
  var current = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var candidate = current ? current + '\n' + line : line;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = '';

    // Data dinamis pada jalur command sudah dibatasi per baris. Fallback ini
    // hanya memotong pada spasi yang berada di luar tag/entity HTML.
    while (line.length > max) {
      var cut = max;
      var lt = line.lastIndexOf('<', cut);
      var gt = line.lastIndexOf('>', cut);
      if (lt > gt) cut = lt;
      var amp = line.lastIndexOf('&', cut);
      var semi = line.lastIndexOf(';', cut);
      if (amp > semi) cut = Math.min(cut, amp);
      var space = line.lastIndexOf(' ', cut);
      if (space > Math.floor(max * 0.6)) cut = space;
      if (cut <= 0) cut = max;
      chunks.push(line.substring(0, cut));
      line = line.substring(cut).replace(/^\s+/, '');
    }
    current = line;
  }
  if (current) chunks.push(current);
  return chunks.filter(function(chunk) { return !!chunk; });
}

/** Kirim pesan berurutan; reply markup hanya ditempel pada chunk terakhir. */
function tgSendLong(chatId, text, opts) {
  var chunks = tgChunkHtml(text, 3850);
  var results = [];
  for (var i = 0; i < chunks.length; i++) {
    var chunkOpts = i === chunks.length - 1 ? opts : null;
    try {
      var result = tgSend(chatId, chunks[i], chunkOpts);
      results.push(result);
      if (result && result.ok === false) {
        log('ERROR', 'tgSendLong', 'Gagal mengirim chunk Telegram', { chunk: i + 1, total: chunks.length });
      }
    } catch (err) {
      log('ERROR', 'tgSendLong', 'Gagal mengirim chunk Telegram', { chunk: i + 1, total: chunks.length });
      results.push({ ok: false, error: 'Telegram send failed' });
    }
  }
  return results;
}

function tgIsActiveValue(value) {
  var normalized = String(value == null ? '' : value).trim().toLowerCase();
  return value === true || normalized === 'aktif' || normalized === 'true' ||
    normalized === '1' || normalized === 'ya';
}

function tgDisplaySheetDate(value, includeTime) {
  if (value == null || String(value).trim() === '') return '-';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Jakarta', includeTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  var text = String(value).trim();
  return includeTime ? text : text.substring(0, 10);
}

/**
 * Format daftar item order untuk pesan Telegram.
 * Harga/subtotal hanya dibaca dari snapshot OrderItems; tidak ada hitung ulang.
 *
 * Jika opts.items tersedia, data itu dipakai langsung tanpa membaca sheet.
 * Jika tidak, item dan add-on dibaca dari sheet berdasarkan orderId.
 *
 * @param {string} orderId
 * @param {Object=} opts { html, priceStyle, items }
 * @return {string} tanpa newline di akhir
 */
function tgFormatOrderItems(orderId, opts) {
  opts = opts || {};
  var useHtml = opts.html === true;
  var priceStyle = String(opts.priceStyle || 'none');

  function safe(value) {
    var text = String(value == null ? '' : value);
    if (!useHtml) return text;
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var targetOrderId = String(orderId);
  var itemsToFormat = [];

  if (Array.isArray(opts.items)) {
    // Mode data langsung: dipakai createOrder agar notifikasi tidak membaca
    // ulang dua sheet yang datanya baru saja ditulis.
    itemsToFormat = opts.items;
  } else {
    // Mode sheet: dipakai status-change dan command /order.
    var addonsByRef = {};
    var allAddons = readAll('OrderItemAddons');
    for (var a = 0; a < allAddons.length; a++) {
      if (String(allAddons[a].order_id) !== targetOrderId) continue;
      var addonRef = String(allAddons[a].order_item_ref || '');
      if (!addonRef) continue;
      var addonKey = '$' + addonRef;
      if (!addonsByRef[addonKey]) addonsByRef[addonKey] = [];
      var addonName = String(allAddons[a].nama_addon_snapshot || '');
      if (addonName) addonsByRef[addonKey].push(addonName);
    }

    var allItems = readAll('OrderItems');
    for (var r = 0; r < allItems.length; r++) {
      if (String(allItems[r].order_id) !== targetOrderId) continue;
      var sheetItem = allItems[r];
      var sheetItemRef = String(sheetItem.order_item_ref || '');
      sheetItem.addons = addonsByRef['$' + sheetItemRef] || [];
      itemsToFormat.push(sheetItem);
    }
  }

  var lines = [];
  for (var i = 0; i < itemsToFormat.length; i++) {
    var item = itemsToFormat[i];

    var itemLine = '  • ' + safe(item.nama_snapshot) + ' ×' + String(item.qty || '');
    if (priceStyle === 'parentheses') {
      itemLine += ' (subtotal Rp' + Number(item.subtotal || 0).toLocaleString('id') + ')';
    } else if (priceStyle === 'equals') {
      itemLine += ' — subtotal Rp' + Number(item.subtotal || 0).toLocaleString('id');
    }
    lines.push(itemLine);

    var variantName = String(item.variant_nama_snapshot || '');
    if (variantName) {
      var axisName = String(item.nama_axis_snapshot || '') || 'Varian';
      lines.push('    ' + safe(axisName) + ': ' + safe(variantName));
    }

    var itemAddons = item.addons || item.addon_snapshots || [];
    var addonNames = [];
    for (var n = 0; n < itemAddons.length; n++) {
      var directAddonName = String(
        itemAddons[n].nama_addon_snapshot || itemAddons[n].nama_addon || ''
      );
      if (directAddonName) addonNames.push(directAddonName);
    }
    if (addonNames.length > 0) {
      lines.push('    + ' + addonNames.map(safe).join(', '));
    }
  }

  return lines.join('\n');
}

/** Segarkan blok item pada teks polos pesan order sebelum edit status. */
function tgRefreshOrderItemsText(messageText, orderId) {
  var itemsText = tgFormatOrderItems(orderId, { priceStyle: 'parentheses' }) || '  (kosong)';
  return String(messageText || '').replace(
    /((?:Items|Daftar Item):\n)[\s\S]*?(\n💰 Subtotal:)/,
    function(_, heading, subtotalHeading) {
      return heading + itemsText + subtotalHeading;
    }
  );
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

function tgOrderPickupName(order) {
  if (String(order.metode_kirim) === 'DIANTAR') return String(order.alamat_snapshot || '-');
  var locations = readAll('PickupLocations');
  for (var i = 0; i < locations.length; i++) {
    if (String(locations[i].lokasi_id) === String(order.lokasi_pickup_id)) return String(locations[i].nama || '-');
  }
  return '-';
}

function tgResolveTemplateCode(baseCode, metodeKirim) {
  var specificCode = baseCode + '_' + metodeKirim;
  var rows = readAll('MessageTemplates');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].kode) === specificCode) return specificCode;
  }
  return baseCode;
}

function tgOrderWaButtons(order, statusTemplate, templateData) {
  var baseCode = tgResolveTemplateCode(statusTemplate, order.metode_kirim);
  var customerText = fillTemplate(baseCode, templateData);
  var buttons = [{ text: '💬 WA Customer', url: waLink(String(order.no_hp || ''), customerText) }];
  if (String(order.nama_penerima) !== String(order.nama) || String(order.no_hp_penerima) !== String(order.no_hp)) {
    var recipientData = JSON.parse(JSON.stringify(templateData));
    recipientData.NAMA = order.nama_penerima;
    recipientData.NAMA_PEMESAN = order.nama;
    var recipientCode = baseCode + '_PENERIMA';
    var templates = readAll('MessageTemplates');
    var found = false;
    for (var i = 0; i < templates.length; i++) {
      if (String(templates[i].kode) === recipientCode) { found = true; break; }
    }
    buttons.push({
      text: '💬 WA Penerima',
      url: waLink(String(order.no_hp_penerima || ''), fillTemplate(found ? recipientCode : baseCode, recipientData))
    });
  }
  return buttons;
}

/** Keyboard operasional tunggal untuk notifikasi dan fallback /order. */
function tgBuildOrderKeyboard(order) {
  var status = String(order.status || '').toUpperCase();
  var data = {
    NAMA: order.nama,
    ORDER_ID: order.order_id,
    TOTAL: Number(order.total || 0).toLocaleString('id'),
    CABANG: tgOrderPickupName(order),
    POINT: 0
  };
  var keyboard = [];
  var templateCode = '';
  if (status === 'MENUNGGU') {
    keyboard.push([
      { text: '✅ Proses', callback_data: 'st:PROSES:' + order.order_id },
      { text: '❌ Batal', callback_data: 'st:BATAL_ASK:' + order.order_id }
    ]);
  } else if (status === 'DIPROSES') {
    keyboard.push([
      { text: '🟢 Siap', callback_data: 'st:SIAP:' + order.order_id },
      { text: '❌ Batal', callback_data: 'st:BATAL_ASK:' + order.order_id }
    ]);
    templateCode = 'ORDER_DIPROSES';
  } else if (status === 'SIAP') {
    keyboard.push([
      { text: '✅ Selesai', callback_data: 'st:SELESAI_ASK:' + order.order_id },
      { text: '❌ Batal', callback_data: 'st:BATAL_ASK:' + order.order_id }
    ]);
    templateCode = 'ORDER_SIAP';
  } else if (status === 'SELESAI') {
    templateCode = 'ORDER_SELESAI';
  } else if (status === 'BATAL') {
    templateCode = 'ORDER_BATAL';
  }

  if (templateCode) {
    var actionRow = tgOrderWaButtons(order, templateCode, data);
    if (String(order.metode_kirim) === 'DIANTAR' && order.lat && order.lng) {
      actionRow.push({
        text: '🗺️ Buka Maps ke Lokasi Antar',
        url: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(String(order.lat)) + ',' + encodeURIComponent(String(order.lng))
      });
    }
    keyboard.push(actionRow);
  }
  return keyboard;
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
      var parsedCommand = tgParseCommand(text);

      // /myid — siapa pun boleh
      if (parsedCommand && parsedCommand.command === '/myid' && parsedCommand.args.length === 0) {
        tgSend(chatId, 'Chat ID Anda: <code>' + chatId + '</code>');
        return { ok: true };
      }

      // /start
      if (parsedCommand && parsedCommand.command === '/start' && parsedCommand.args.length === 0) {
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
      if (parsedCommand && parsedCommand.command === '/login') {
        var password = parsedCommand.arg_text;

        if (!password) {
          tgSend(chatId, '⚠️ Gunakan: /login &lt;password&gt;');
          return { ok: true };
        }

        // Hash password & bandingkan
        var inputHash    = sha256(password);
        var expectedHash = getSetting('ADMIN_PASSWORD_HASH');

        if (!expectedHash || inputHash !== expectedHash) {
          tgSend(chatId, '❌ Password salah.');
          return { ok: true };
        }

        var loginResult = withLock(function() {
          var settings = readAll('Settings');
          var rawIds = '';
          var settingFound = false;
          for (var s = 0; s < settings.length; s++) {
            if (String(settings[s].key) === 'ADMIN_CHAT_IDS') {
              rawIds = String(settings[s].value || '');
              settingFound = true;
              break;
            }
          }
          if (!settingFound) return { ok: false, code: 'SETTING_NOT_FOUND', error: 'Konfigurasi admin tidak ditemukan' };
          var ids = rawIds.split(',').map(function(id) { return id.trim(); }).filter(function(id) { return !!id; });
          if (ids.indexOf(chatId) !== -1) return { ok: true, data: { already_admin: true } };
          ids.push(chatId);
          var updated = updateRowById('Settings', 'key', 'ADMIN_CHAT_IDS', { value: ids.join(',') });
          if (!updated) return { ok: false, code: 'WRITE_FAILED', error: 'Konfigurasi admin gagal diperbarui' };
          return { ok: true, data: { already_admin: false } };
        });
        if (!loginResult || !loginResult.ok) {
          tgSend(chatId, '❌ Login gagal: ' + tgEscapeHtml(loginResult && loginResult.error ? loginResult.error : 'operasi tidak dapat diproses'));
          return { ok: true };
        }
        if (loginResult.data && loginResult.data.already_admin) {
          tgSend(chatId, 'ℹ️ Anda sudah terdaftar sebagai admin.');
          return { ok: true };
        }
        clearSettingsCache();
        tgSend(chatId, '✅ Login berhasil, Anda kini terdaftar sebagai admin.');
        log('ACTIVITY', chatId, 'Admin login via Telegram', { chat_id: chatId });
        return { ok: true };
      }

      // Command lain
      if (parsedCommand) {
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
      if (parts.length !== 3 || !parts[1] || !parts[2]) {
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Format aksi tidak valid', show_alert: true });
        return { ok: true };
      }
      var aksi = parts[1];
      var orderId = parts[2];
      var knownActions = {
        PROSES: true, SIAP: true, BATAL_ASK: true, BATAL_NO: true,
        BATAL_YES: true, SELESAI_ASK: true, SELESAI_NO: true, SELESAI_YES: true
      };
      if (!knownActions[aksi]) {
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Aksi tidak dikenal', show_alert: true });
        return { ok: true };
      }
      
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
      function statusMessageText(statusLine) {
        // Pesan status membawa ulang ringkasan order; segarkan item agar order
        // lama juga menampilkan snapshot varian dan add-on.
        return tgRefreshOrderItemsText(textLama, orderId) + '\n\n' + statusLine;
      }
      
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

      function buildPesanWaPemesan(ord, kodeStatus, tmplData) {
        return fillTemplate(resolveTemplateCode(kodeStatus, ord.metode_kirim), tmplData);
      }

      function buildPesanWaPenerima(ord, kodeStatus, tmplData) {
        var penerimaData = JSON.parse(JSON.stringify(tmplData));
        penerimaData.NAMA = ord.nama_penerima;
        penerimaData.NAMA_PEMESAN = ord.nama;
        
        var resolvedBase = resolveTemplateCode(kodeStatus, ord.metode_kirim);
        var targetKode = resolvedBase + '_PENERIMA';
        
        var rows = readAll('MessageTemplates');
        var found = false;
        for (var k = 0; k < rows.length; k++) {
          if (String(rows[k].kode) === targetKode) {
             found = true;
             break;
          }
        }
        
        var finalKode = found ? targetKode : resolvedBase;
        return fillTemplate(finalKode, penerimaData);
      }

      function getWaButtons(ord, kodeStatus, tmplData) {
        var pesanPemesan = buildPesanWaPemesan(ord, kodeStatus, tmplData);
        var buttons = [{text: '💬 WA Customer', url: waLink(ord.no_hp, pesanPemesan)}];
        if (String(ord.nama_penerima) !== String(ord.nama) || String(ord.no_hp_penerima) !== String(ord.no_hp)) {
          var pesanPenerima = buildPesanWaPenerima(ord, kodeStatus, tmplData);
          buttons.push({text: '💬 WA Penerima', url: waLink(ord.no_hp_penerima, pesanPenerima)});
        }
        return buttons;
      }

      function buildActionRow(ord, kodeStatus, tmplData) {
        var row = getWaButtons(ord, kodeStatus, tmplData);
        if (ord.metode_kirim === 'DIANTAR' && ord.lat && ord.lng) {
          row.push({text: '🗺️ Buka Maps ke Lokasi Antar', url: 'https://www.google.com/maps/dir/?api=1&destination=' + ord.lat + ',' + ord.lng});
        }
        return row;
      }
      
      function buildMarkup(st, ord) {
        ord.status = st;
        return tgBuildOrderKeyboard(ord);
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
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: statusMessageText('🟡 Status: DIPROSES'),
            reply_markup: { inline_keyboard: [[{text: '🟢 Siap', callback_data: 'st:SIAP:'+orderId}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+orderId}], buildActionRow(order, 'ORDER_DIPROSES', tmplData)] }
          });
        }
      }
      else if (aksi === 'SIAP') {
        res = orderUpdateStatus(orderId, 'SIAP', chatId);
        if (res && res.ok) {
          notifyOtherAdmins('SIAP');
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: statusMessageText('🟢 Status: SIAP'),
            reply_markup: { inline_keyboard: [[{text: '✅ Selesai', callback_data: 'st:SELESAI_ASK:'+orderId}, {text: '❌ Batal', callback_data: 'st:BATAL_ASK:'+orderId}], buildActionRow(order, 'ORDER_SIAP', tmplData)] }
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
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: statusMessageText('❌ Status: BATAL'),
            reply_markup: { inline_keyboard: [getWaButtons(order, 'ORDER_BATAL', tmplData)] }
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
          tgApi('editMessageText', {
            chat_id: chatMsgId, message_id: msgId,
            text: statusMessageText('✅ Status: SELESAI (+' + tmplData.POINT + ' poin)'),
            reply_markup: { inline_keyboard: [getWaButtons(order, 'ORDER_SELESAI', tmplData)] }
          });
        }
      }

      if (res && !res.ok) {
        var callbackError = res.code === 'TRANSISI_TIDAK_VALID' || res.code === 'STATUS_FINAL'
          ? 'Status order sudah berubah atau aksi tidak dapat diproses'
          : 'Gagal: ' + res.error;
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: callbackError, show_alert: true });
        return { ok: true };
      }

      if (!res && aksi !== 'BATAL_NO' && aksi !== 'SELESAI_NO') {
        tgApi('answerCallbackQuery', { callback_query_id: cbId, text: 'Aksi tidak dapat diproses', show_alert: true });
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
  var parsed = tgParseCommand(text);
  if (!parsed) {
    tgSend(chatId, '❓ Format perintah tidak valid. Ketik /help.');
    return;
  }
  var cmd = parsed.command;
  var args = parsed.args;

  function esc(str) {
    return tgEscapeHtml(str);
  }

  function getJktDateStr(date) {
    return Utilities.formatDate(date, 'Asia/Jakarta', 'yyyy-MM-dd');
  }

  if (cmd === '/help') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /help'); return; }
    var msg = '🛠 <b>DAFTAR PERINTAH ADMIN</b>\n\n'
      + '<b>LIHAT DATA</b>\n'
      + '/status\n/health\n/pending\n/order &lt;ID&gt;\n/produk\n/ulasan\n'
      + '/promo list\n/promo stats &lt;KODE&gt;\n/omzet\n/laporan harian\n/laporan bulanan\n\n'
      + '<b>UBAH OPERASIONAL</b>\n'
      + '/bukatoko\n/tutuptoko\n/bukaslot &lt;ID&gt;\n/tutupslot &lt;ID&gt;\n'
      + '/produk &lt;ID&gt; on|off\n/ulasan hide|show &lt;ID&gt;\n'
      + '/promo on|off &lt;KODE&gt;\n/clearcache';
    tgSendLong(chatId, msg);
    return;
  }

  if (cmd === '/status') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /status'); return; }
    var statusLines = ['📋 <b>STATUS OPERASIONAL</b>', ''];
    var storeSettingFound = false;
    try {
      var settings = readAll('Settings');
      for (var stIdx = 0; stIdx < settings.length; stIdx++) {
        if (String(settings[stIdx].key) === 'TOKO_BUKA') {
          storeSettingFound = true;
          statusLines.push('Toko: <b>' + (tgIsActiveValue(settings[stIdx].value) ? 'BUKA' : 'TUTUP') + '</b>');
          break;
        }
      }
      if (!storeSettingFound) statusLines.push('Toko: <b>ERROR — setting TOKO_BUKA tidak ditemukan</b>');
    } catch (statusSettingsErr) {
      statusLines.push('Toko: <b>ERROR — Settings tidak dapat dibaca</b>');
    }
    statusLines.push('', '<b>Slot:</b>');
    try {
      var statusSlots = readAll('DeliverySlots');
      statusSlots.sort(function(a, b) {
        return String(a.jam_mulai || '').localeCompare(String(b.jam_mulai || ''));
      });
      if (statusSlots.length === 0) statusLines.push('Belum ada slot.');
      for (var sl = 0; sl < statusSlots.length; sl++) {
        statusLines.push('<code>' + esc(statusSlots[sl].slot_id) + '</code> · ' +
          esc(statusSlots[sl].jam_mulai || '-') + '–' + esc(statusSlots[sl].jam_selesai || '-') + ' · ' +
          (tgIsActiveValue(statusSlots[sl].status) ? 'AKTIF' : 'NONAKTIF'));
      }
    } catch (statusSlotsErr) {
      statusLines.push('ERROR — DeliverySlots tidak dapat dibaca');
    }
    tgSendLong(chatId, statusLines.join('\n'));
    return;
  }

  if (cmd === '/health') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /health'); return; }
    var checks = ['Settings', 'Orders', 'Products', 'DeliverySlots', 'PromoCodes', 'PromoUsage'];
    var healthLines = ['🩺 <b>HEALTH</b>'];
    for (var hc = 0; hc < checks.length; hc++) {
      try {
        readAll(checks[hc]);
        healthLines.push(checks[hc] + ': OK');
      } catch (healthErr) {
        healthLines.push(checks[hc] + ': ERROR');
      }
    }
    tgSendLong(chatId, healthLines.join('\n'));
    return;
  }

  if (cmd === '/pending') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /pending'); return; }
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
        lines.push('<code>' + esc(o.order_id) + '</code> • ' + esc(o.nama) + ' • ' + esc(o.metode_kirim) + ' • Rp' + Number(o.total).toLocaleString('id') + ' • ' + esc(o.status));
    }
    if (pendingList.length > 20) {
      lines.push('\n<i>(Menampilkan 20 order terbaru dari ' + pendingList.length + ')</i>');
    }
    tgSendLong(chatId, lines.join('\n'));
    return;
  }

  if (cmd === '/order') {
    if (args.length !== 1) {
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

    var itemsHtml = tgFormatOrderItems(oid, {
      html: true,
      priceStyle: 'equals'
    });

    var tl = '';
    try {
      var tArr = JSON.parse(order.timeline_json);
      for (var t = 0; t < tArr.length; t++) {
        var jkt = Utilities.formatDate(new Date(tArr[t].at), 'Asia/Jakarta', 'dd-MM-yy HH:mm');
        tl += esc(jkt) + ' : ' + esc(tArr[t].status) + '\n';
      }
    } catch (e) { tl = '-'; }

    var infoPenerima = '';
    if (String(order.nama_penerima) !== String(order.nama) || String(order.no_hp_penerima) !== String(order.no_hp)) {
      infoPenerima = '🤝 Penerima: ' + esc(order.nama_penerima) + ' (' + esc(order.no_hp_penerima) + ')\n';
    }

    var msg = '📄 <b>Detail Order ' + oid + '</b>\n\n'
      + '👤 Nama: ' + esc(order.nama) + '\n'
      + '📞 HP: ' + esc(order.no_hp) + '\n'
      + infoPenerima
      + '📦 Metode: ' + esc(order.metode_kirim) + '\n'
      + '📅 Tgl Antar: ' + esc(order.tgl_antar) + '\n'
      + '📍 Alamat/Tujuan: ' + esc(order.alamat_snapshot) + '\n\n'
      + '<b>Daftar Item:</b>\n'
      + (itemsHtml || '(kosong)') + '\n'
      + '\n💰 Subtotal: Rp' + Number(order.subtotal).toLocaleString('id') + '\n'
      + '🚚 Ongkir: Rp' + Number(order.ongkir || 0).toLocaleString('id') + '\n'
      + '🎁 Poin: -Rp' + Number(order.poin_dipakai || 0).toLocaleString('id') + '\n'
      + '💳 <b>Total: Rp' + Number(order.total).toLocaleString('id') + '</b> (' + esc(order.metode_bayar) + ')\n\n'
      + '📝 Catatan: ' + esc(order.catatan_customer || '-') + '\n'
      + '⚙️ Catatan Admin: ' + esc(order.catatan_admin || '-') + '\n\n'
      + '<b>Status Saat Ini:</b> ' + esc(order.status) + '\n'
      + '<b>Timeline:</b>\n' + tl;
      
    var orderKeyboard = tgBuildOrderKeyboard(order);
    tgSendLong(chatId, msg, orderKeyboard.length ? { reply_markup: { inline_keyboard: orderKeyboard } } : null);
    return;
  }

  if (cmd === '/omzet') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /omzet'); return; }
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
    if (args.length !== 1 || (jenis !== 'harian' && jenis !== 'bulanan')) {
      tgSend(chatId, '⚠️ Format: /laporan harian | /laporan bulanan');
      return;
    }

    var orders = readAll('Orders');
    var now = new Date();
    // Normalisasi offset ke Asia/Jakarta 
    var jktOffset = 7 * 60 * 60 * 1000;
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    var reportNowJkt = new Date(utc + jktOffset);

    if (jenis === 'harian') {
      var daysData = {};
      var totalOrder = 0;
      var totalOmzet = 0;
      
      // Init 7 hari ke belakang (termasuk hari ini)
      for (var d = 0; d < 7; d++) {
        var dt = new Date(reportNowJkt.getTime() - (d * 24 * 60 * 60 * 1000));
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
      var currentDay = reportNowJkt.getDay(); // 0=Minggu, 1=Senin
      var diffToMonday = currentDay === 0 ? 6 : currentDay - 1;
      var currentMonday = new Date(reportNowJkt.getTime() - (diffToMonday * 24 * 60 * 60 * 1000));
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

  if (cmd === '/promo') {
    var promoSub = args.length ? String(args[0]).toLowerCase() : '';
    if (promoSub === 'list') {
      if (args.length !== 1) { tgSend(chatId, '⚠️ Format: /promo list'); return; }
      var promoRows = readAll('PromoCodes');
      if (promoRows.length === 0) { tgSend(chatId, 'ℹ️ Belum ada kode promo.'); return; }
      promoRows.sort(function(a, b) {
        return _promoNormalizeCode(a.kode).localeCompare(_promoNormalizeCode(b.kode));
      });
      var promoLines = ['🎟️ <b>DAFTAR PROMO</b>', ''];
      for (var pr = 0; pr < promoRows.length; pr++) {
        var normalizedCode = _promoNormalizeCode(promoRows[pr].kode) || '(KODE KOSONG)';
        var promoName = String(promoRows[pr].nama || '-');
        if (promoName.length > 60) promoName = promoName.substring(0, 57) + '...';
        var promoStart = tgDisplaySheetDate(promoRows[pr].mulai_at, false);
        var promoEnd = tgDisplaySheetDate(promoRows[pr].berakhir_at, false);
        var totalLimit = Number(promoRows[pr].limit_total) || 0;
        promoLines.push('<code>' + esc(normalizedCode) + '</code> · ' + esc(promoName) + ' · ' +
          (tgIsActiveValue(promoRows[pr].aktif) ? 'AKTIF' : 'NONAKTIF'));
        promoLines.push('Periode: ' + esc(promoStart) + ' s/d ' + esc(promoEnd) +
          ' · Limit total: ' + (totalLimit > 0 ? totalLimit : 'Tanpa batas'));
      }
      tgSendLong(chatId, promoLines.join('\n'));
      return;
    }

    if (promoSub === 'on' || promoSub === 'off') {
      if (args.length !== 2) { tgSend(chatId, '⚠️ Format: /promo ' + promoSub + ' &lt;KODE&gt;'); return; }
      var requestedCode = _promoNormalizeCode(args[1]);
      if (!requestedCode) { tgSend(chatId, '⚠️ Kode promo wajib diisi.'); return; }
      var desiredActive = promoSub === 'on';
      var promoWriteResult = withLock(function() {
        var rowsInsideLock = readAll('PromoCodes');
        var matches = [];
        for (var pwi = 0; pwi < rowsInsideLock.length; pwi++) {
          if (_promoNormalizeCode(rowsInsideLock[pwi].kode) === requestedCode) matches.push(rowsInsideLock[pwi]);
        }
        if (matches.length === 0) return { ok: false, code: 'PROMO_NOT_FOUND', error: 'Kode promo tidak ditemukan' };
        if (matches.length > 1) return { ok: false, code: 'PROMO_DUPLICATE', error: 'Kode promo duplikat; konfigurasi tidak valid' };
        var alreadyDesired = tgIsActiveValue(matches[0].aktif) === desiredActive;
        if (alreadyDesired) return { ok: true, data: { unchanged: true, promo: matches[0] } };
        var updated = updateRowById('PromoCodes', 'promo_id', matches[0].promo_id, {
          aktif: desiredActive ? 'aktif' : 'nonaktif',
          updated_at: nowJkt()
        });
        if (!updated) return { ok: false, code: 'WRITE_FAILED', error: 'Status promo gagal diperbarui' };
        return { ok: true, data: { unchanged: false, promo: matches[0] } };
      });
      if (!promoWriteResult || !promoWriteResult.ok) {
        tgSend(chatId, '❌ ' + esc(promoWriteResult && promoWriteResult.error ? promoWriteResult.error : 'Operasi promo gagal'));
        return;
      }
      var promoStateText = desiredActive ? 'aktif' : 'nonaktif';
      tgSend(chatId, promoWriteResult.data.unchanged
        ? 'ℹ️ Promo <code>' + esc(requestedCode) + '</code> sudah ' + promoStateText + '.'
        : '✅ Promo <code>' + esc(requestedCode) + '</code> sekarang ' + promoStateText + '.');
      return;
    }

    if (promoSub === 'stats') {
      if (args.length !== 2) { tgSend(chatId, '⚠️ Format: /promo stats &lt;KODE&gt;'); return; }
      var statsCode = _promoNormalizeCode(args[1]);
      var statsPromos = readAll('PromoCodes');
      var statsUsage = readAll('PromoUsage');
      var statsMatches = [];
      for (var sp = 0; sp < statsPromos.length; sp++) {
        if (_promoNormalizeCode(statsPromos[sp].kode) === statsCode) statsMatches.push(statsPromos[sp]);
      }
      if (statsMatches.length === 0) { tgSend(chatId, '❌ Kode promo tidak ditemukan.'); return; }
      if (statsMatches.length > 1) { tgSend(chatId, '❌ Kode promo duplikat; konfigurasi tidak valid.'); return; }
      var selectedPromo = statsMatches[0];
      var todayWib = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
      var usedCount = 0, todayCount = 0, cancelledCount = 0, actualDiscount = 0;
      var uniqueMembers = {}, lastUsedText = '', lastUsedMs = -1;
      for (var su = 0; su < statsUsage.length; su++) {
        if (String(statsUsage[su].promo_id) !== String(selectedPromo.promo_id)) continue;
        var usageStatus = String(statsUsage[su].status || '').trim().toUpperCase();
        if (usageStatus === 'DIBATALKAN') { cancelledCount++; continue; }
        if (usageStatus !== 'DIGUNAKAN') continue;
        usedCount++;
        if (_promoUsedDate(statsUsage[su].used_date) === todayWib) todayCount++;
        if (String(statsUsage[su].member_id || '')) uniqueMembers[String(statsUsage[su].member_id)] = true;
        actualDiscount += Number(statsUsage[su].promo_diskon_total) || 0;
        var usedText = String(statsUsage[su].used_at || '');
        var usedMs = new Date(usedText).getTime();
        if (!isNaN(usedMs) && usedMs > lastUsedMs) { lastUsedMs = usedMs; lastUsedText = usedText; }
        else if (lastUsedMs < 0 && usedText > lastUsedText) lastUsedText = usedText;
      }
      function displayLimit(value) { var num = Number(value) || 0; return num > 0 ? String(num) : 'Tanpa batas'; }
      function displayPeriod(value) { return tgDisplaySheetDate(value, false); }
      var statsLines = [
        '🎟️ <b>PROMO ' + esc(statsCode) + ' — ' + (tgIsActiveValue(selectedPromo.aktif) ? 'AKTIF' : 'NONAKTIF') + '</b>',
        'Dipakai: ' + usedCount,
        'Hari ini: ' + todayCount,
        'Dibatalkan: ' + cancelledCount,
        'Member unik: ' + Object.keys(uniqueMembers).length,
        'Diskon aktual: Rp' + actualDiscount.toLocaleString('id'),
        'Terakhir dipakai: ' + esc(lastUsedText ? tgDisplaySheetDate(lastUsedText, true) : '-'),
        'Limit: total ' + displayLimit(selectedPromo.limit_total) + ' · harian ' + displayLimit(selectedPromo.limit_harian) +
          ' · per member ' + displayLimit(selectedPromo.limit_per_member),
        'Periode: ' + esc(displayPeriod(selectedPromo.mulai_at)) + ' s/d ' + esc(displayPeriod(selectedPromo.berakhir_at))
      ];
      tgSendLong(chatId, statsLines.join('\n'));
      return;
    }

    tgSend(chatId, '⚠️ Format: /promo list | /promo on &lt;KODE&gt; | /promo off &lt;KODE&gt; | /promo stats &lt;KODE&gt;');
    return;
  }

  if (cmd === '/tutuptoko') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /tutuptoko'); return; }
    var closeStoreResult = withLock(function() {
      var rows = readAll('Settings');
      var current = null;
      for (var i = 0; i < rows.length; i++) if (String(rows[i].key) === 'TOKO_BUKA') { current = rows[i]; break; }
      if (!current) return { ok: false, code: 'SETTING_NOT_FOUND', error: 'Setting TOKO_BUKA tidak ditemukan' };
      if (!tgIsActiveValue(current.value)) return { ok: true, data: { unchanged: true } };
      if (!updateRowById('Settings', 'key', 'TOKO_BUKA', { value: '0' })) {
        return { ok: false, code: 'WRITE_FAILED', error: 'Status toko gagal diperbarui' };
      }
      return { ok: true, data: { unchanged: false } };
    });
    if (!closeStoreResult || !closeStoreResult.ok) { tgSend(chatId, '❌ ' + esc(closeStoreResult && closeStoreResult.error || 'Gagal menutup toko')); return; }
    if (!closeStoreResult.data.unchanged) {
      clearSettingsCache();
      CacheService.getScriptCache().remove('catalog_cache');
    }
    tgSend(chatId, closeStoreResult.data.unchanged ? 'ℹ️ Toko sudah dalam keadaan TUTUP.' : '🛑 Toko sudah TUTUP. Order baru akan ditolak.');
    return;
  }

  if (cmd === '/bukatoko') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /bukatoko'); return; }
    var openStoreResult = withLock(function() {
      var rows = readAll('Settings');
      var current = null;
      for (var i = 0; i < rows.length; i++) if (String(rows[i].key) === 'TOKO_BUKA') { current = rows[i]; break; }
      if (!current) return { ok: false, code: 'SETTING_NOT_FOUND', error: 'Setting TOKO_BUKA tidak ditemukan' };
      if (tgIsActiveValue(current.value)) return { ok: true, data: { unchanged: true } };
      if (!updateRowById('Settings', 'key', 'TOKO_BUKA', { value: '1' })) {
        return { ok: false, code: 'WRITE_FAILED', error: 'Status toko gagal diperbarui' };
      }
      return { ok: true, data: { unchanged: false } };
    });
    if (!openStoreResult || !openStoreResult.ok) { tgSend(chatId, '❌ ' + esc(openStoreResult && openStoreResult.error || 'Gagal membuka toko')); return; }
    if (!openStoreResult.data.unchanged) {
      clearSettingsCache();
      CacheService.getScriptCache().remove('catalog_cache');
    }
    tgSend(chatId, openStoreResult.data.unchanged ? 'ℹ️ Toko sudah dalam keadaan BUKA.' : '✅ Toko sudah BUKA.');
    return;
  }

  if (cmd === '/tutupslot' || cmd === '/bukaslot') {
    if (args.length !== 1) {
      tgSend(chatId, '⚠️ Format: ' + cmd + ' &lt;slot_id&gt;');
      return;
    }
    var slotId = args[0];
    var newStatus = cmd === '/tutupslot' ? 'nonaktif' : 'aktif';
    var slotWriteResult = withLock(function() {
      var slots = readAll('DeliverySlots');
      var selected = null;
      for (var i = 0; i < slots.length; i++) if (String(slots[i].slot_id) === slotId) { selected = slots[i]; break; }
      if (!selected) return { ok: false, code: 'SLOT_NOT_FOUND', error: 'Slot tidak ditemukan' };
      var desiredActive = newStatus === 'aktif';
      if (tgIsActiveValue(selected.status) === desiredActive) return { ok: true, data: { unchanged: true } };
      if (!updateRowById('DeliverySlots', 'slot_id', slotId, { status: newStatus })) {
        return { ok: false, code: 'WRITE_FAILED', error: 'Status slot gagal diperbarui' };
      }
      return { ok: true, data: { unchanged: false } };
    });
    if (!slotWriteResult || !slotWriteResult.ok) { tgSend(chatId, '❌ ' + esc(slotWriteResult && slotWriteResult.error || 'Operasi slot gagal')); return; }
    if (!slotWriteResult.data.unchanged) CacheService.getScriptCache().remove('catalog_cache');
    
    if (newStatus === 'nonaktif') {
      tgSend(chatId, (slotWriteResult.data.unchanged ? 'ℹ️' : '🛑') + ' Slot <code>' + esc(slotId) + '</code> sudah ditutup.');
    } else {
      tgSend(chatId, (slotWriteResult.data.unchanged ? 'ℹ️' : '✅') + ' Slot <code>' + esc(slotId) + '</code> sudah dibuka.');
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
        lines.push('<code>' + esc(p.product_id) + '</code> • ' + esc(p.nama) + ' • Rp' + Number(p.harga).toLocaleString('id') + ' • ' + stateStr);
      }
      if (prods.length > 50) lines.push('\n<i>(Menampilkan 50 baris pertama)</i>');
      tgSendLong(chatId, lines.join('\n'));
      return;
    }

    if (args.length !== 2) {
      tgSend(chatId, '⚠️ Format: /produk &lt;id&gt; on|off\nAtau ketik /produk untuk melihat daftar.');
      return;
    }
    var pid = args[0];
    var state = args[1].toLowerCase();
    if (state !== 'on' && state !== 'off') {
      tgSend(chatId, '⚠️ Format: /produk &lt;id&gt; on|off');
      return;
    }

    var tersedia = state === 'on' ? '1' : '0';
    var statusText = state === 'on' ? 'tersedia' : 'tidak tersedia';
    var productWriteResult = withLock(function() {
      var prods = readAll('Products');
      var prod = null;
      for (var i = 0; i < prods.length; i++) if (String(prods[i].product_id) === pid) { prod = prods[i]; break; }
      if (!prod) return { ok: false, code: 'PRODUCT_NOT_FOUND', error: 'Produk tidak ditemukan' };
      var currentlyAvailable = tgIsActiveValue(prod.tersedia);
      if (currentlyAvailable === (state === 'on')) return { ok: true, data: { unchanged: true, product: prod } };
      var patch = { tersedia: tersedia };
      if (prod.hasOwnProperty('updated_at')) patch.updated_at = nowJkt();
      if (!updateRowById('Products', 'product_id', pid, patch)) {
        return { ok: false, code: 'WRITE_FAILED', error: 'Ketersediaan produk gagal diperbarui' };
      }
      return { ok: true, data: { unchanged: false, product: prod } };
    });
    if (!productWriteResult || !productWriteResult.ok) { tgSend(chatId, '❌ ' + esc(productWriteResult && productWriteResult.error || 'Operasi produk gagal')); return; }
    if (!productWriteResult.data.unchanged) CacheService.getScriptCache().remove('catalog_cache');
    tgSend(chatId, (productWriteResult.data.unchanged ? 'ℹ️' : '📦') + ' Produk <b>' +
      esc(productWriteResult.data.product.nama) + '</b> ' + (productWriteResult.data.unchanged ? 'sudah ' : '→ ') + statusText);
    return;
  }


  if (cmd === '/ulasan') {
    if (args.length === 0) {
      var allReviews = readAll('Reviews');
      var allMembers = readAll('Members');
      var memberMap = {};
      for (var m = 0; m < allMembers.length; m++) {
        var memb = allMembers[m];
        var parts = String(memb.nama || '').trim().split(/\s+/);
        var ns = 'Pelanggan Setia';
        if (parts.length > 1) {
          ns = parts[0] + ' ' + parts[1].charAt(0).toUpperCase() + '.';
        } else if (parts.length === 1 && parts[0]) {
          ns = parts[0];
        }
        memberMap[String(memb.member_id)] = ns;
      }

      var filtered = [];
      for (var i = 0; i < allReviews.length; i++) {
        var st = String(allReviews[i].status);
        if (st === 'aktif' || st === 'hidden') {
          filtered.push(allReviews[i]);
        }
      }
      
      if (filtered.length === 0) {
        tgSend(chatId, 'Belum ada ulasan.');
        return;
      }
      
      filtered.sort(function(a, b) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      var limit = Math.min(filtered.length, 20);
      var lines = ['⭐ <b>Daftar Ulasan Terbaru</b>\n'];
      for (var j = 0; j < limit; j++) {
        var r = filtered[j];
        var uPreview = r.ulasan || '';
        if (uPreview.length > 60) uPreview = uPreview.substring(0, 60) + '...';
        var ns2 = memberMap[String(r.member_id)] || 'Pelanggan Setia';
        lines.push('<code>' + esc(r.review_id) + '</code> ★' + esc(r.rating) + ' • ' + esc(ns2) + ' • ' + esc(r.order_id) + '\n' + esc(uPreview) + '\nStatus: ' + esc(r.status) + '\n');
      }
      tgSendLong(chatId, lines.join('\n'));
      return;
    }
    
    var subCmd = args[0].toLowerCase();
    if (subCmd === 'hide' || subCmd === 'show') {
      if (args.length !== 2) {
        tgSend(chatId, '⚠️ Format: /ulasan ' + subCmd + ' &lt;review_id&gt;');
        return;
      }
      var rid = args[1];
      var newStatus = subCmd === 'hide' ? 'hidden' : 'aktif';
      var reviewWriteResult = withLock(function() {
        var reviews = readAll('Reviews');
        var rev = null;
        for (var ri = 0; ri < reviews.length; ri++) if (String(reviews[ri].review_id) === rid) { rev = reviews[ri]; break; }
        if (!rev) return { ok: false, code: 'REVIEW_NOT_FOUND', error: 'Ulasan tidak ditemukan' };
        if (String(rev.status) === newStatus) return { ok: true, data: { unchanged: true } };
        var patch = { status: newStatus };
        if (rev.hasOwnProperty('updated_at')) patch.updated_at = nowJkt();
        if (!updateRowById('Reviews', 'review_id', rid, patch)) {
          return { ok: false, code: 'WRITE_FAILED', error: 'Status ulasan gagal diperbarui' };
        }
        return { ok: true, data: { unchanged: false } };
      });
      if (!reviewWriteResult || !reviewWriteResult.ok) { tgSend(chatId, '❌ ' + esc(reviewWriteResult && reviewWriteResult.error || 'Operasi ulasan gagal')); return; }
      if (subCmd === 'hide') {
        tgSend(chatId, reviewWriteResult.data.unchanged ? 'ℹ️ Ulasan sudah disembunyikan.' : '🚫 Ulasan disembunyikan dari homepage.');
      } else {
        tgSend(chatId, reviewWriteResult.data.unchanged ? 'ℹ️ Ulasan sudah ditampilkan.' : '✅ Ulasan ditampilkan lagi.');
      }
      return;
    }
    tgSend(chatId, '⚠️ Format: /ulasan | /ulasan hide &lt;ID&gt; | /ulasan show &lt;ID&gt;');
    return;
  }

  if (cmd === '/clearcache') {
    if (args.length !== 0) { tgSend(chatId, '⚠️ Format: /clearcache'); return; }
    clearSettingsCache();
    CacheService.getScriptCache().remove('catalog_cache');
    tgSend(chatId, '🧹 Cache dibersihkan. Settings & katalog akan dibaca ulang.');
    return;
  }

  tgSend(chatId, '❓ Perintah tidak dikenal. Ketik /help untuk daftar perintah.');
}

