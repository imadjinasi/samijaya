/**
 * Auth.gs — Samijaya MVP
 *
 * Fase 2: Otentikasi OTP manual + sesi.
 * Fungsi: authRequestOtp, authVerifyOtp, requireSession, authGetMe.
 * Tidak ada dependency eksternal.
 */

// ============================================================
// HELPERS
// ============================================================

/**
 * Normalisasi nomor HP Indonesia.
 * Strip semua non-digit.
 * - "0..." → "62..."
 * - "8..." → "628..."
 * - "62..." → tetap
 * Validasi: harus diawali "62", panjang 10-15 digit.
 *
 * @param  {string} s — input nomor HP
 * @return {string|null} nomor ternormalisasi, atau null jika invalid
 */
function normalizePhone(s) {
  if (!s) return null;

  // Strip semua non-digit
  var digits = String(s).replace(/\D/g, '');

  // Konversi awalan
  if (digits.indexOf('0') === 0) {
    digits = '62' + digits.substring(1);
  } else if (digits.indexOf('8') === 0) {
    digits = '62' + digits;
  }
  // Kalau sudah "62..." → biarkan

  // Validasi: harus mulai "62", panjang 10-15 digit
  if (digits.indexOf('62') !== 0) return null;
  if (digits.length < 10 || digits.length > 15) return null;

  return digits;
}

/**
 * Generate OTP 6 digit random ("000000" - "999999"), pad zero.
 *
 * @return {string} OTP 6 digit
 */
function generateOtp() {
  var acceptedLimit = 4294000000; // floor(2^32 / 1,000,000) * 1,000,000
  for (var attempt = 0; attempt < 20; attempt++) {
    var entropy = Utilities.getUuid() + Utilities.getUuid();
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      entropy,
      Utilities.Charset.UTF_8
    );
    if (!digest || digest.length < 4) continue;
    var sample = 0;
    for (var i = 0; i < 4; i++) {
      var byteValue = digest[i];
      if (byteValue < 0) byteValue += 256;
      sample = sample * 256 + byteValue;
    }
    if (sample >= acceptedLimit) continue;
    var otpNumber = sample % 1000000;
    var otpString = String(otpNumber);
    while (otpString.length < 6) otpString = '0' + otpString;
    return otpString;
  }
  throw new Error('OTP_GENERATION_FAILED');
}

// ============================================================
// 1. authRequestOtp(payload)
// ============================================================
/**
 * Request OTP untuk nomor HP.
 * Input: {no_hp, nama}
 *
 * @param  {Object} payload — {no_hp, nama}
 * @return {Object} response {ok, data/error/code}
 */
