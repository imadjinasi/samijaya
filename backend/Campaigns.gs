/** Campaign popup publik untuk katalog. */
function campaignParseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  var text = String(value).trim();
  if (!text) return null;
  var match = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:\D.*)?$/.exec(text);
  if (match) return campaignBuildDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:\D.*)?$/.exec(text);
  if (match) return campaignBuildDate(Number(match[3]), Number(match[2]), Number(match[1]));
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function campaignBuildDate(year, month, day) {
  var result = new Date(year, month - 1, day);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) return null;
  return result;
}

/** Tanggal kosong/gagal parse tidak membatasi; rentang valid bersifat inklusif. */
function campaignsReadActive() {
  var rows = readAll('Campaigns');
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row.status || '').trim().toLowerCase() !== 'aktif') continue;
    var starts = campaignParseDate(row.tanggal_mulai);
    var ends = campaignParseDate(row.tanggal_selesai);
    if (starts && today.getTime() < starts.getTime()) continue;
    if (ends && today.getTime() > ends.getTime()) continue;
    row.tanggal_mulai = starts ? Utilities.formatDate(starts, 'Asia/Jakarta', 'yyyy-MM-dd') : '';
    row.tanggal_selesai = ends ? Utilities.formatDate(ends, 'Asia/Jakarta', 'yyyy-MM-dd') : '';
    result.push(row);
  }
  result.sort(function(a, b) {
    return ((Number(a.urutan) || 0) - (Number(b.urutan) || 0)) ||
      String(a.campaign_id).localeCompare(String(b.campaign_id));
  });
  return result;
}
