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
    // Kolom: address_id | member_id | label | detail | latitude | longitude | created_at | status
    var row = {
      address_id: addressId,
      member_id: member.member_id,
      label: label,
      detail: detail,
      latitude: lat,
      longitude: lng,
      created_at: nowJkt(),
      status: 'aktif'
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
