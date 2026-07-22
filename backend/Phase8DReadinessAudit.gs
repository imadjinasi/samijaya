/**
 * Phase 8-D operational readiness audits. Every entry point in this file is
 * read-only: no cache, property, sheet, Telegram, webhook, or network writes.
 * Large workbooks should run the section entry points separately. A section
 * that cannot complete returns ERROR/UNVERIFIED and never silently passes.
 */
var PHASE8D_SAMPLE_LIMIT = 10;
var PHASE8D_LOG_ROW_LIMIT = 250;

var PHASE8D_LAUNCH_SCHEMA_GROUPS = [
  { code:'VARIANTS', sheets:{ ProductVariants:['variant_id','product_id','nama_axis','nama_varian','harga','urutan','aktif','created_at','updated_at'], OrderItems:['variant_id','variant_nama_snapshot','nama_axis_snapshot'] } },
  { code:'ADDONS', sheets:{ ProductAddons:['addon_id','product_id','nama_addon','harga','urutan','aktif','created_at','updated_at'], OrderItemAddons:['id','order_id','order_item_ref','addon_id','nama_addon_snapshot','harga_snapshot','created_at'], OrderItems:['order_item_ref'] } },
  { code:'ADDRESS_DEFAULT', sheets:{ MemberAddresses:['is_default'] } },
  { code:'ORDER_SEEN', sheets:{ Orders:['status_updated_at'], Members:['last_seen_orders_at'] } },
  { code:'PROMO', sheets:{ PromoCodes:['promo_id','kode','nama','aktif','min_subtotal','metode_kirim','limit_total','limit_per_member','limit_harian'], PromoUsage:['usage_id','promo_id','promo_code','order_id','member_id','status','used_at'] } },
  { code:'SESSION_SECURITY', sheets:{ Sessions:['otp_failed_attempts','otp_locked_at'] } },
  { code:'ORDER_IDEMPOTENCY', sheets:{ Orders:['client_request_id','request_fingerprint','commit_status','commit_stage','commit_error_code','commit_snapshot_json','committed_at'] } },
  { code:'TRANSACTION_RECOVERY', sheets:{ Orders:['transaction_status','transaction_stage','transaction_error_code','transaction_snapshot_json','cancelled_at','cancelled_by','cancel_reason'], PointHistory:['event_code','saldo_sebelum','event_status','event_snapshot_json'], Reviews:['request_fingerprint','updated_at'] } },
  { code:'CAMPAIGNS', sheets:{ Campaigns:['campaign_id','judul','deskripsi','gambar_file_id','gambar_url','link_url','kode_promo','tanggal_mulai','tanggal_selesai','urutan','status'] } },
  { code:'MEMBER_RELEASE_FIELDS', sheets:{ Members:['jenis_kelamin'] } }
];

function phase8DSafeReference(value) {
  var text = String(value == null ? '' : value).trim();
  if (/^(?:SJ\d{9}|PTH_ORDER_(?:REDEEM|REFUND|REWARD)_[A-Za-z0-9_-]{1,60}|REV_ORDER_[A-Za-z0-9_-]{1,60}|[A-Za-z]{1,12}_[A-Za-z0-9_-]{1,60})$/.test(text)) return text.substring(0, 80);
  var suffix = text.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
  return 'REF-' + (suffix || 'UNAVAILABLE');
}

function phase8DFinding(code, severity, count, samples, action, status) {
  var limited = [], findingCount = Number(count || 0);
  samples = samples || [];
  for (var i = 0; i < samples.length && i < PHASE8D_SAMPLE_LIMIT; i++) limited.push(phase8DSafeReference(samples[i]));
  return { code:code, severity:severity, status:findingCount === 0 ? 'VERIFIED' : (status || 'CONFLICT'), count:findingCount, samples:limited, sample_limited:samples.length > PHASE8D_SAMPLE_LIMIT, recommended_action:action };
}

function phase8DRunSection(code, fn) {
  try { return { code:code, status:'COMPLETED', findings:fn() || [] }; }
  catch (e) { return { code:code, status:'UNVERIFIED', findings:[phase8DFinding(code + '_ERROR','ERROR',1,[], 'Periksa schema/akses lalu jalankan ulang section ini.','UNVERIFIED')], error_code:String(e && e.message || e).substring(0,120) }; }
}

