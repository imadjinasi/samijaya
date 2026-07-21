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
    var suppliedTelegramKey = '';
    try {
      suppliedTelegramKey = e && e.parameter ? String(e.parameter.tg_key || '') : '';
    } catch (_) {}

    // --- Parse body ---
    var body;
    try {
      body = JSON.parse(e && e.postData ? e.postData.contents : '');
    } catch (parseErr) {
      if (suppliedTelegramKey) {
        try { safeLog('ERROR', 'TG_WEBHOOK_REJECTED', '', { function: 'doPost', stage: 'json' }); } catch (_) {}
        return HtmlService.createHtmlOutput('ok');
      }
      return jsonResponse({
        ok: false,
        error: 'Invalid JSON',
        code: 'BAD_REQUEST'
      });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      if (suppliedTelegramKey) {
        try { safeLog('ERROR', 'TG_WEBHOOK_REJECTED', '', { function: 'doPost', stage: 'shape' }); } catch (_) {}
        return HtmlService.createHtmlOutput('ok');
      }
      return jsonResponse({ ok: false, error: 'Invalid JSON', code: 'BAD_REQUEST' });
    }

    // --- Deteksi Telegram update ---
    // Telegram mengirim update sebagai JSON body dengan property "update_id".
    // Frontend tidak pernah kirim "update_id", jadi ini dipakai untuk membedakan jalur.
    // NOTE: Apps Script Web App TIDAK meneruskan custom HTTP header dari POST,
    //   jadi verifikasi X-Telegram-Bot-Api-Secret-Token tidak mungkin di sini.
    //   Autentikasi memakai capability tg_key pada query URL webhook.
    //   setWebhook juga tetap kirim secret_token ke Telegram sebagai defense-in-depth.
    // PENTING: jalur ini HARUS SELALU return HTTP 200 agar Telegram tidak retry.
    if (body.update_id !== undefined) {
      var scriptProperties = PropertiesService.getScriptProperties();
      var currentTelegramKey = String(scriptProperties.getProperty('TELEGRAM_WEBHOOK_KEY') || '');
      var nextTelegramKey = String(scriptProperties.getProperty('TELEGRAM_WEBHOOK_KEY_NEXT') || '');
      var capabilityValid = !!suppliedTelegramKey &&
        ((!!currentTelegramKey && suppliedTelegramKey === currentTelegramKey) ||
         (!!nextTelegramKey && suppliedTelegramKey === nextTelegramKey));
      if (!capabilityValid) {
        try { safeLog('ERROR', 'TG_WEBHOOK_REJECTED', '', { function: 'doPost', stage: 'capability' }); } catch (_) {}
        return HtmlService.createHtmlOutput('ok');
      }
      // Validasi struktur: harus punya salah satu payload Telegram yang dikenal
      if (!body.message && !body.callback_query && !body.edited_message) {
        // update_id ada tapi tanpa payload valid → abaikan, tetap 200
        return HtmlService.createHtmlOutput('ok');
      }

      // --- Dedup best-effort: marker ditulis setelah handler sukses ---
      var updateId = String(body.update_id);
      var cacheKey = 'tg_upd_' + updateId;
      var cache = null;
      var alreadyDone = false;
      try {
        cache = CacheService.getScriptCache();
        alreadyDone = !!cache.get(cacheKey);
      } catch (cacheReadErr) {
        try { safeLog('ERROR', 'TG_DEDUP_CACHE_UNAVAILABLE', '', { function: 'doPost', stage: 'read' }); } catch (_) {}
      }
      if (alreadyDone) {
        // Update sudah diproses sebelumnya → skip
        return HtmlService.createHtmlOutput('ok');
      }
      // Marker DONE ditulis setelah handler mengembalikan sukses.

      // Proses handler — SELALU return 200 apa pun hasilnya
      try {
        var telegramResult = handleTelegramWebhook(body);
        if (telegramResult && telegramResult.ok) {
          try {
            if (cache) cache.put(cacheKey, 'DONE', 21600);
          } catch (cacheWriteErr) {
            try { safeLog('ERROR', 'TG_DEDUP_CACHE_UNAVAILABLE', '', { function: 'doPost', stage: 'write' }); } catch (_) {}
          }
        } else {
          try { safeLog('ERROR', 'TG_HANDLER_FAILED', '', { function: 'doPost', stage: 'handler', code: telegramResult && telegramResult.code }); } catch (_) {}
        }
      } catch (tgErr) {
        try { safeLog('ERROR', 'TG_HANDLER_FAILED', '', { function: 'doPost', stage: 'exception' }); } catch (_) {}
      }
      return HtmlService.createHtmlOutput('ok');
    }

    if (suppliedTelegramKey) {
      try { safeLog('ERROR', 'TG_WEBHOOK_REJECTED', '', { function: 'doPost', stage: 'shape' }); } catch (_) {}
      return HtmlService.createHtmlOutput('ok');
    }

    // --- Routing action biasa (dari frontend) ---
    var action  = body.action || '';
    var payload = body.payload || {};
    var token   = body.token || '';

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse({ ok: false, error: 'Payload tidak valid', code: 'BAD_REQUEST' });
    }

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
      case 'addressSetDefault':
        result = addressSetDefault(payload, token);
        break;

      case 'getSlotAvailability':
        result = orderGetSlotAvailability(payload);
        break;
      case 'createOrder':
        result = orderCreateOrder(payload, token);
        break;
      case 'getOrderByRequestId':
        result = orderGetByRequestId(payload, token);
        break;
      case 'validatePromo':
        result = promoValidateCode(payload, token);
        break;
      case 'getMyOrders':
        result = orderGetMyOrders(payload, token);
        break;
      case 'orderMarkSeen':
        result = orderMarkSeen(payload, token);
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
      case 'getPublicReviews':
        result = reviewGetPublic();
        break;

      default:
        result = { ok: false, error: 'Unknown action: ' + action, code: 'UNKNOWN_ACTION' };
        break;
    }

    return jsonResponse(result);

  } catch (err) {
    try { safeLog('ERROR', 'ROUTER_INTERNAL_ERROR', '', { function: 'doPost', stage: 'outer' }); } catch (_) {}
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