function authRequestOtp(payload) {
  var noHp = normalizePhone(payload.no_hp);
  if (!noHp) {
    return { ok: false, error: 'Nomor HP tidak valid', code: 'BAD_PHONE' };
  }

  var nama = payload.nama || '';
  var otpMaxPerDay = Number(getSetting('OTP_MAX_PER_DAY')) || 5;
  var otpResendCooldown = Number(getSetting('OTP_RESEND_COOLDOWN_MINUTES')) || 2;
  var otpValidMinutes = Number(getSetting('OTP_VALID_MINUTES')) || 30;

  var otp;
  var isResend = false;
  var lockResult = withLock(function () {
    var sessions = readAll('Sessions');
    var now = new Date();
    var oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);

    // Hitung berapa OTP untuk no_hp ini dalam 24 jam terakhir
    var countToday = 0;
    var lastSession = null;
    var activeSession = null;
    for (var i = 0; i < sessions.length; i++) {
      if (String(sessions[i].no_hp) !== noHp) continue;

      var createdAt = new Date(sessions[i].created_at).getTime();
      if (createdAt >= oneDayAgo) {
        countToday++;
      }
      // Cari session terakhir untuk no_hp ini (created_at terbaru)
      if (!lastSession || createdAt > new Date(lastSession.created_at).getTime()) {
        lastSession = sessions[i];
      }
    }

    // Hanya row terbaru yang boleh menjadi OTP aktif. OTP locked tidak boleh
    // membuat row lama dipakai ulang sebagai resend.
    if (lastSession && Number(lastSession.otp_used) === 0 &&
        !String(lastSession.otp_locked_at || '').trim() &&
        new Date(lastSession.otp_expires_at).getTime() > now.getTime()) {
      activeSession = lastSession;
    }

    // Cek cooldown TETAP (untuk mencegah spam request)
    if (lastSession) {
      var lastCreated = new Date(lastSession.created_at).getTime();
      var cooldownEnd = lastCreated + (otpResendCooldown * 60 * 1000);
      if (cooldownEnd > now.getTime()) {
        var waitSeconds = Math.ceil((cooldownEnd - now.getTime()) / 1000);
        return {
          ok: false,
          error: 'Tunggu ' + waitSeconds + ' detik sebelum minta ulang',
          code: 'OTP_COOLDOWN',
          data: { wait_seconds: waitSeconds }
        };
      }
    }

    // Kalau SUDAH ADA OTP aktif, jangan buat baru
    if (activeSession) {
      otp = String(activeSession.otp).replace(/^'/, "");
      isResend = true;
      var expiresAtObj = new Date(activeSession.otp_expires_at);
      var hh = String(expiresAtObj.getHours()).padStart(2, '0');
      var mm = String(expiresAtObj.getMinutes()).padStart(2, '0');
      return {
        ok: true,
        data: {
          message: 'OTP sudah ada, admin akan kirim ulang via WhatsApp, berlaku hingga ' + hh + ':' + mm
        }
      };
    }

    // Cek limit per hari HANYA JIKA perlu buat OTP baru
    if (countToday >= otpMaxPerDay) {
      return { ok: false, error: 'Batas OTP hari ini tercapai, coba besok', code: 'OTP_LIMIT' };
    }

    // Generate OTP & token
    otp = generateOtp();
    var token = uuid();
    var otpExpiresAt = new Date(now.getTime() + (otpValidMinutes * 60 * 1000)).toISOString();

    // Append row ke Sessions
    appendRowObj('Sessions', {
      token: token,
      no_hp: noHp,
      member_id: '',
      otp: "'" + otp,
      otp_expires_at: otpExpiresAt,
      otp_used: 0,
      session_expires_at: '',
      created_at: nowJkt(),
      otp_failed_attempts: 0,
      otp_locked_at: ''
    });

    return { ok: true };
  });

  // Kalau lock gagal atau ada error di dalam lock
  if (!lockResult.ok) {
    return lockResult;
  }

  // Setelah lock release: kirim notifikasi (placeholder)
  sendOtpToAdminTelegram(noHp, nama, otp, isResend);

  if (lockResult.data && lockResult.data.message) {
    return lockResult; // resend
  }

  var otpValidMinutesDisplay = Number(getSetting('OTP_VALID_MINUTES')) || 30;
  return {
    ok: true,
    data: {
      message: 'OTP akan dikirim admin via WhatsApp, berlaku ' + otpValidMinutesDisplay + ' menit'
    }
  };
}

// ============================================================
// 2. authVerifyOtp(payload)
// ============================================================
/**
 * Verifikasi OTP dan buat sesi.
 * Input: {no_hp, otp, nama}
 *
 * @param  {Object} payload — {no_hp, otp, nama}
 * @return {Object} response {ok, data/error/code}
 */
