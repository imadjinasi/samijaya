/**
 * Lock.gs — Samijaya MVP
 *
 * Wrapper untuk operasi tulis kritis (Orders, Sessions, PointHistory, kuota slot).
 * Menggunakan LockService.getScriptLock() dengan retry + exponential backoff.
 * Tidak ada dependency eksternal.
 */

// ============================================================
// 1. withLock(fn)
// ============================================================
/**
 * Jalankan fn() di dalam script lock.
 * Retry hingga 3 kali dengan backoff: 500ms, 1000ms, 2000ms.
 *
 * @param  {Function} fn — fungsi yang dijalankan di dalam lock
 * @return {Object} hasil dari fn(), atau {ok:false, ...} jika gagal
 */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  var backoffs = [500, 1000, 2000];
  var acquired = false;

  for (var i = 0; i < backoffs.length; i++) {
    acquired = lock.tryLock(backoffs[i]);
    if (acquired) break;
  }

  // Semua percobaan gagal → sistem sibuk
  if (!acquired) {
    return {
      ok: false,
      error: 'Sistem sedang sibuk, coba lagi',
      code: 'SIBUK_COBA_LAGI'
    };
  }

  // Lock berhasil didapat → jalankan fn
  try {
    return fn();
  } catch (e) {
    try { safeLog('ERROR', 'LOCK_CALLBACK_FAILED', '', { function: 'withLock', stage: 'callback' }); } catch (_) {}
    return {
      ok: false,
      error: 'Terjadi kesalahan sistem',
      code: 'INTERNAL'
    };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 2. testLock()
// ============================================================
/**
 * Tes withLock — sleep 2 detik di dalam lock, harus return {ok:true, data:'done'}.
 * Jalankan dari Apps Script editor.
 */
function testLock() {
  var result = withLock(function () {
    Utilities.sleep(2000);
    return { ok: true, data: 'done' };
  });
  Logger.log(result);
}
