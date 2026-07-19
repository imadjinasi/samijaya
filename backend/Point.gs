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