function authVerifyOtp(payload) {
  var noHp = normalizePhone(payload.no_hp);
  if (!noHp) {
    return { ok: false, error: 'Nomor HP tidak valid', code: 'BAD_PHONE' };
  }

  var inputOtp = String(payload.otp || '');
  if (!/^\d{6}$/.test(inputOtp)) {
    return { ok: false, error: 'Format OTP salah', code: 'BAD_OTP' };
  }

  var nama = payload.nama || '';
  var sessionValidDays = Number(getSetting('SESSION_VALID_DAYS')) || 7;

  return withLock(function () {
    var sessions = readAll('Sessions');
    var now = new Date();

    // Selalu evaluasi OTP terbaru untuk nomor ini. Jangan mencari row lama
    // berdasarkan kecocokan kode karena counter melekat pada satu OTP.
    var matchRow = null;
    var matchCreatedMs = -1;
    for (var i = 0; i < sessions.length; i++) {
      var row = sessions[i];
      if (String(row.no_hp) !== noHp) continue;
      var createdMs = new Date(row.created_at).getTime();
      if (isNaN(createdMs)) createdMs = i;
      if (!matchRow || createdMs >= matchCreatedMs) {
        matchRow = row;
        matchCreatedMs = createdMs;
      }
    }

    if (!matchRow) {
      return { ok: false, error: 'Kode OTP tidak valid', code: 'OTP_INVALID' };
    }
    if (String(matchRow.otp_locked_at || '').trim()) {
      return { ok: false, error: 'OTP tidak dapat digunakan. Silakan minta OTP baru.', code: 'OTP_LOCKED' };
    }
    if (Number(matchRow.otp_used) !== 0 || new Date(matchRow.otp_expires_at).getTime() <= now.getTime()) {
      return { ok: false, error: 'Kode OTP tidak valid', code: 'OTP_INVALID' };
    }

    var storedOtp = String(matchRow.otp).replace(/^'/, '');
    if (storedOtp !== inputOtp) {
      var failedAttempts = Math.max(0, Number(matchRow.otp_failed_attempts) || 0) + 1;
      var attemptPatch = { otp_failed_attempts: failedAttempts };
      if (failedAttempts >= 5) attemptPatch.otp_locked_at = nowJkt();
      if (!updateRowById('Sessions', 'token', matchRow.token, attemptPatch)) {
        throw new Error('OTP_ATTEMPT_UPDATE_FAILED');
      }
      if (failedAttempts >= 5) {
        return { ok: false, error: 'OTP tidak dapat digunakan. Silakan minta OTP baru.', code: 'OTP_LOCKED' };
      }
      return { ok: false, error: 'Kode OTP tidak valid', code: 'OTP_INVALID' };
    }

    // Cek apakah member sudah terdaftar
    var members = readAll('Members');
    var member = null;
    for (var m = 0; m < members.length; m++) {
      if (String(members[m].no_hp) === noHp) {
        member = members[m];
        break;
      }
    }

    if (!member) {
      // Member baru — nama wajib
      if (!nama || !String(nama).trim()) {
        return { ok: false, error: 'Nama wajib untuk pendaftaran', code: 'NAMA_REQUIRED' };
      }

      member = {
        member_id: genId('MBR'),
        nama: String(nama).trim(),
        no_hp: noHp,
        tgl_lahir: '',
        email: '',
        total_poin: 0,
        total_belanja: 0,
        created_at: nowJkt(),
        status: 'aktif',
        last_seen_orders_at: nowJkt()
      };
      appendRowObj('Members', member);
    }
    if (String(member.status || '').trim().toLowerCase() !== 'aktif') {
      return { ok: false, error: 'Sesi tidak valid atau kedaluwarsa', code: 'UNAUTHORIZED' };
    }
    
    // Tandai used dan bind session dalam satu update row.
    var sessionExpiresAt = new Date(now.getTime() + (sessionValidDays * 24 * 60 * 60 * 1000)).toISOString();
    if (!updateRowById('Sessions', 'token', matchRow.token, {
      otp_used: 1,
      member_id: member.member_id,
      session_expires_at: sessionExpiresAt
    })) {
      throw new Error('OTP_SESSION_BIND_FAILED');
    }

    // Ambil alamat aktif untuk member ini
    var allAddresses = readAll('MemberAddresses');
    var addresses = [];
    for (var a = 0; a < allAddresses.length; a++) {
      var addr = allAddresses[a];
      if (String(addr.member_id) === String(member.member_id) && String(addr.status) === 'aktif') {
        addresses.push(addr);
      }
    }

    return {
      ok: true,
      data: {
        token: matchRow.token,
        member: member,
        addresses: addresses
      }
    };
  });
}

// ============================================================
// 3. requireSession(token)
// ============================================================
/**
 * Validasi sesi dari token.
 * Bukan action publik — dipanggil dari action lain.
 *
 * @param  {string} token — session token
 * @return {Object|null} object member, atau null jika sesi tidak valid
 */
function requireSession(token) {
  if (!token) return null;

  var sessions = readAll('Sessions');
  var now = new Date();

  var matchRow = null;
  for (var i = 0; i < sessions.length; i++) {
    var row = sessions[i];
    if (String(row.token) !== String(token)) continue;
    if (Number(row.otp_used) !== 1) continue;

    var sessionExp = new Date(row.session_expires_at).getTime();
    if (isNaN(sessionExp) || sessionExp <= now.getTime()) continue;

    matchRow = row;
    break;
  }

  if (!matchRow) return null;

  // Ambil member dari Members via member_id
  var members = readAll('Members');
  for (var m = 0; m < members.length; m++) {
    if (String(members[m].member_id) === String(matchRow.member_id)) {
      var mem = members[m];
      if (String(mem.status || '').trim().toLowerCase() !== 'aktif') return null;
      if (mem.tgl_lahir) {
        if (Object.prototype.toString.call(mem.tgl_lahir) === '[object Date]') {
          mem.tgl_lahir = Utilities.formatDate(mem.tgl_lahir, 'Asia/Jakarta', 'yyyy-MM-dd');
        } else if (typeof mem.tgl_lahir === 'string' && mem.tgl_lahir.indexOf('T') !== -1) {
          mem.tgl_lahir = mem.tgl_lahir.split('T')[0];
        }
      }
      return mem;
    }
  }

  // Anomali: session valid tapi member tidak ada
  try { safeLog('ERROR', 'SESSION_MEMBER_NOT_FOUND', '', { function: 'requireSession', stage: 'member_lookup' }); } catch (_) {}
  return null;
}

// ============================================================
// 4. authGetMe(payload, token)
// ============================================================
/**
 * Ambil data member + alamat aktif berdasarkan token sesi.
 *
 * @param  {Object} payload — (tidak dipakai, untuk konsistensi signature)
 * @param  {string} token   — session token, dilewatkan dari Router
 * @return {Object} response {ok, data/error/code}
 */
function authGetMe(payload, token) {
  var member = requireSession(token);
  if (!member) {
    return { ok: false, error: 'Sesi tidak valid atau kedaluwarsa', code: 'UNAUTHORIZED' };
  }

  // Baca alamat member aktif
  var allAddresses = readAll('MemberAddresses');
  var addresses = [];
  for (var i = 0; i < allAddresses.length; i++) {
    var addr = allAddresses[i];
    if (String(addr.member_id) === String(member.member_id) && String(addr.status) === 'aktif') {
      addresses.push(addr);
    }
  }

  var lastSeenOrdersAt = _orderSeenTimestampString(member.last_seen_orders_at);
  var lastSeenMs = _orderSeenTimestampMs(lastSeenOrdersAt);
  var hasUnseenOrderUpdates = false;

  // last_seen kosong dianggap sudah melihat semua agar data lama tidak memunculkan dot massal.
  if (lastSeenMs !== null) {
    var allOrders = readAll('Orders');
    for (var o = 0; o < allOrders.length; o++) {
      if (String(allOrders[o].member_id) !== String(member.member_id)) continue;
      var statusUpdatedMs = _orderSeenTimestampMs(allOrders[o].status_updated_at);
      if (statusUpdatedMs !== null && statusUpdatedMs > lastSeenMs) {
        hasUnseenOrderUpdates = true;
        break;
      }
    }
  }

  member.last_seen_orders_at = lastSeenOrdersAt;
  member.has_unseen_order_updates = hasUnseenOrderUpdates;

  return {
    ok: true,
    data: {
      member: member,
      addresses: addresses,
      has_unseen_order_updates: hasUnseenOrderUpdates
    }
  };
}

/**
 * Parse timestamp sheet untuk perbandingan indikator update order.
 * Format canonical proyek (yyyy-MM-dd HH:mm:ss) diperlakukan sebagai WIB.
 */
function _orderSeenTimestampMs(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var dateMs = value.getTime();
    return isNaN(dateMs) ? null : dateMs;
  }

  var str = String(value).trim();
  var canonical = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(str);
  var parsed = canonical
    ? Date.parse(canonical[1] + '-' + canonical[2] + '-' + canonical[3] + 'T' +
        canonical[4] + ':' + canonical[5] + ':' + canonical[6] + '+07:00')
    : Date.parse(str);
  return isNaN(parsed) ? null : parsed;
}

