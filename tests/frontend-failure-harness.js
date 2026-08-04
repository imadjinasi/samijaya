const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('docs/app.js', 'utf8');
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function not found: ${name}`);
  let brace = source.indexOf('{', start), depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function: ${name}`);
}

const storage = new Map();
const context = {
  console, JSON, Date, Math, Number, String, Object, Array, RegExp, Promise, Error,
  setTimeout, clearTimeout,
  API_URL: 'https://example.invalid',
  session: { token: null, member: null },
  localStorage: { getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,String(v)), removeItem:k=>storage.delete(k) },
  sessionStorage: { getItem:k=>storage.get('s:'+k)||null, setItem:(k,v)=>storage.set('s:'+k,String(v)), removeItem:k=>storage.delete('s:'+k) },
  renderHeader() {}, showToast() {},
  AbortController: undefined,
  CATALOG_CACHE_KEY: 'sj_catalog_v2', CATALOG_CACHE_TTL_MS: 300000,
  _sessionExpiryHandled: false
};
vm.createContext(context);
for (const statement of [
  "var API_TIMEOUTS = { read: 60000, validation: 60000, mutation: 20000, createOrder: 30000, orderLookup: 15000 };",
  "var API_ACTION_CLASS = { requestOtp:'validation', verifyOtp:'validation', validatePromo:'validation', updateProfile:'mutation', addAddress:'mutation', updateAddress:'mutation', deleteAddress:'mutation', addressSetDefault:'mutation', submitReview:'mutation', deleteMyReview:'mutation', orderMarkSeen:'mutation', createOrder:'createOrder', getOrderByRequestId:'orderLookup' };",
  ...['isValidCatalogData','clearCatalogCache','getCatalogCache','setCatalogCache','ApiRequestError','apiTimeoutFor','classifyApiEnvelope','handleSessionExpired','api','apiFailureMessage'].map(functionSource)
]) vm.runInContext(statement, context);

assert.strictEqual(context.apiTimeoutFor('getCatalog', {}), 60000);
assert.strictEqual(context.apiTimeoutFor('verifyOtp', {}), 60000);
assert.strictEqual(context.apiTimeoutFor('validatePromo', {}), 60000);
assert.strictEqual(context.apiTimeoutFor('updateProfile', {}), 20000);
assert.strictEqual(context.apiTimeoutFor('createOrder', {}), 30000);
assert.strictEqual(context.apiTimeoutFor('getOrderByRequestId', {}), 15000);

const cartBar = {
  innerHTML: '<div>1 item • Rp35.000</div>',
  attributes: {},
  classList: {
    values: new Set(),
    add(value) { this.values.add(value); },
    remove(value) { this.values.delete(value); }
  },
  setAttribute(name, value) { this.attributes[name] = String(value); },
  removeAttribute(name) { delete this.attributes[name]; }
};
const cartBarContext = {
  cart: [], catalog: { products: [] },
  document: { getElementById:id => id === 'cart-bottom-bar' ? cartBar : null },
  getCartCount: () => 0, getCartTotal: () => 0, formatRupiah:value => `Rp${value}`
};
vm.createContext(cartBarContext);
vm.runInContext(functionSource('renderCartBottomBar'), cartBarContext);
cartBarContext.renderCartBottomBar();
assert.strictEqual(cartBar.innerHTML, '', 'empty cart leaves stale bottom-bar content');
assert(cartBar.classList.values.has('hidden'), 'empty cart bar is not hidden');
assert.strictEqual(cartBar.attributes['aria-hidden'], 'true', 'empty cart bar remains exposed to accessibility tree');

const validCatalog = { categories:[], products:[], pickupLocations:[], deliverySlots:[], holidays:[], settings:{}, campaigns:[], catalog_revision:'r1' };
storage.set('s:sj_catalog_v2', '{bad json');
assert.strictEqual(context.getCatalogCache(), null);
assert(!storage.has('s:sj_catalog_v2'), 'corrupt catalog cache not removed');
context.setCatalogCache(validCatalog);
assert.strictEqual(context.getCatalogCache().revision, 'r1');
storage.set('s:sj_catalog_v2', JSON.stringify({ data:validCatalog, revision:'r0', savedAt:Date.now()-400000 }));
assert.strictEqual(context.getCatalogCache().expired, true);

