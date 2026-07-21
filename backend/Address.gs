/**
 * Address.gs — Samijaya MVP
 *
 * Kelola alamat member.
 */

// ============================================================
// 1. addressAdd(payload, token)
// ============================================================
/**
 * Tambah alamat baru untuk member.
 * payload: {label, detail, latitude, longitude}
 */
function addressAdd(payload, token) {
  var member = requireSession(token);
  if (!member) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid' };
  }

  var label = String(payload.label || '').trim();
  var detail = String(payload.detail || '').trim();
  var alamat_snapshot = String(payload.alamat_snapshot || '').trim();
  if (alamat_snapshot.length > 300) alamat_snapshot = alamat_snapshot.substring(0, 300);
  if (payload.latitude === undefined || payload.latitude === '' || payload.longitude === undefined || payload.longitude === '') {
    return { ok: false, code: 'BAD_REQUEST', error: 'Koordinat wajib diisi' };
  }
  
  var lat = Number(payload.latitude);
  var lng = Number(payload.longitude);

  if (label.length < 1 || label.length > 30) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Label alamat harus 1-30 karakter' };
  }
  if (detail.length < 1 || detail.length > 200) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Detail alamat harus 1-200 karakter' };
  }
  if (isNaN(lat) || isNaN(lng)) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Koordinat latitude/longitude tidak valid' };
  }

  var addressId = '';
  var lockResult = withLock(function() {
    addressId = genId('ADR');
    
    // Cek apakah member ini sudah punya alamat aktif (jika belum, jadikan ini default)
    var allAddresses = readAll('MemberAddresses');
    var activeCount = 0;
    for (var i = 0; i < allAddresses.length; i++) {
      if (String(allAddresses[i].member_id) === String(member.member_id) && String(allAddresses[i].status) === 'aktif') {
        activeCount++;
      }
    }
    var isDefault = (activeCount === 0) ? 1 : 0;

    // Kolom: address_id | member_id | label | detail | latitude | longitude | created_at | status | is_default
    var row = {
      address_id: addressId,
      member_id: member.member_id,
      label: label,
      detail: detail,
      alamat_snapshot: alamat_snapshot,
      latitude: lat,
      longitude: lng,
      created_at: nowJkt(),
      status: 'aktif',
      is_default: isDefault
    };
    appendRowObj('MemberAddresses', row);
    return { ok: true };
  });

  if (!lockResult || !lockResult.ok) {
    return lockResult;
  }

  return {
    ok: true,
    data: { address_id: addressId }
  };
}

// ============================================================
// 2. addressUpdate(payload, token)
// ============================================================
/**
 * Update alamat yang sudah ada.
 * payload: {address_id, label?, detail?, latitude?, longitude?}
 */
function addressUpdate(payload, token) {
  var member = requireSession(token);
  if (!member) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid' };
  }

  var addressId = String(payload.address_id || '').trim();
  if (!addressId) {
    return { ok: false, code: 'BAD_REQUEST', error: 'address_id dibutuhkan' };
  }

  var patch = {};
  if (payload.label !== undefined) {
    var label = String(payload.label).trim();
    if (label.length < 1 || label.length > 30) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Label alamat harus 1-30 karakter' };
    }
    patch.label = label;
  }
  if (payload.detail !== undefined) {
    var detail = String(payload.detail).trim();
    if (detail.length < 1 || detail.length > 200) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Detail alamat harus 1-200 karakter' };
    }
    patch.detail = detail;
  }
  if (payload.alamat_snapshot !== undefined) {
    var alamatSnapshot = String(payload.alamat_snapshot).trim();
    if (alamatSnapshot.length > 300) alamatSnapshot = alamatSnapshot.substring(0, 300);
    patch.alamat_snapshot = alamatSnapshot;
  }
  if (payload.latitude !== undefined) {
    if (payload.latitude === '') return { ok: false, code: 'BAD_REQUEST', error: 'Latitude wajib diisi' };
    var lat = Number(payload.latitude);
    if (isNaN(lat)) return { ok: false, code: 'BAD_REQUEST', error: 'Latitude tidak valid' };
    patch.latitude = lat;
  }
  if (payload.longitude !== undefined) {
    if (payload.longitude === '') return { ok: false, code: 'BAD_REQUEST', error: 'Longitude wajib diisi' };
    var lng = Number(payload.longitude);
    if (isNaN(lng)) return { ok: false, code: 'BAD_REQUEST', error: 'Longitude tidak valid' };
    patch.longitude = lng;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true }; // Nothing to update
  }

  var lockResult = withLock(function() {
    // Cari dulu apakah milik dia
    var addresses = readAll('MemberAddresses');
    var found = false;
    for (var i = 0; i < addresses.length; i++) {
      if (addresses[i].address_id === addressId) {
        if (addresses[i].member_id !== member.member_id) {
          return { ok: false, code: 'NOT_FOUND', error: 'Alamat tidak ditemukan' };
        }
        found = true;
        break;
      }
    }
    if (!found) {
      return { ok: false, code: 'NOT_FOUND', error: 'Alamat tidak ditemukan' };
    }

    updateRowById('MemberAddresses', 'address_id', addressId, patch);
    return { ok: true };
  });

  if (!lockResult || !lockResult.ok) {
    return lockResult;
  }

  return { ok: true };
}