function auditPhase8DLaunchSchemaReadOnly() {
  var report = { ok:true, status:'VERIFIED', banners_required:false, groups:[], reference_id:phase8DSafeReference('SCHEMA_' + new Date().getTime()) };
  for (var g = 0; g < PHASE8D_LAUNCH_SCHEMA_GROUPS.length; g++) {
    var group = PHASE8D_LAUNCH_SCHEMA_GROUPS[g], missing = [], checked = [];
    try {
      for (var sheetName in group.sheets) if (Object.prototype.hasOwnProperty.call(group.sheets, sheetName)) {
        var headers = getSheetHeaders(sheetName), required = group.sheets[sheetName];
        checked.push(sheetName);
        for (var h = 0; h < required.length; h++) if (headers.indexOf(required[h]) === -1) missing.push(sheetName + '.' + required[h]);
      }
      var ok = missing.length === 0;
      report.groups.push({ code:group.code, status:ok ? 'VERIFIED' : 'REQUIRED', ok:ok, sheets:checked, missing_headers:missing.slice(0,PHASE8D_SAMPLE_LIMIT), missing_count:missing.length, sample_limited:missing.length > PHASE8D_SAMPLE_LIMIT });
      if (!ok) report.ok = false;
    } catch (e) {
      report.ok = false;
      report.groups.push({ code:group.code, status:'UNVERIFIED', ok:false, error_code:String(e && e.message || e).substring(0,120) });
    }
  }
  report.status = report.ok ? 'VERIFIED' : 'REVERIFY REQUIRED';
  return report;
}

function phase8DReadSnapshot(sheetNames) {
  var out = {};
  for (var i = 0; i < sheetNames.length; i++) out[sheetNames[i]] = readAll(sheetNames[i]);
  return out;
}
function phase8DIndex(rows, key) { var x={}; for(var i=0;i<rows.length;i++){var k=String(rows[i][key]||''); if(!x[k])x[k]=[]; x[k].push(rows[i]);} return x; }
function phase8DCommitted(o) { var c=String(o.commit_status||'').trim().toUpperCase(); return c==='' || c==='COMMITTED'; }

function auditPhase8DDuplicateIdsReadOnly() {
  var findings=[];
  for(var sheetName in SHEET_SCHEMA_REGISTRY)if(Object.prototype.hasOwnProperty.call(SHEET_SCHEMA_REGISTRY,sheetName)){
    var spec=SHEET_SCHEMA_REGISTRY[sheetName]; if(!spec.primary_id||!spec.unique)continue;
    try{var duplicates=schemaFindDuplicatePrimaryIds(sheetName); findings.push(phase8DFinding('DUPLICATE_PRIMARY_ID_'+sheetName.toUpperCase(),'CRITICAL',duplicates.length,duplicates,'Resolve duplicate primary IDs from evidence; do not auto-delete.'));}
    catch(e){findings.push(phase8DFinding('DUPLICATE_PRIMARY_ID_'+sheetName.toUpperCase()+'_ERROR','ERROR',1,[],'Fix access/schema and rerun this sheet check.','UNVERIFIED'));}
  }
  return findings;
}

function auditPhase8DOrdersReadOnly() {
  var d=phase8DReadSnapshot(['Orders','OrderItems','OrderItemAddons']), orders=d.Orders, oi=phase8DIndex(d.OrderItems,'order_id'), oa=phase8DIndex(d.OrderItemAddons,'order_id'), itemRefs=phase8DIndex(d.OrderItems,'order_item_ref'), ids={}, dup=[], creating=[], recovery=[], transaction=[], missing=[], orphan=[];
  for(var i=0;i<orders.length;i++){var o=orders[i], id=String(o.order_id||''); if(ids[id])dup.push(id); ids[id]=true; var cs=String(o.commit_status||'').toUpperCase(); if(cs==='CREATING')creating.push(id); if(cs==='RECOVERY_REQUIRED')recovery.push(id); var ts=String(o.transaction_status||'').toUpperCase(); if(ts==='PENDING'||ts==='RECOVERY_REQUIRED')transaction.push(id); if(phase8DCommitted(o)&&!(oi[id]||[]).length)missing.push(id);}
  for(var orderId in oi)if(Object.prototype.hasOwnProperty.call(oi,orderId)&&!ids[orderId])orphan.push(orderId);
  for(var addonOrder in oa)if(Object.prototype.hasOwnProperty.call(oa,addonOrder)){if(!ids[addonOrder])orphan.push(addonOrder); for(var a=0;a<oa[addonOrder].length;a++)if(!(itemRefs[String(oa[addonOrder][a].order_item_ref||'')]||[]).length)orphan.push(oa[addonOrder][a].id);}
  return [phase8DFinding('DUPLICATE_ORDER_ID','CRITICAL',dup.length,dup,'Resolve duplicate primary IDs from evidence; do not delete rows.'),phase8DFinding('ORDER_CREATING','ERROR',creating.length,creating,'Reconcile commit snapshot and child rows.'),phase8DFinding('ORDER_RECOVERY_REQUIRED','CRITICAL',recovery.length,recovery,'Freeze affected order and reconcile snapshot.'),phase8DFinding('ORDER_TRANSACTION_UNRESOLVED','CRITICAL',transaction.length,transaction,'Reconcile transaction snapshot, ledger, member and promo state.'),phase8DFinding('COMMITTED_ORDER_CHILD_MISSING','CRITICAL',missing.length,missing,'Verify expected items against commit snapshot.'),phase8DFinding('ORDER_CHILD_ORPHAN','ERROR',orphan.length,orphan,'Trace orphan child references; do not auto-delete.')];
}

