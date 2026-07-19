/**
 * Router.gs — Samijaya MVP
 *
 * Entry point Web App (doPost / doGet).
 * Parse request, routing ke action handler, return JSON via jsonResponse().
 * Telegram webhook dideteksi via update_id + struktur body (tanpa header — GAS limitasi).
 * Tidak ada dependency eksternal.
 */

// ============================================================
// 1. doPost(e)
// ============================================================
/**
 * Entry point HTTP POST.
 *
 * Telegram: body langsung JSON update (punya update_id + message/callback_query).
 *   Verifikasi via struktur body, bukan header (GAS tidak expose POST headers).
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
    // Telegram mengirim update sebagai JSON body dengan property "update_id".
    // Frontend tidak pernah kirim "update_id", jadi ini aman untuk membedakan.
    // NOTE: Apps Script Web App TIDAK meneruskan custom HTTP header dari POST,
    //   jadi verifikasi X-Telegram-Bot-Api-Secret-Token tidak mungkin di sini.
    //   Verifikasi cukup via struktur body (update_id + shape valid).
    //   setWebhook tetap kirim secret_token ke Telegram sebagai best-practice.
    // PENTING: jalur ini HARUS SELALU return HTTP 200 agar Telegram tidak retry.
    if (body.update_id !== undefined) {
      // Validasi struktur: harus punya salah satu payload Telegram yang dikenal
      if (!body.message && !body.callback_query && !body.edited_message) {
        // update_id ada tapi tanpa payload valid → abaikan, tetap 200
        return HtmlService.createHtmlOutput('ok');
      }

      // --- Idempotency: cegah eksekusi ganda via update_id ---
      // Ditempatkan di Router (SEBELUM handler) agar meskipun handler crash,
      // retry berikutnya tetap di-skip karena cache sudah ter-set.
      var updateId = String(body.update_id);
      var cache = CacheService.getScriptCache();
      var cacheKey = 'tg_upd_' + updateId;
      if (cache.get(cacheKey)) {
        // Update sudah diproses sebelumnya → skip
        return HtmlService.createHtmlOutput('ok');
      }
      cache.put(cacheKey, '1', 600); // TTL 10 menit

      // Proses handler — SELALU return 200 apa pun hasilnya
      try {
        handleTelegramWebhook(body);
      } catch (tgErr) {
        try { log('ERROR', 'doPost_telegram', tgErr.message, { stack: tgErr.stack }); } catch (_) {}
      }
      return HtmlService.createHtmlOutput('ok');
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
      case 'updateProfile':
        result = authUpdateProfile(payload, token);
        break;
      case 'getMe':
        result = authGetMe(payload, token);
        break;
      case 'getCatalog':
        result = catalogGetCatalog();
        break;

      case 'addAddress':
        result = addressAdd(payload, token);
        break;
      case 'updateAddress':
        result = addressUpdate(payload, token);
        break;
      case 'deleteAddress':
        result = addressDelete(payload, token);
        break;

      case 'getSlotAvailability':
        result = orderGetSlotAvailability(payload);
        break;
      case 'createOrder':
        result = orderCreateOrder(payload, token);
        break;
      case 'getMyOrders':
        result = orderGetMyOrders(payload, token);
        break;
      case 'getMyPoints':
        result = pointGetMyPoints(payload, token);
        break;
      
      case 'submitReview':
        result = reviewSubmit(payload, token);
        break;
      case 'getMyReviewable':
        result = reviewGetMyReviewable(payload, token);
        break;
      case 'deleteMyReview':
        result = reviewDeleteMine(payload, token);
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
