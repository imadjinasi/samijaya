'use strict';
const $=id=>document.getElementById(id);
const groups={
  'Dashboard':['Dashboard'],
  'Pesanan':['Orders','OrderItems','OrderItemAddons'],
  'Katalog':['Products','Categories','ProductVariants','ProductAddons'],
  'Operasional':['PickupLocations','DeliverySlots','Holidays','Settings'],
  'Pemasaran':['PromoCodes','Campaigns','MessageTemplates'],
  'Lainnya':['Members','MemberAddresses','Reviews','PointHistory','PromoUsage','Logs']
};
const idFields={Products:'product_id',Categories:'kategori_id',ProductVariants:'variant_id',
  ProductAddons:'addon_id',PickupLocations:'lokasi_id',DeliverySlots:'slot_id',Holidays:'tanggal',
  PromoCodes:'promo_id',Campaigns:'campaign_id',MessageTemplates:'kode'};
let current='Dashboard',currentData=null;

function el(tag,text='',className='') {const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;}
function clear(node) {node.replaceChildren();return node;}
async function api(op,extra={}) {
  const response=await fetch('/admin/api',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({op,...extra})});
  const data=await response.json();
  if(!response.ok||!data.ok) throw new Error(data.code||'REQUEST_FAILED');
  return data.data||{};
}
function showApp(yes) {$('login').style.display=yes?'none':'block';$('app').style.display=yes?'block':'none';}
function message(text,target='drawer-message') {$(target).textContent=text;}
function openDrawer(title) {$('drawer-title').textContent=title;clear($('drawer-content'));message('');$('drawer').style.display='block';}
function closeDrawer() {$('drawer').style.display='none';}
function rowTable(rows,cols,onClick) {
  const wrap=el('div','','card scroll'),table=el('table'),thead=el('thead'),tr=el('tr');
  cols.forEach(c=>tr.append(el('th',c)));thead.append(tr);table.append(thead);
  const body=el('tbody');
  rows.forEach(row=>{const line=el('tr');if(onClick){line.tabIndex=0;line.style.cursor='pointer';line.addEventListener('click',()=>onClick(row));line.addEventListener('keydown',e=>{if(e.key==='Enter')onClick(row);});}
    cols.forEach(c=>{let value=row[c];if(typeof value==='object')value=JSON.stringify(value);line.append(el('td',value??''));});body.append(line);});
  table.append(body);wrap.append(table);return wrap;
}
function card(label,value) {const box=el('div','','card metric');box.append(el('strong',value),el('span',label));return box;}
async function dashboard() {
  const data=await api('dashboard');const root=clear($('content'));
  const metrics=el('div','','metrics');
  [['Pesanan hari ini',data.today_orders],['Pendapatan hari ini','Rp '+Number(data.today_revenue).toLocaleString('id-ID')],
    ['Pesanan aktif',data.active_orders],['Member',data.members],['Produk aktif',data.active_products]]
    .forEach(([label,value])=>metrics.append(card(label,value)));
  root.append(metrics,el('h2','Pesanan terbaru'));
  root.append(rowTable(data.recent_orders,['order_id','nama','total','status','created_at','metode_kirim'],r=>showOrder(r.order_id)));
}
function fieldInput(name,value,editable) {
  const label=el('label',name);const multiline=String(value??'').length>100||/json|deskripsi|isi|alamat|catatan|ulasan/i.test(name);
  const input=el(multiline?'textarea':'input');input.name=name;input.value=value??'';input.disabled=!editable;label.append(input);return label;
}
function showEditor(row,create=false) {
  const data=currentData, table=data.table;
  openDrawer((create?'Tambah ':'Edit ')+table);
  const form=el('form');
  if(create && idFields[table]) form.append(fieldInput(idFields[table],row[idFields[table]]||'',true));
  if(!create && idFields[table]) form.append(fieldInput(idFields[table],row[idFields[table]]||'',false));
  for(const name of data.write_fields) form.append(fieldInput(name,row[name]??'',true));
  const actions=el('div','','actions'),save=el('button','Simpan');save.type='submit';actions.append(save);form.append(actions);
  form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;message('Menyimpan…');
    const values=Object.fromEntries(new FormData(form).entries());
    try {await api('save',{table,source_row:create?null:row.source_row,values});closeDrawer();await tableView(table);} catch(err){message('Gagal: '+err.message);}
    finally{save.disabled=false;}});
  $('drawer-content').append(form);
}
function showReadOnly(row) {
  openDrawer(current+' — detail');
  const dl=el('div');for(const [name,value] of Object.entries(row)) {const label=el('strong',name),v=el('pre',value??'');dl.append(label,v);}
  $('drawer-content').append(dl);
}
async function showOrder(orderId) {
  openDrawer('Pesanan '+orderId);
  try {
    const data=await api('order',{order_id:orderId});const root=$('drawer-content');
    const summary=el('div');
    const keys=['order_id','nama','no_hp','tgl_antar','metode_kirim','metode_bayar','status','subtotal','ongkir','total','promo_code','poin_dipakai','alamat_snapshot','catatan_customer','catatan_admin','cancel_reason','created_at'];
    keys.forEach(k=>{if(data.order[k]!==undefined&&data.order[k]!=='')summary.append(el('strong',k),el('pre',data.order[k]));});
    root.append(summary,el('h3','Item'));
    root.append(rowTable(data.items,['product_id','nama_snapshot','variant_nama_snapshot','nama_axis_snapshot','harga_snapshot','qty','subtotal']));
    root.append(el('h3','Add-on'),rowTable(data.addons,['order_item_ref','nama_addon_snapshot','harga_snapshot']));
    if(!['SELESAI','BATAL'].includes(data.order.status)) {
      const form=el('form');form.append(el('h3','Ubah status'));
      const select=el('select');['DIPROSES','SIAP','DIANTAR','SELESAI','BATAL'].forEach(x=>{const opt=el('option',x);opt.value=x;select.append(opt);});select.name='status';form.append(select);
      const reason=el('textarea');reason.name='reason';reason.placeholder='Alasan pembatalan jika status BATAL';form.append(reason);
      const button=el('button','Simpan status');button.type='submit';form.append(button);
      form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;message('Memproses…');
        try {await api('status',{order_id:orderId,status:select.value,reason:reason.value});await showOrder(orderId);}
        catch(err){message('Gagal: '+err.message);}finally{button.disabled=false;}});root.append(form);
    }
  } catch(err){message('Gagal memuat pesanan: '+err.message);}
}
async function tableView(table,search='') {
  const data=await api('table',{table,search});currentData=data;
  const root=clear($('content')),bar=el('div','','toolbar'),input=el('input');input.type='search';input.placeholder='Cari data';input.value=search;
  let timer;input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>tableView(table,input.value),250);});bar.append(input);
  if(data.insertable){const add=el('button','Tambah');add.addEventListener('click',()=>showEditor({},true));bar.append(add);}
  root.append(bar);
  const preferred={Orders:['order_id','nama','tgl_antar','metode_kirim','total','status','created_at'],
    Products:['product_id','nama','harga','kategori_id','tersedia','status'],Members:['member_id','nama','no_hp','total_poin','status'],
    Settings:['key','value','keterangan'],Logs:['timestamp','tipe','ref_id','pesan']};
  const cols=preferred[table]||['source_row',...data.columns.slice(0,7)];
  root.append(rowTable(data.rows,cols,r=>table==='Orders'?showOrder(r.order_id):data.editable?showEditor(r):showReadOnly(r)));
  root.append(el('p',`${data.rows.length} baris ditampilkan`));
}
async function navigate(name) {
  current=name;$('page-title').textContent=name;$('subtitle').textContent=name==='Dashboard'?'Ringkasan operasional':'Data '+name;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  clear($('content')).append(el('p','Memuat…'));
  try{if(name==='Dashboard')await dashboard();else await tableView(name);}catch(err){clear($('content')).append(el('p','Gagal memuat: '+err.message));}
}
for(const [group,names] of Object.entries(groups)) {
  $('nav').append(el('h2',group));for(const name of names){const b=el('button',name);b.dataset.page=name;b.addEventListener('click',()=>navigate(name));$('nav').append(b);}
}
$('close-drawer').addEventListener('click',closeDrawer);
$('logout').addEventListener('click',async()=>{try{await api('logout');}catch(_){}showApp(false);});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();message('','login-message');
  try{await api('login',{password:$('password').value});$('password').value='';showApp(true);navigate('Dashboard');}
  catch(err){message(err.message==='RATE_LIMITED'?'Terlalu banyak percobaan. Coba nanti.':'Kata sandi salah atau layanan belum siap.','login-message');}});
api('session').then(()=>{showApp(true);navigate('Dashboard');}).catch(()=>showApp(false));