function auditPhase8DLedgerReadOnly() {
  var d=phase8DReadSnapshot(['Members','Orders','PointHistory']), members=phase8DIndex(d.Members,'member_id'), ledgers=phase8DIndex(d.PointHistory,'id'), byMember=phase8DIndex(d.PointHistory,'member_id'), missing=[], duplicate=[], conflict=[], balances=[], legacy=[];
  for(var i=0;i<d.Orders.length;i++){var o=d.Orders[i], oid=String(o.order_id||''); if(!phase8DCommitted(o))continue; var redeem=Number(o.poin_dipakai||0); if(redeem>0){var rid='PTH_ORDER_REDEEM_'+oid, rr=ledgers[rid]||[]; if(!rr.length)missing.push(oid); if(rr.length>1)duplicate.push(rid); if(rr.length===1&&(String(rr[0].member_id)!==String(o.member_id)||Number(rr[0].jumlah)!==-redeem))conflict.push(rid); if(String(o.status)==='BATAL'){var fid='PTH_ORDER_REFUND_'+oid, fr=ledgers[fid]||[]; if(!fr.length)missing.push(oid); if(fr.length>1)duplicate.push(fid); if(fr.length===1&&(String(fr[0].member_id)!==String(o.member_id)||Number(fr[0].jumlah)!==redeem))conflict.push(fid);}} }
  for(var m=0;m<d.Members.length;m++){var member=d.Members[m], rows=byMember[String(member.member_id)]||[], hasLegacy=false, latest=null; for(var p=0;p<rows.length;p++){if(!String(rows[p].event_code||''))hasLegacy=true; latest=rows[p];} if(hasLegacy)legacy.push(member.member_id); else if(latest&&Number(latest.saldo_akhir)!==Number(member.total_poin))balances.push(member.member_id);}
  for(var key in ledgers)if(Object.prototype.hasOwnProperty.call(ledgers,key)&&ledgers[key].length>1)duplicate.push(key);
  return [phase8DFinding('POINT_EVENT_MISSING','CRITICAL',missing.length,missing,'Reconcile order snapshot and deterministic ledger event.'),phase8DFinding('POINT_EVENT_DUPLICATE','CRITICAL',duplicate.length,duplicate,'Inspect duplicate deterministic IDs; do not delete automatically.'),phase8DFinding('POINT_EVENT_CONFLICT','CRITICAL',conflict.length,conflict,'Compare event fields with immutable order snapshot.'),phase8DFinding('POINT_BALANCE_MISMATCH','CRITICAL',balances.length,balances,'Reconcile member balance against deterministic ledger chain.'),phase8DFinding('POINT_LEGACY_AMBIGUOUS','WARNING',legacy.length,legacy,'Manual evidence is required; do not claim balance validity.','UNVERIFIED')];
}

