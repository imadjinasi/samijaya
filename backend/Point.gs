/**
 * Point.gs
 * Fungsi terkait poin member.
 */

function pointGetMyPoints(payload, token) {
  var member = requireSession(token);
  if (!member) {
    return { ok: false, code: "UNAUTHORIZED" };
  }

  var saldo = Number(member.total_poin) || 0;
  var histories = readAll('PointHistory');
  
  var myHistories = [];
  for (var i = 0; i < histories.length; i++) {
    if (String(histories[i].member_id) === String(member.member_id)) {
      myHistories.push({
        id: histories[i].id,
        order_id: histories[i].order_id || '',
        tipe: histories[i].tipe || '',
        jumlah: Number(histories[i].jumlah) || 0,
        saldo_akhir: Number(histories[i].saldo_akhir) || 0,
        keterangan: histories[i].keterangan || '',
        created_at: histories[i].created_at || ''
      });
    }
  }

  // Sort by created_at DESC (terbaru dulu)
  myHistories.sort(function(a, b) {
    var da = new Date(a.created_at).getTime();
    var db = new Date(b.created_at).getTime();
    return db - da; // DESC
  });

  // Batasi 30 riwayat
  myHistories = myHistories.slice(0, 30);

  return {
    ok: true,
    data: {
      saldo: saldo,
      riwayat: myHistories
    }
  };
}

/** Ensure satu mutasi saldo deterministik. Harus dipanggil di dalam script lock. */
function pointEnsureBalanceEvent(expected) {
  var histories = readAll('PointHistory');
  var exact = [];
  for (var i = 0; i < histories.length; i++) if (String(histories[i].id) === String(expected.id)) exact.push(histories[i]);
  if (exact.length > 1) return { ok: false, code: 'POINT_EVENT_DUPLICATE' };
  var event = exact.length ? exact[0] : null;
  var keys = ['id','member_id','order_id','tipe','jumlah','saldo_akhir','event_code','saldo_sebelum'];
  if (event) {
    for (var k = 0; k < keys.length; k++) {
      if (String(event[keys[k]] == null ? '' : event[keys[k]]) !== String(expected[keys[k]] == null ? '' : expected[keys[k]])) return { ok: false, code: 'POINT_EVENT_CONFLICT' };
    }
  } else {
    var pending = {};
    for (var p in expected) if (Object.prototype.hasOwnProperty.call(expected, p)) pending[p] = expected[p];
    pending.event_status = 'PENDING';
    pending.event_snapshot_json = JSON.stringify({ before: expected.saldo_sebelum, after: expected.saldo_akhir, amount: expected.jumlah });
    var written = appendRowsObj('PointHistory', [pending]);
    if (written.written !== 1) return { ok: false, code: 'POINT_EVENT_WRITE_FAILED' };
  }
  var members = readAll('Members');
  var member = null;
  for (var m = 0; m < members.length; m++) if (String(members[m].member_id) === String(expected.member_id)) member = members[m];
  if (!member) return { ok: false, code: 'POINT_MEMBER_NOT_FOUND' };
  var balance = transactionStrictInteger(member.total_poin, 0, 1000000000);
  if (balance === null) return { ok: false, code: 'POINT_BALANCE_INVALID' };
  if (balance === Number(expected.saldo_sebelum)) {
    if (!updateRowById('Members', 'member_id', expected.member_id, { total_poin: Number(expected.saldo_akhir) })) return { ok: false, code: 'POINT_BALANCE_WRITE_FAILED' };
  } else if (balance !== Number(expected.saldo_akhir)) {
    return { ok: false, code: 'POINT_BALANCE_CONFLICT' };
  }
  if (!updateRowById('PointHistory', 'id', expected.id, { event_status: 'APPLIED' })) return { ok: false, code: 'POINT_EVENT_FINALIZE_FAILED' };
  return { ok: true, existing: !!event, amount: Number(expected.jumlah) };
}