function _orderSeenTimestampString(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}

// ============================================================
// 4.1. authUpdateProfile(payload, token)
// ============================================================
/**
 * Update profil member yang sedang login.
 *
 * @param  {Object} payload — {nama, tgl_lahir, jenis_kelamin, email}
 * @param  {string} token   — session token
 * @return {Object} response {ok, data/error/code}
 */
function authUpdateProfile(payload, token) {
  var member = requireSession(token);
  if (!member) {
    return { ok: false, error: 'Sesi tidak valid atau kedaluwarsa', code: 'UNAUTHORIZED' };
  }

  // Validasi field
  var patch = {};
  
  if (payload.nama !== undefined) {
    var nama = String(payload.nama).trim();
    if (nama.length < 1 || nama.length > 60) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Nama harus 1-60 karakter' };
    }
    patch.nama = nama;
  }

  if (payload.tgl_lahir !== undefined) {
    var tgl = String(payload.tgl_lahir).trim();
    if (tgl !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(tgl)) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Format tanggal lahir tidak valid (YYYY-MM-DD)' };
    }
    patch.tgl_lahir = tgl;
  }

  if (payload.jenis_kelamin !== undefined) {
    var jk = String(payload.jenis_kelamin).trim();
    if (jk !== '' && jk !== 'Laki-laki' && jk !== 'Perempuan') {
      return { ok: false, code: 'BAD_REQUEST', error: 'Jenis kelamin tidak valid' };
    }
    patch.jenis_kelamin = jk;
  }

  if (payload.email !== undefined) {
    var email = String(payload.email).trim();
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Format email tidak valid' };
    }
    patch.email = email;
  }

  // Update
  if (Object.keys(patch).length > 0) {
    var result = withLock(function() {
      // Refresh member dari DB di dalam lock untuk memastikan data paling baru (walau optional)
      var updated = updateRowById('Members', 'member_id', member.member_id, patch);
      if (!updated) {
        throw new Error('Gagal update row Member');
      }
      return updated;
    });
    
    // Gabung hasil patch ke object member untuk response
    for (var k in patch) {
      member[k] = patch[k];
    }
  }

  return {
    ok: true,
    data: {
      member: member
    }
  };
}