function auditPhase8DPromoReviewsReadOnly() {
  var d=phase8DReadSnapshot(['Members','Orders','PromoUsage','Reviews','PointHistory']), orders=phase8DIndex(d.Orders,'order_id'), usages=phase8DIndex(d.PromoUsage,'order_id'), reviews=phase8DIndex(d.Reviews,'order_id'), ledger=phase8DIndex(d.PointHistory,'id'), promoDup=[],promoMismatch=[],reviewDup=[],reviewMismatch=[],rewardMismatch=[];
  for(var oid in usages)if(Object.prototype.hasOwnProperty.call(usages,oid)){var us=usages[oid], os=orders[oid]||[]; if(us.length>1)promoDup.push(oid); for(var u=0;u<us.length;u++)if(os.length!==1||String(us[u].member_id)!==String(os[0].member_id)||String(us[u].promo_code||'').toUpperCase()!==String(os[0].promo_code||'').toUpperCase())promoMismatch.push(oid);}
  for(var roid in reviews)if(Object.prototype.hasOwnProperty.call(reviews,roid)){var rs=reviews[roid], ord=orders[roid]||[]; if(rs.length>1)reviewDup.push(roid); for(var r=0;r<rs.length;r++)if(ord.length!==1||String(rs[r].member_id)!==String(ord[0].member_id))reviewMismatch.push(roid); if(ord.length===1&&String(ord[0].status)==='SELESAI'){var expected=Number(ord[0].poin_earn_final||0), ev=ledger['PTH_ORDER_REWARD_'+roid]||[]; if(expected>0&&(ev.length!==1||Number(ev[0].jumlah)!==expected||String(ev[0].member_id)!==String(ord[0].member_id)))rewardMismatch.push(roid);}}
  return [phase8DFinding('PROMO_USAGE_DUPLICATE','CRITICAL',promoDup.length,promoDup,'Reconcile the single expected usage row.'),phase8DFinding('PROMO_USAGE_MISMATCH','CRITICAL',promoMismatch.length,promoMismatch,'Compare usage to committed order promo snapshot.'),phase8DFinding('REVIEW_DUPLICATE','CRITICAL',reviewDup.length,reviewDup,'Identify the canonical review from evidence.'),phase8DFinding('REVIEW_RELATION_MISMATCH','CRITICAL',reviewMismatch.length,reviewMismatch,'Reconcile review ownership with order/member.'),phase8DFinding('REVIEW_REWARD_MISMATCH','CRITICAL',rewardMismatch.length,rewardMismatch,'Reconcile review and deterministic reward event.')];
}

function auditPhase8DFinancialReadOnly() {
  var d=phase8DReadSnapshot(['Members','Orders']), expected={}, unverifiable={}, revenue=0, mismatch=[];
  for(var i=0;i<d.Orders.length;i++){var o=d.Orders[i]; if(!phase8DCommitted(o)||String(o.status)!=='SELESAI')continue; var mid=String(o.member_id||''); revenue+=Number(o.subtotal||0); expected[mid]=(expected[mid]||0)+Number(o.subtotal||0); if(!String(o.transaction_status||''))unverifiable[mid]=true;}
  for(var m=0;m<d.Members.length;m++){var id=String(d.Members[m].member_id||''); if(unverifiable[id])continue; if(Number(d.Members[m].total_belanja||0)!==Number(expected[id]||0))mismatch.push(id);}
  var uv=Object.keys(unverifiable);
  return { findings:[phase8DFinding('MEMBER_SPEND_MISMATCH','CRITICAL',mismatch.length,mismatch,'Reconcile completed committed orders against member total_belanja.'),phase8DFinding('MEMBER_SPEND_LEGACY_UNVERIFIED','WARNING',uv.length,uv,'Establish legacy opening balance/evidence before validation.','UNVERIFIED')], metrics:{ committed_completed_revenue:revenue, revenue_definition:'sum subtotal for committed/legacy-committed SELESAI only' } };
}

function auditPhase8DSessionsReadOnly() {
  var rows=readAll('Sessions'), abnormal=[]; for(var i=0;i<rows.length;i++){var attempts=Number(rows[i].otp_failed_attempts||0), locked=!!rows[i].otp_locked_at, used=String(rows[i].otp_used).toLowerCase(); if(attempts<0||attempts>5||(locked&&attempts<5)||(used==='1'||used==='true')&&locked)abnormal.push(rows[i].token);}
  return [phase8DFinding('SESSION_OTP_LOCK_ANOMALY','ERROR',abnormal.length,abnormal,'Inspect session state without exposing token or OTP.')];
}

