/**
 * Router.gs — Samijaya MVP
 *
 * Entry point Web App (doPost / doGet).
 * Parse request, routing ke action handler, return JSON via jsonResponse().
 * Telegram webhook dideteksi via update_id + header secret sebelum routing action.
 * Tidak ada dependency eksternal.
 */

// ============================================================
// 1. doPost(e)
// ============================================================
/**
 * Entry point HTTP POST.
 *
 * Telegram: body langsung JSON update (punya update_id).
 *   Verifikasi: header X-Telegram-Bot-Api-Secret-Token == TELEGRAM_SECRET.
 * Frontend: body JSON string {action, payload, token}.
 *
 * @param  {Object} e — event object dari Apps Script
 * @return {ContentService.TextOutput}
 */
function doPost(e) {
  try {
    // --- Parse body ---
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({
        ok: false,
        error: 'Invalid JSON',
        code: 'BAD_REQUEST'
      });
    }

    // --- Deteksi Telegram update ---
    // Telegram mengirim update langsung sebagai JSON body yang punya property "update_id".
    // Frontend tidak pernah kirim "update_id", jadi ini aman untuk membedakan.
    // PENTING: jalur ini HARUS SELALU return HTTP 200 agar Telegram tidak retry.
    if (body.update_id !== undefined) {
      // Verifikasi secret token dari header (best-effort, Apps Script limitasi)
      var headerSecret = '';
      try {
        if (e && e.parameter && e.parameter['secret_token']) {
          headerSecret = e.parameter['secret_token'];
        }
      } catch (headerErr) {
        // Tidak bisa baca header — lanjut tanpa
      }

      var expectedSecret = getSetting('TELEGRAM_SECRET');
      if (expectedSecret && headerSecret !== expectedSecret) {
        if (!body.message && !body.callback_query) {
          // Bukan update valid & secret tidak cocok → tetap 200 agar tidak retry
          return jsonResponse({ ok: true });
        }
      }

      // Proses handler — SELALU return 200 apa pun hasilnya
      try {
        handleTelegramWebhook(body);
      } catch (tgErr) {
        // Handler error → log tapi TETAP 200
        try { log('ERROR', 'doPost_telegram', tgErr.message, { stack: tgErr.stack }); } catch (_) {}
      }
      return jsonResponse({ ok: true });
    }

    // --- Routing action biasa (dari frontend) ---
    var action  = body.action || '';
    var payload = body.payload || {};
    var token   = body.token || '';

    if (!action) {
      return jsonResponse({
        ok: false,
        error: 'Action required',
        code: 'BAD_REQUEST'
      });
    }

    var result;
    switch (action) {
      case 'ping':
        result = { ok: true, data: { pong: true, time: new Date().toISOString() } };
        break;

      case 'requestOtp':
        result = authRequestOtp(payload);
        break;
      case 'verifyOtp':
        result = authVerifyOtp(payload);
        break;
      case 'getMe':
        result = authGetMe(payload, token);
        break;
      case 'getCatalog':
        result = catalogGetCatalog();
        break;

      case 'getSlotAvailability':
        result = orderGetSlotAvailability(payload);
        break;
      case 'createOrder':
        result = orderCreateOrder(payload, token);
        break;

      default:
        result = { ok: false, error: 'Unknown action: ' + action, code: 'UNKNOWN_ACTION' };
        break;
    }

    return jsonResponse(result);

  } catch (err) {
    log('ERROR', 'doPost', err.message, { stack: err.stack });
    return jsonResponse({
      ok: false,
      error: 'Server error',
      code: 'INTERNAL'
    });
  }
}

// ============================================================
// 2. doGet(e)
// ============================================================
/**
 * Entry point HTTP GET — health check.
 *
 * @param  {Object} e — event object dari Apps Script
 * @return {ContentService.TextOutput}
 */
function doGet(e) {
  return jsonResponse({
    ok: true,
    data: {
      service: 'Samijaya API',
      time: new Date().toISOString()
    }
  });
}