// ============================================================
// 5. sendOtpToAdminTelegram(no_hp, nama, otp)
// ============================================================
/**
 * Kirim notifikasi OTP ke admin via Telegram.
 * Pesan berisi info customer + tombol inline URL "Kirim OTP via WhatsApp".
 *
 * @param {string} no_hp — nomor HP ternormalisasi (format 62xxx)
 * @param {string} nama  — nama customer (bisa kosong)
 * @param {string} otp   — OTP 6 digit
 */
function sendOtpToAdminTelegram(no_hp, nama, otp, isResend) {
  var displayNama = nama || 'Customer';
  var statusText = isResend ? ' (ulang)' : '';

  // Susun pesan untuk admin
  var pesan = '🔐 <b>OTP Request</b>' + statusText + '\n'
    + 'Nama: ' + displayNama + '\n'
    + 'No HP: ' + no_hp + '\n'
    + 'OTP: <code>' + otp + '</code>';

  // Susun teks WhatsApp dari template OTP
  var waText = fillTemplate('OTP', { NAMA: displayNama, OTP: otp });
  var waUrl  = waLink(no_hp, waText);

  // Kirim ke semua admin dengan tombol inline URL
  tgSendToAdmins(pesan, {
    reply_markup: {
      inline_keyboard: [[
        { text: '📲 Kirim OTP via WhatsApp', url: waUrl }
      ]]
    }
  });

  try { safeLog('NOTIF', 'OTP_NOTIFICATION_SENT', '', { function: 'sendOtpToAdminTelegram', stage: 'telegram' }); } catch (_) {}
}
