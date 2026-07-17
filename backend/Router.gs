/**
 * Router.gs — Samijaya MVP
 *
 * Entry point Web App (doPost / doGet).
 * Parse request, routing ke action handler, return JSON via jsonResponse().
 * Tidak ada dependency eksternal.
 */

// ============================================================
// 1. doPost(e)
// ============================================================
/**
 * Entry point HTTP POST.
 * Body: JSON string {action, payload, token}.
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

    var action  = body.action || '';
    var payload = body.payload || {};
    var token   = body.token || '';

    // --- Action wajib ada ---
    if (!action) {
      return jsonResponse({
        ok: false,
        error: 'Action required',
        code: 'BAD_REQUEST'
      });
    }

    // --- Cek cabang Telegram webhook ---
    if (payload._telegram_secret &&
        payload._telegram_secret === getSetting('TELEGRAM_SECRET')) {
      var telegramResult = handleTelegramWebhook(payload);
      return jsonResponse(telegramResult);
    }

    // --- Routing action ---
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

      default:
        result = { ok: false, error: 'Unknown action: ' + action, code: 'UNKNOWN_ACTION' };
        break;
    }

    return jsonResponse(result);

  } catch (e) {
    log('ERROR', 'doPost', e.message, { stack: e.stack });
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

// ============================================================
// 3. handleTelegramWebhook(payload) — placeholder
// ============================================================
/**
 * Placeholder untuk Telegram webhook handler.
 * Akan diimplementasi di Fase 5 (Telegram.gs).
 *
 * @param  {Object} payload
 * @return {Object}
 */
function handleTelegramWebhook(payload) {
  return {
    ok: false,
    error: 'Telegram handler belum diimplementasi',
    code: 'NOT_IMPLEMENTED'
  };
}
