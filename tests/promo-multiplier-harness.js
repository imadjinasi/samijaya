const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const context = {
  console, JSON, Date, Math, Number, String, Boolean, Object, Array, RegExp,
  isNaN, isFinite, parseInt,
  Utilities: { formatDate:(_value,_zone,format) => format === 'EEE' ? 'MON' : (format === 'HH:mm' ? '10:00' : '2026-08-04') }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/Util.gs', 'utf8'), context, { filename:'backend/Util.gs' });
vm.runInContext(fs.readFileSync('backend/Promo.gs', 'utf8'), context, { filename:'backend/Promo.gs' });
context.getSetting = key => key === 'POINT_RATE_RP' ? '1000' : '0';
context.safeLog = () => true;

function basePromo(overrides={}) {
  return {
    promo_id:'PROMO-1', kode:'TEST', nama:'Promo Test', aktif:'aktif',
    min_subtotal:0, metode_kirim:'', limit_total:0, limit_per_member:0, limit_harian:0,
    multiplier_poin:1, bonus_poin:0,
    ...overrides
  };
}

function baseContext(overrides={}) {
  return {
    subtotal:30000, ongkir:0, pakai_poin:false, saldo_poin:0,
    line_items:[{ product_id:'P1', kategori_id:'K1', subtotal:30000, qty:3, addons:[{ addon_id:'A1', harga:5000 }] }],
    ...overrides
  };
}

function validated(promo) {
  const result = context._promoValidateConfig(promo);
  assert.strictEqual(result.ok, true, result.error);
  return result.data;
}

// Add-on-only promo is a valid effect and kelipatan follows parent item qty.
let promo = basePromo({
  diskon_addon_ids:'A1', diskon_addon_tipe:'NOMINAL', diskon_addon_nilai:2000,
  diskon_addon_kelipatan:true
});
let result = context._promoCalculateDiscount(promo, validated(promo), baseContext());
assert.strictEqual(result.diskon_produk, 6000);

promo = basePromo({
  diskon_addon_ids:'A1', diskon_addon_tipe:'NOMINAL', diskon_addon_nilai:2000,
  diskon_addon_kelipatan:false
});
result = context._promoCalculateDiscount(promo, validated(promo), baseContext());
assert.strictEqual(result.diskon_produk, 2000);

// Product NOMINAL multiplies by qty; diskon_produk_max remains a PERSEN-only cap.
promo = basePromo({
  diskon_produk_ids:'P1', diskon_produk_tipe:'NOMINAL', diskon_produk_nilai:4000,
  diskon_produk_max:5000, diskon_produk_kelipatan:'ya'
});
result = context._promoCalculateDiscount(promo, validated(promo), baseContext());
assert.strictEqual(result.diskon_produk, 12000);

promo.diskon_produk_kelipatan = false;
result = context._promoCalculateDiscount(promo, validated(promo), baseContext());
assert.strictEqual(result.diskon_produk, 4000);

// PERSEN is already proportional to the eligible subtotal, so the flag is ignored.
promo = basePromo({
  diskon_produk_ids:'P1', diskon_produk_tipe:'PERSEN', diskon_produk_nilai:10,
  diskon_produk_kelipatan:true
});
result = context._promoCalculateDiscount(promo, validated(promo), baseContext());
assert.strictEqual(result.diskon_produk, 3000);

// Add-on percentage cap applies per add-on unit before qty multiplication.
promo = basePromo({
  diskon_addon_ids:'A1', diskon_addon_tipe:'PERSEN', diskon_addon_nilai:50,
  diskon_addon_max:1000, diskon_addon_kelipatan:true
});
result = context._promoCalculateDiscount(promo, validated(promo), baseContext());
assert.strictEqual(result.diskon_produk, 3000);

assert.strictEqual(context._promoValidateConfig(basePromo()).code, 'PROMO_CONFIG_INVALID');
assert.strictEqual(context._promoValidateConfig(basePromo({
  diskon_produk_ids:'P1', diskon_produk_tipe:'NOMINAL', diskon_produk_nilai:1000,
  diskon_produk_kelipatan:'kadang'
})).code, 'PROMO_CONFIG_INVALID');

const setupContext = { console, Logger:{log(){}}, PropertiesService:{}, SpreadsheetApp:{} };
vm.createContext(setupContext);
vm.runInContext(fs.readFileSync('backend/Setup.gs','utf8'), setupContext, { filename:'backend/Setup.gs' });
const promoHeaders = Array.from(setupContext.SHEET_DEFS.find(def=>def[0]==='PromoCodes')[1]);
const additiveHeaders = ['diskon_produk_kelipatan','required_addon_ids','diskon_addon_ids','diskon_addon_tipe','diskon_addon_nilai','diskon_addon_max','diskon_addon_kelipatan'];
assert.strictEqual(promoHeaders.length,44);
assert.deepStrictEqual(promoHeaders.slice(-7),additiveHeaders);
for (const header of additiveHeaders) assert(fs.readFileSync('CONTRACT.md','utf8').includes(header), `Contract missing ${header}`);

console.log('promo-multiplier-harness: all assertions passed');