const addressContainer = { innerHTML:'', onclick:null, contains:()=>true };
let editedAddress = null, defaultAddressId = '', deletedAddressId = '';
const addressContext = {
  console, String, Array, Object,
  document: { getElementById:id => id === 'address-content' ? addressContainer : null },
  escHtml:value => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  showAddressForm:address => { editedAddress = address; },
  setDefaultAddress:id => { defaultAddressId = id; },
  deleteAddress:id => { deletedAddressId = id; }
};
vm.createContext(addressContext);
vm.runInContext(functionSource('renderMyAddressesList'), addressContext);
const maliciousAddress = { address_id:'ADDR-1', label:"Rumah O'Neil", detail:'<img src=x onerror=alert(1)>', alamat_snapshot:'Jalan Aman', is_default:false };
addressContext.renderMyAddressesList([maliciousAddress]);
assert(!/onclick\s*=/.test(addressContainer.innerHTML), 'address objects must not be embedded in inline handlers');
assert(!addressContainer.innerHTML.includes('<img src=x'), 'stored address HTML was not escaped');
assert(addressContainer.innerHTML.includes('data-address-action="edit"'));
function addressButton(action) { return { getAttribute:name => name === 'data-address-action' ? action : 'ADDR-1' }; }
addressContainer.onclick({ target:{ closest:()=>addressButton('edit') } });
assert.strictEqual(editedAddress, maliciousAddress);
addressContainer.onclick({ target:{ closest:()=>addressButton('default') } });
assert.strictEqual(defaultAddressId, 'ADDR-1');
addressContainer.onclick({ target:{ closest:()=>addressButton('delete') } });
assert.strictEqual(deletedAddressId, 'ADDR-1');

async function run() {
  context.fetch = () => new Promise(() => {});
  await assert.rejects(context.api('getCatalog', {}, { timeoutMs: 15 }), error => error.kind === 'TIMEOUT');
  await assert.rejects(context.api('validatePromo', {}, { timeoutMs: 15 }), error => error.kind === 'TIMEOUT');
  let calls = 0;
  context.fetch = () => { calls++; return new Promise(() => {}); };
  await assert.rejects(context.api('updateProfile', {}, { timeoutMs: 15 }), error => error.kind === 'TIMEOUT');
  assert.strictEqual(calls, 1, 'mutation retried automatically');
  context.fetch = () => Promise.resolve({ ok:true, text:()=>Promise.resolve('<html>') });
  await assert.rejects(context.api('getCatalog'), error => error.kind === 'NON_JSON');
  context.fetch = () => Promise.resolve({ ok:false, status:503, text:()=>Promise.resolve('{}') });
  await assert.rejects(context.api('getCatalog'), error => error.kind === 'HTTP');
  context.fetch = () => Promise.resolve({ ok:true, text:()=>Promise.resolve(JSON.stringify({ ok:false, code:'UNAUTHORIZED', error:'x' })) });
  storage.set('sj_cart','cart'); storage.set('sj_pending_order','pending');
  const unauthorized = await context.api('getMe');
  assert.strictEqual(unauthorized.error_category, 'SESSION');
  assert.strictEqual(storage.get('sj_cart'), 'cart');
  assert.strictEqual(storage.get('sj_pending_order'), 'pending');

  assert(source.includes("setPendingOrderStatus(pending, 'UNKNOWN')"), 'create-order timeout UNKNOWN regression');
  assert(source.includes("return checkPendingOrder()"), 'safe resend lookup-first regression');
  assert(source.includes('var requestId = ++_promoRequestSequence'), 'promo sequence regression');
  assert(source.includes('finally {') && source.includes('endOrderSubmissionBlocking()'), 'order cleanup regression');
  assert(source.includes('if (btn && btn.isConnected)'), 'button finally cleanup missing');

  const mapSource = fs.readFileSync('docs/map.js','utf8');
  assert(mapSource.includes('MAP_NETWORK_TIMEOUT_MS = 9000'));
  assert(mapSource.includes('_placeSearchSequence') && mapSource.includes('_reverseGeocodeSequence'));
  assert(mapSource.includes('generation !== _mapRequestGeneration'), 'map navigation stale guard missing');
  assert(source.includes('previousAlamat') && source.includes('alamat || previousAlamat'), 'geocoding failure erases previous address');
  assert(source.includes('startCampaignQueue') && source.includes('copyCampaignCode'), 'campaign regression');
  assert(source.includes("resContainer.classList.remove('co-hidden')") && source.includes("getElementById('co-search-results').classList.add('co-hidden')"), 'search results display regression (co-hidden)');
  for (const label of ['aria-label="Kurangi jumlah ', 'aria-label="Tambah jumlah ', ' dari keranjang"']) assert(source.includes(label), `cart accessibility label missing: ${label}`);
  assert(source.includes('checkout-layout') && source.includes('checkout-summary-column'), 'desktop checkout layout wrappers missing');
  const styleSource = fs.readFileSync('docs/style.css', 'utf8');
  assert(styleSource.includes('grid-template-columns: minmax(0, 1fr) minmax(320px, 380px)'), 'desktop checkout grid missing');
  assert(styleSource.includes('#cart-modal .modal-sheet') && styleSource.includes('width: min(420px, 100%)'), 'desktop cart drawer missing');
  console.log('frontend-failure-harness: all assertions passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