// ============================================================
// 3. addressDelete(payload, token)
// ============================================================
/**
 * Soft delete alamat member.
 * payload: {address_id}
 */
function addressDelete(payload, token) {
  var member = requireSession(token);
  if (!member) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid' };
  }

  var addressId = String(payload.address_id || '').trim();
  if (!addressId) {
    return { ok: false, code: 'BAD_REQUEST', error: 'address_id dibutuhkan' };
  }

  var lockResult = withLock(function() {
    var addresses = readAll('MemberAddresses');
    var found = false;
    for (var i = 0; i < addresses.length; i++) {
      if (addresses[i].address_id === addressId) {
        if (addresses[i].member_id !== member.member_id) {
          return { ok: false, code: 'NOT_FOUND', error: 'Alamat tidak ditemukan' };
        }
        found = true;
        break;
      }
    }
    if (!found) return { ok: false, code: 'NOT_FOUND', error: 'Alamat tidak ditemukan' };

    updateRowById('MemberAddresses', 'address_id', addressId, { status: 'dihapus' });
    return { ok: true };
  });

  if (!lockResult || !lockResult.ok) {
    return lockResult;
  }

  return { ok: true };
}

// ============================================================
// 4. addressSetDefault(payload, token)
// ============================================================
/**
 * Set 1 alamat jadi default. Enforce: hanya 1 default per member.
 * payload: { address_id }
 */
function addressSetDefault(payload, token) {
  var session = requireSession(token);
  if (!session) return { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid' };
  var memberId = session.member_id;
  
  var addressId = payload.address_id;
  if (!addressId) return { ok: false, code: 'INVALID', error: 'address_id wajib' };
  
  var lock = LockService.getScriptLock();
  var lockResult = { ok: true };
  try {
    lock.waitLock(10000);
    
    var sheet = getSheet('MemberAddresses');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('address_id');
    var memberCol = headers.indexOf('member_id');
    var statusCol = headers.indexOf('status');
    var defaultCol = headers.indexOf('is_default');
    
    if (defaultCol === -1) {
      lockResult = { ok: false, code: 'NO_COLUMN', error: 'Kolom is_default belum ada. Jalankan migration.' };
      return lockResult;
    }
    
    // Verifikasi alamat milik member ini & aktif
    var targetFound = false;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][memberCol]) === String(memberId) && String(data[r][statusCol]) === 'aktif') {
        if (String(data[r][idCol]) === String(addressId)) {
          targetFound = true;
        }
      }
    }
    if (!targetFound) {
      lockResult = { ok: false, code: 'NOT_FOUND', error: 'Alamat tidak ditemukan atau bukan milik Anda' };
      return lockResult;
    }
    
    // Loop: set semua alamat member ini is_default=0, kecuali target=1
    for (var r2 = 1; r2 < data.length; r2++) {
      if (String(data[r2][memberCol]) === String(memberId) && String(data[r2][statusCol]) === 'aktif') {
        var newVal = (String(data[r2][idCol]) === String(addressId)) ? 1 : 0;
        sheet.getRange(r2 + 1, defaultCol + 1).setValue(newVal);
      }
    }
    
    lockResult = { ok: true, data: { address_id: addressId } };
  } catch (e) {
    lockResult = { ok: false, code: 'ERROR', error: String(e) };
  } finally {
    lock.releaseLock();
  }
  
  return lockResult;
}
