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
  var n = Math.floor(Math.random() * 1000000);
  var s = String(n);
  while (s.length < 6) s = '0' + s;
  return s;
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
  var lockResult = withLock(function () {
    var sessions = readAll('Sessions');
    var now = new Date();
    var oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);

    // Hitung berapa OTP untuk no_hp ini dalam 24 jam terakhir
    var countToday = 0;
    var lastSession = null;
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

    // Cek limit per hari
    if (countToday >= otpMaxPerDay) {
      return { ok: false, error: 'Batas OTP hari ini tercapai, coba besok', code: 'OTP_LIMIT' };
    }

    // Cek cooldown
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

    // Generate OTP & token
    otp = generateOtp();
    var token = uuid();
    var otpExpiresAt = new Date(now.getTime() + (otpValidMinutes * 60 * 1000)).toISOString();

    // Append row ke Sessions
    appendRowObj('Sessions', {
      token: token,
      no_hp: noHp,
      member_id: '',
      otp: otp,
      otp_expires_at: otpExpiresAt,
      otp_used: 0,
      session_expires_at: '',
      created_at: now.toISOString()
    });

    return { ok: true };
  });

  // Kalau lock gagal atau ada error di dalam lock
  if (!lockResult.ok) {
    return lockResult;
  }

  // Setelah lock release: kirim notifikasi (placeholder)
  sendOtpToAdminTelegram(noHp, nama, otp);

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

    // Cari row Sessions: no_hp match, otp match, otp_used == 0, otp_expires_at > sekarang
    var matchIdx = -1;
    var matchRow = null;
    for (var i = 0; i < sessions.length; i++) {
      var row = sessions[i];
      if (String(row.no_hp) !== noHp) continue;
      if (String(row.otp) !== inputOtp) continue;
      if (Number(row.otp_used) !== 0) continue;

      var expiresAt = new Date(row.otp_expires_at).getTime();
      if (expiresAt <= now.getTime()) continue;

      matchRow = row;
      matchIdx = i;
      break;
    }

    if (!matchRow) {
      return { ok: false, error: 'OTP salah atau sudah kedaluwarsa', code: 'OTP_INVALID' };
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
        created_at: now.toISOString(),
        status: 'aktif'
      };
      appendRowObj('Members', member);
    }
    
    // Tandai otp_used = 1 HANYA JIKA lolos pengecekan di atas
    updateRowById('Sessions', 'token', matchRow.token, { otp_used: 1 });

    // Update member_id dan session_expires_at di row Sessions
    var sessionExpiresAt = new Date(now.getTime() + (sessionValidDays * 24 * 60 * 60 * 1000)).toISOString();
    updateRowById('Sessions', 'token', matchRow.token, {
      member_id: member.member_id,
      session_expires_at: sessionExpiresAt
    });

    return {
      ok: true,
      data: {
        token: matchRow.token,
        member: member
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
      return members[m];
    }
  }

  // Anomali: session valid tapi member tidak ada
  log('ERROR', matchRow.member_id, 'Session valid tapi member tidak ditemukan', {
    token: token,
    member_id: matchRow.member_id
  });
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

  return {
    ok: true,
    data: {
      member: member,
      addresses: addresses
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
function sendOtpToAdminTelegram(no_hp, nama, otp) {
  var displayNama = nama || 'Customer';

  // Susun pesan untuk admin
  var pesan = '🔐 <b>OTP Request</b>\n'
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

  log('NOTIF', no_hp, 'OTP dikirim ke admin Telegram', { otp: otp, nama: nama });
}