function auditPhase8DRecentLogsReadOnly() {
  var sheet=getSheet('Logs'), lastRow=sheet.getLastRow(), lastCol=sheet.getLastColumn(); if(lastRow<=1)return [phase8DFinding('RECENT_OPERATIONAL_ERRORS','INFO',0,[],'Continue monitoring.')];
  var headers=sheet.getRange(1,1,1,lastCol).getValues()[0], count=Math.min(PHASE8D_LOG_ROW_LIMIT,lastRow-1), start=lastRow-count+1, values=sheet.getRange(start,1,count,lastCol).getValues(), ti=headers.indexOf('tipe'), pi=headers.indexOf('pesan'), ri=headers.indexOf('ref_id'), errors=[];
  for(var i=0;i<values.length;i++)if(String(values[i][ti]||'').toUpperCase()==='ERROR'||/RECOVERY|FAILED|CONFLICT|REJECTED/.test(String(values[i][pi]||'').toUpperCase()))errors.push(values[i][ri]||values[i][pi]);
  var f=phase8DFinding('RECENT_OPERATIONAL_ERRORS',errors.length?'ERROR':'INFO',errors.length,errors,'Review latest bounded log window and correlate repeated event codes.'); f.rows_examined=count; f.window_limited=(lastRow-1)>count; if(f.window_limited)f.status='UNVERIFIED'; return [f];
}

function auditPhase8DPropertiesReadOnly() {
  var props=PropertiesService.getScriptProperties(), spreadsheet=String(props.getProperty('SPREADSHEET_ID')||''), current=String(props.getProperty('TELEGRAM_WEBHOOK_KEY')||''), next=String(props.getProperty('TELEGRAM_WEBHOOK_KEY_NEXT')||''), revision=String(props.getProperty('CATALOG_CACHE_REVISION')||'');
  return { SPREADSHEET_ID:{ status:spreadsheet?'present':'missing' }, TELEGRAM_WEBHOOK_KEY:{ status:current?'present':'missing' }, TELEGRAM_WEBHOOK_KEY_NEXT:{ status:next?'present':'missing' }, CATALOG_CACHE_REVISION:{ status:revision?'present':'missing', format_valid:revision?/^\d{10,}-[a-z0-9]{4,}$/i.test(revision):false, severity:(!revision||!/^\d{10,}-[a-z0-9]{4,}$/i.test(revision))?'WARNING':'INFO' } };
}

function auditPhase8DReadinessReadOnly() {
  var report={ ok:true, status:'VERIFIED', reference_id:phase8DSafeReference('AUDIT_'+new Date().getTime()), runtime_note:'Run section entry points separately for large workbooks; incomplete sections never count as PASS.', sections:{} };
  report.sections.launch_schema=phase8DRunSection('LAUNCH_SCHEMA',function(){var x=auditPhase8DLaunchSchemaReadOnly(); if(!x.ok)report.ok=false; return [x];});
  report.sections.duplicate_ids=phase8DRunSection('DUPLICATE_IDS',auditPhase8DDuplicateIdsReadOnly);
  report.sections.orders=phase8DRunSection('ORDERS',auditPhase8DOrdersReadOnly);
  report.sections.ledger=phase8DRunSection('LEDGER',auditPhase8DLedgerReadOnly);
  report.sections.promo_reviews=phase8DRunSection('PROMO_REVIEWS',auditPhase8DPromoReviewsReadOnly);
  report.sections.financial=phase8DRunSection('FINANCIAL',function(){var x=auditPhase8DFinancialReadOnly(); report.metrics=x.metrics; return x.findings;});
  report.sections.sessions=phase8DRunSection('SESSIONS',auditPhase8DSessionsReadOnly);
  report.sections.logs=phase8DRunSection('LOGS',auditPhase8DRecentLogsReadOnly);
  report.sections.properties=phase8DRunSection('PROPERTIES',function(){var p=auditPhase8DPropertiesReadOnly(); if(p.SPREADSHEET_ID.status==='missing')report.ok=false; return [p];});
  for(var key in report.sections)if(Object.prototype.hasOwnProperty.call(report.sections,key)){var s=report.sections[key]; if(s.status!=='COMPLETED')report.ok=false; for(var i=0;i<s.findings.length;i++){var finding=s.findings[i]; if(!finding)continue; if(finding.status==='UNVERIFIED')report.ok=false; if((finding.severity==='CRITICAL'||finding.severity==='ERROR')&&Number(finding.count||0)>0)report.ok=false;}}
  report.status=report.ok?'VERIFIED':'REVERIFY REQUIRED'; return report;
}
