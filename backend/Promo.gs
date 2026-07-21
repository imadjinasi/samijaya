/**
 * Promo.gs — Fase 7.11-A PromoCodes backend.
 *
 * Promo selalu dihitung server-side. Frontend hanya mengirim kode, cart,
 * data pengiriman, dan flag pakai_poin untuk preview.
 */

var _promoExecutionCache = {};

function _promoReadAllCached(sheetName) {
  if (!_promoExecutionCache.hasOwnProperty(sheetName)) {
    _promoExecutionCache[sheetName] = readAll(sheetName);
  }
  return _promoExecutionCache[sheetName];
}

function _promoNormalizeCode(code) {
  return String(code == null ? '' : code).trim().toUpperCase();
}

function _promoIsTruthy(value) {
  return sheetParseBoolean(value, { activeAliases: true }) === true;
}

function _promoHasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function _promoParseCsv(value) {
  if (!_promoHasValue(value)) return [];
  var parts = String(value).split(',');
  var result = [];
  for (var i = 0; i < parts.length; i++) {
    var item = String(parts[i]).trim();
    if (item && result.indexOf(item) === -1) result.push(item);
  }
  return result;
}

function _promoNumber(value, defaultValue) {
  if (!_promoHasValue(value)) return defaultValue;
  return sheetParseDecimal(value, {});
}

function _promoTimeString(value) {
  if (!_promoHasValue(value)) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Jakarta', 'HH:mm');
  }
  var textValue = String(value).trim();
  var match = textValue.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  var hour = Number(match[1]);
  var minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
}

function _promoDateMs(value) {
  if (!_promoHasValue(value)) return null;
  if (value instanceof Date) return value.getTime();

  var textValue = String(value).trim();
  var match = textValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return NaN;
  var iso = match[1] + '-' + match[2] + '-' + match[3] + 'T' +
    (match[4] || '00') + ':' + (match[5] || '00') + ':' + (match[6] || '00') + '+07:00';
  return new Date(iso).getTime();
}

function _promoDayCode(dateValue) {
  var english = Utilities.formatDate(dateValue, 'Asia/Jakarta', 'EEE').toUpperCase();
  var map = { MON: 'SEN', TUE: 'SEL', WED: 'RAB', THU: 'KAM', FRI: 'JUM', SAT: 'SAB', SUN: 'MIN' };
  return map[english] || '';
}

function _promoError(code, error) {
  return { ok: false, code: code, error: error };
}

function _promoLogConfigWarning(promo, reason) {
  try {
    log('ERROR', String(promo.promo_id || promo.kode || 'PROMO_CONFIG'), 'Konfigurasi promo tidak valid: ' + reason, {
      promo_id: String(promo.promo_id || ''),
      kode: _promoNormalizeCode(promo.kode),
      reason: reason
    });
  } catch (ignored) {}
}

function _promoValidateConfig(promo) {
  if (!String(promo.promo_id || '').trim() || !_promoNormalizeCode(promo.kode)) {
    return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi kode promo tidak valid');
  }

  var startMs = _promoDateMs(promo.mulai_at);
  var endMs = _promoDateMs(promo.berakhir_at);
  if ((_promoHasValue(promo.mulai_at) && isNaN(startMs)) ||
      (_promoHasValue(promo.berakhir_at) && isNaN(endMs)) ||
      (startMs !== null && endMs !== null && startMs > endMs)) {
    return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi masa berlaku promo tidak valid');
  }

  var validDays = { SEN: true, SEL: true, RAB: true, KAM: true, JUM: true, SAB: true, MIN: true };
  var days = _promoParseCsv(promo.hari_berlaku);
  for (var d = 0; d < days.length; d++) {
    days[d] = days[d].toUpperCase();
    if (!validDays[days[d]]) return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi hari promo tidak valid');
  }

  var startTime = _promoTimeString(promo.jam_mulai);
  var endTime = _promoTimeString(promo.jam_berakhir);
  if (startTime === null || endTime === null || (!!startTime !== !!endTime)) {
    return _promoError('PROMO_CONFIG_INVALID', 'jam_mulai dan jam_berakhir promo harus valid dan terisi berpasangan');
  }

  var minSubtotal = _promoNumber(promo.min_subtotal, 0);
  var maxSubtotal = _promoNumber(promo.max_subtotal, 0);
  if (minSubtotal === null || maxSubtotal === null || minSubtotal < 0 || maxSubtotal < 0 ||
      (maxSubtotal > 0 && minSubtotal > maxSubtotal)) {
    return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi batas subtotal promo tidak valid');
  }

  var methods = _promoParseCsv(promo.metode_kirim);
  var validMethods = { AMBIL: true, DIANTAR: true, OJOL: true };
  for (var m = 0; m < methods.length; m++) {
    methods[m] = methods[m].toUpperCase();
    if (!validMethods[methods[m]]) return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi metode kirim promo tidak valid');
  }

  var matchMode = String(promo.required_match_mode || 'ANY').trim().toUpperCase();
  if (matchMode !== 'ANY' && matchMode !== 'ALL') {
    return _promoError('PROMO_CONFIG_INVALID', 'required_match_mode harus ANY atau ALL');
  }

  var limitFields = ['limit_total', 'limit_per_member', 'limit_harian'];
  for (var l = 0; l < limitFields.length; l++) {
    var limitValue = _promoNumber(promo[limitFields[l]], 0);
    if (limitValue === null || limitValue < 0 || !Number.isInteger(limitValue)) {
      return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi limit promo tidak valid');
    }
  }

  var subtotalPresent = _promoHasValue(promo.diskon_subtotal_tipe) ||
    _promoHasValue(promo.diskon_subtotal_nilai) || _promoHasValue(promo.diskon_subtotal_max);
  var productPresent = _promoHasValue(promo.diskon_produk_ids) ||
    _promoHasValue(promo.diskon_produk_tipe) || _promoHasValue(promo.diskon_produk_nilai) ||
    _promoHasValue(promo.diskon_produk_max);

  if (subtotalPresent && productPresent) {
    return _promoError('PROMO_CONFIG_INVALID', 'Diskon subtotal dan diskon produk tidak boleh aktif bersamaan');
  }

  var priceEffects = [
    { present: subtotalPresent, type: promo.diskon_subtotal_tipe, value: promo.diskon_subtotal_nilai, cap: promo.diskon_subtotal_max, label: 'subtotal' },
    { present: productPresent, type: promo.diskon_produk_tipe, value: promo.diskon_produk_nilai, cap: promo.diskon_produk_max, label: 'produk' }
  ];
  for (var e = 0; e < priceEffects.length; e++) {
    var effect = priceEffects[e];
    if (!effect.present) continue;
    var effectType = String(effect.type || '').trim().toUpperCase();
    var effectValue = _promoNumber(effect.value, null);
    var effectCap = _promoNumber(effect.cap, 0);
    if ((effectType !== 'PERSEN' && effectType !== 'NOMINAL') || effectValue === null || effectValue <= 0 ||
        effectCap === null || effectCap < 0 || (effectType === 'PERSEN' && effectValue > 100)) {
      return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi diskon ' + effect.label + ' tidak valid');
    }
  }
  if (productPresent && _promoParseCsv(promo.diskon_produk_ids).length === 0) {
    return _promoError('PROMO_CONFIG_INVALID', 'Target diskon produk wajib diisi');
  }

  var shippingPresent = _promoHasValue(promo.diskon_ongkir_tipe) ||
    _promoHasValue(promo.diskon_ongkir_nilai) || _promoHasValue(promo.diskon_ongkir_max);
  if (shippingPresent) {
    var shippingType = String(promo.diskon_ongkir_tipe || '').trim().toUpperCase();
    var shippingValue = _promoNumber(promo.diskon_ongkir_nilai, null);
    var shippingCap = _promoNumber(promo.diskon_ongkir_max, 0);
    if (['GRATIS', 'PERSEN', 'NOMINAL'].indexOf(shippingType) === -1 || shippingCap === null || shippingCap < 0) {
      return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi diskon ongkir tidak valid');
    }
    if (shippingType !== 'GRATIS' && (shippingValue === null || shippingValue <= 0 ||
        (shippingType === 'PERSEN' && shippingValue > 100))) {
      return _promoError('PROMO_CONFIG_INVALID', 'Nilai diskon ongkir tidak valid');
    }
  }

  var bonus = _promoNumber(promo.bonus_poin, 0);
  var multiplier = _promoNumber(promo.multiplier_poin, 1);
  if (bonus === null || bonus < 0 || !Number.isInteger(bonus) || multiplier === null || multiplier <= 0) {
    return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi bonus atau multiplier poin tidak valid');
  }
  if (!subtotalPresent && !productPresent && !shippingPresent && bonus === 0 && multiplier === 1) {
    return _promoError('PROMO_CONFIG_INVALID', 'Kode promo tidak memiliki efek');
  }

  return {
    ok: true,
    data: {
      start_ms: startMs,
      end_ms: endMs,
      days: days,
      start_time: startTime,
      end_time: endTime,
      methods: methods,
      match_mode: matchMode,
      min_subtotal: minSubtotal,
      max_subtotal: maxSubtotal,
      subtotal_effect: subtotalPresent,
      product_effect: productPresent,
      shipping_effect: shippingPresent,
      bonus_poin: bonus,
      multiplier_poin: multiplier
    }
  };
}

function _promoFindByCode(code, promoRows) {
  var normalized = _promoNormalizeCode(code);
  if (!normalized) return _promoError('BAD_REQUEST', 'Kode promo wajib diisi');

  var matches = [];
  for (var i = 0; i < promoRows.length; i++) {
    if (_promoNormalizeCode(promoRows[i].kode) === normalized) matches.push(promoRows[i]);
  }
  if (matches.length === 0) return _promoError('PROMO_NOT_FOUND', 'Kode promo tidak ditemukan');
  if (matches.length > 1) {
    _promoLogConfigWarning(matches[0], 'Kode promo duplikat');
    return _promoError('PROMO_CONFIG_INVALID', 'Konfigurasi kode promo tidak valid');
  }
  return { ok: true, data: matches[0] };
}

function _promoValidateConditions(promo, config, context) {
  if (!_promoIsTruthy(promo.aktif)) return _promoError('PROMO_INACTIVE', 'Kode promo sedang tidak aktif');

  var now = context.now || new Date();
  var nowMs = now.getTime();
  if (config.start_ms !== null && nowMs < config.start_ms) return _promoError('PROMO_NOT_STARTED', 'Kode promo belum berlaku');
  if (config.end_ms !== null && nowMs > config.end_ms) return _promoError('PROMO_EXPIRED', 'Kode promo sudah berakhir');

  var timeNow = Utilities.formatDate(now, 'Asia/Jakarta', 'HH:mm');
  var minuteNow = Number(timeNow.substring(0, 2)) * 60 + Number(timeNow.substring(3, 5));
  var dayForRule = _promoDayCode(now);
  if (config.start_time && config.end_time) {
    var startMinute = Number(config.start_time.substring(0, 2)) * 60 + Number(config.start_time.substring(3, 5));
    var endMinute = Number(config.end_time.substring(0, 2)) * 60 + Number(config.end_time.substring(3, 5));
    var inTime = startMinute <= endMinute
      ? minuteNow >= startMinute && minuteNow <= endMinute
      : minuteNow >= startMinute || minuteNow <= endMinute;
    if (!inTime) return _promoError('PROMO_TIME_INVALID', 'Kode promo tidak berlaku pada jam ini');
    if (startMinute > endMinute && minuteNow <= endMinute) {
      dayForRule = _promoDayCode(new Date(nowMs - 24 * 60 * 60 * 1000));
    }
  }
  if (config.days.length > 0 && config.days.indexOf(dayForRule) === -1) {
    return _promoError('PROMO_DAY_INVALID', 'Kode promo tidak berlaku pada hari ini');
  }

  if (config.min_subtotal > 0 && context.subtotal < config.min_subtotal) {
    return _promoError('PROMO_SUBTOTAL_NOT_ELIGIBLE', 'Subtotal belum memenuhi minimum promo');
  }
  if (config.max_subtotal > 0 && context.subtotal > config.max_subtotal) {
    return _promoError('PROMO_SUBTOTAL_NOT_ELIGIBLE', 'Subtotal melebihi batas promo');
  }
  if (config.methods.length > 0 && config.methods.indexOf(String(context.metode_kirim).toUpperCase()) === -1) {
    return _promoError('PROMO_DELIVERY_NOT_ELIGIBLE', 'Metode pengiriman tidak memenuhi syarat promo');
  }

  var requiredProducts = _promoParseCsv(promo.required_product_ids);
  var requiredCategories = _promoParseCsv(promo.required_kategori_ids);
  if (requiredProducts.length > 0 || requiredCategories.length > 0) {
    var productSet = {};
    var categorySet = {};
    for (var i = 0; i < context.line_items.length; i++) {
      productSet[String(context.line_items[i].product_id)] = true;
      categorySet[String(context.line_items[i].kategori_id)] = true;
    }
    var matched = 0;
    var requiredTotal = requiredProducts.length + requiredCategories.length;
    for (var p = 0; p < requiredProducts.length; p++) if (productSet[requiredProducts[p]]) matched++;
    for (var c = 0; c < requiredCategories.length; c++) if (categorySet[requiredCategories[c]]) matched++;
    var requirementMet = config.match_mode === 'ALL' ? matched === requiredTotal : matched > 0;
    if (!requirementMet) {
      var requiredCode = requiredProducts.length > 0 && requiredCategories.length === 0
        ? 'PROMO_PRODUCT_REQUIRED' : 'PROMO_CATEGORY_REQUIRED';
      return _promoError(requiredCode, 'Produk atau kategori yang disyaratkan belum ada di order');
    }
  }

  if (_promoIsTruthy(promo.member_baru_only)) {
    for (var o = 0; o < context.orders.length; o++) {
      if (isOrderCommittedRow(context.orders[o]) && String(context.orders[o].member_id) === String(context.member_id) &&
          String(context.orders[o].status).toUpperCase() === 'SELESAI') {
        return _promoError('PROMO_NEW_MEMBER_ONLY', 'Kode promo hanya berlaku untuk member baru');
      }
    }
  }

  var whitelist = _promoParseCsv(promo.whitelist_member_ids);
  if (whitelist.length > 0 && whitelist.indexOf(String(context.member_id)) === -1) {
    return _promoError('PROMO_MEMBER_NOT_ALLOWED', 'Member tidak termasuk penerima kode promo');
  }

  if (context.pakai_poin && !_promoIsTruthy(promo.bisa_dengan_poin)) {
    return _promoError('PROMO_CANNOT_COMBINE_POINTS', 'Kode ini tidak bisa digabung dengan poin');
  }

  return { ok: true };
}

function _promoUsedDate(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM-dd');
  return String(value == null ? '' : value).trim().substring(0, 10);
}

function _promoCountUsage(promo, memberId, usageRows, now) {
  var promoId = String(promo.promo_id);
  var today = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd');
  var total = 0;
  var member = 0;
  var daily = 0;
  for (var i = 0; i < usageRows.length; i++) {
    var usage = usageRows[i];
    if (String(usage.promo_id) !== promoId || String(usage.status).toUpperCase() !== 'DIGUNAKAN') continue;
    total++;
    if (String(usage.member_id) === String(memberId)) member++;
    if (_promoUsedDate(usage.used_date) === today) daily++;
  }
  return { total: total, member: member, daily: daily };
}

function _promoValidateLimits(promo, context, usageRows) {
  var counts = _promoCountUsage(promo, context.member_id, usageRows, context.now);
  var totalLimit = _promoNumber(promo.limit_total, 0);
  var memberLimit = _promoNumber(promo.limit_per_member, 0);
  var dailyLimit = _promoNumber(promo.limit_harian, 0);
  if (totalLimit > 0 && counts.total >= totalLimit) return _promoError('PROMO_LIMIT_TOTAL', 'Kuota kode promo sudah habis');
  if (memberLimit > 0 && counts.member >= memberLimit) return _promoError('PROMO_LIMIT_MEMBER', 'Batas penggunaan kode promo untuk member ini sudah tercapai');
  if (dailyLimit > 0 && counts.daily >= dailyLimit) return _promoError('PROMO_LIMIT_DAILY', 'Kuota kode promo hari ini sudah habis');
  return { ok: true, data: counts };
}

function _promoCalculateCappedDiscount(type, value, cap, base) {
  var discount = type === 'PERSEN' ? Math.floor(base * value / 100) : Math.floor(value);
  if (type === 'PERSEN' && cap > 0) discount = Math.min(discount, cap);
  return Math.max(0, Math.min(discount, base));
}

function _promoCalculateDiscount(promo, config, context) {
  var discountSubtotal = 0;
  var discountProduct = 0;
  var discountShipping = 0;

  if (config.subtotal_effect) {
    discountSubtotal = _promoCalculateCappedDiscount(
      String(promo.diskon_subtotal_tipe).trim().toUpperCase(),
      Number(promo.diskon_subtotal_nilai),
      _promoNumber(promo.diskon_subtotal_max, 0),
      context.subtotal
    );
  } else if (config.product_effect) {
    var targetIds = _promoParseCsv(promo.diskon_produk_ids);
    var eligibleSubtotal = 0;
    for (var i = 0; i < context.line_items.length; i++) {
      if (targetIds.indexOf(String(context.line_items[i].product_id)) !== -1) {
        eligibleSubtotal += Number(context.line_items[i].subtotal) || 0;
      }
    }
    discountProduct = _promoCalculateCappedDiscount(
      String(promo.diskon_produk_tipe).trim().toUpperCase(),
      Number(promo.diskon_produk_nilai),
      _promoNumber(promo.diskon_produk_max, 0),
      eligibleSubtotal
    );
  }

  if (config.shipping_effect) {
    var shippingType = String(promo.diskon_ongkir_tipe).trim().toUpperCase();
    if (shippingType === 'GRATIS') {
      discountShipping = context.ongkir;
    } else {
      discountShipping = _promoCalculateCappedDiscount(
        shippingType,
        Number(promo.diskon_ongkir_nilai),
        _promoNumber(promo.diskon_ongkir_max, 0),
        context.ongkir
      );
    }
    discountShipping = Math.min(discountShipping, context.ongkir);
  }

  var priceDiscount = Math.min(discountSubtotal + discountProduct, context.subtotal);
  var subtotalAfter = Math.max(0, context.subtotal - priceDiscount);
  var shippingAfter = Math.max(0, context.ongkir - discountShipping);
  var totalBeforePoints = subtotalAfter + shippingAfter;
  var pointsUsed = 0;
  if (context.pakai_poin) {
    var minRedeem = Number(getSetting('POINT_MIN_REDEEM')) || 0;
    if (context.saldo_poin > 0 && context.saldo_poin >= minRedeem) {
      pointsUsed = Math.min(context.saldo_poin, totalBeforePoints);
    }
  }
  var total = Math.max(0, totalBeforePoints - pointsUsed);
  var pointRate = Number(getSetting('POINT_RATE_RP')) || 1000;
  var earnedBase = Math.floor(total / pointRate);
  var earnedFinal = Math.floor(earnedBase * config.multiplier_poin) + config.bonus_poin;

  return {
    promo_id: String(promo.promo_id),
    promo_code: _promoNormalizeCode(promo.kode),
    promo_nama: String(promo.nama || ''),
    catatan_customer: String(promo.catatan_customer || ''),
    subtotal_awal: context.subtotal,
    diskon_subtotal: discountSubtotal,
    diskon_produk: discountProduct,
    subtotal_setelah_promo: subtotalAfter,
    ongkir_awal: context.ongkir,
    diskon_ongkir: discountShipping,
    ongkir_setelah_promo: shippingAfter,
    diskon_total: priceDiscount + discountShipping,
    total_sebelum_poin: totalBeforePoints,
    poin_dipakai: pointsUsed,
    total: total,
    poin_earn_dasar: earnedBase,
    multiplier_poin: config.multiplier_poin,
    bonus_poin: config.bonus_poin,
    poin_earn_final: earnedFinal,
    bisa_dengan_poin: _promoIsTruthy(promo.bisa_dengan_poin),
    berakhir_at: _promoHasValue(promo.berakhir_at) ? String(promo.berakhir_at) : ''
  };
}

function _promoCalculateWithoutCode(context) {
  var totalBeforePoints = context.subtotal + context.ongkir;
  var pointsUsed = 0;
  if (context.pakai_poin) {
    var minRedeem = Number(getSetting('POINT_MIN_REDEEM')) || 0;
    if (context.saldo_poin > 0 && context.saldo_poin >= minRedeem) {
      pointsUsed = Math.min(context.saldo_poin, totalBeforePoints);
    }
  }
  var total = totalBeforePoints - pointsUsed;
  var pointRate = Number(getSetting('POINT_RATE_RP')) || 1000;
  var earnedBase = Math.floor(total / pointRate);
  return {
    promo_id: '', promo_code: '', promo_nama: '', catatan_customer: '',
    subtotal_awal: context.subtotal, diskon_subtotal: 0, diskon_produk: 0,
    subtotal_setelah_promo: context.subtotal, ongkir_awal: context.ongkir,
    diskon_ongkir: 0, ongkir_setelah_promo: context.ongkir, diskon_total: 0,
    total_sebelum_poin: totalBeforePoints, poin_dipakai: pointsUsed, total: total,
    poin_earn_dasar: earnedBase, multiplier_poin: 1, bonus_poin: 0,
    poin_earn_final: earnedBase, bisa_dengan_poin: true, berakhir_at: ''
  };
}

function _promoEvaluate(code, context, promoRows, usageRows) {
  var found = _promoFindByCode(code, promoRows);
  if (!found.ok) return found;
  var promo = found.data;

  var configResult = _promoValidateConfig(promo);
  if (!configResult.ok) {
    _promoLogConfigWarning(promo, configResult.error);
    return configResult;
  }
  var conditionsResult = _promoValidateConditions(promo, configResult.data, context);
  if (!conditionsResult.ok) return conditionsResult;
  var limitsResult = _promoValidateLimits(promo, context, usageRows);
  if (!limitsResult.ok) return limitsResult;

  return {
    ok: true,
    data: _promoCalculateDiscount(promo, configResult.data, context),
    promo: promo
  };
}

function _promoBuildPreviewContext(payload, member) {
  var items = payload.items;
  if (!Array.isArray(items) || items.length === 0) return _promoError('BAD_REQUEST', 'Items tidak boleh kosong');

  var products = _promoReadAllCached('Products');
  var variants = _promoReadAllCached('ProductVariants');
  var addons = _promoReadAllCached('ProductAddons');
  var productMap = {};
  var variantMap = {};
  var activeVariantsByProduct = {};
  var addonMap = {};
  for (var p = 0; p < products.length; p++) productMap[String(products[p].product_id)] = products[p];
  for (var v = 0; v < variants.length; v++) {
    variantMap[String(variants[v].variant_id)] = variants[v];
    if (_promoIsTruthy(variants[v].aktif)) activeVariantsByProduct[String(variants[v].product_id)] = true;
  }
  for (var a = 0; a < addons.length; a++) addonMap[String(addons[a].addon_id)] = addons[a];

  var lineItems = [];
  var subtotal = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var productId = String(item.product_id || '').trim();
    var qty = Number(item.qty);
    var product = productMap[productId];
    if (!productId || !Number.isInteger(qty) || qty <= 0 || qty > 99) return _promoError('BAD_REQUEST', 'Item order tidak valid');
    if (!product || String(product.status).toLowerCase() !== 'aktif' || Number(product.tersedia) !== 1) {
      return _promoError('PRODUK_TIDAK_TERSEDIA', 'Produk tidak tersedia');
    }

    var unitPrice = Number(product.harga) || 0;
    if (_promoHasValue(item.variant_id)) {
      var variant = variantMap[String(item.variant_id)];
      if (!variant) return _promoError('VARIANT_NOT_FOUND', 'Varian tidak ditemukan');
      if (!_promoIsTruthy(variant.aktif)) return _promoError('VARIANT_INACTIVE', 'Varian sedang tidak tersedia');
      if (String(variant.product_id) !== productId) return _promoError('VARIANT_MISMATCH', 'Varian tidak sesuai dengan produk');
      unitPrice += Number(variant.harga) || 0;
    } else if (activeVariantsByProduct[productId]) {
      return _promoError('VARIANT_REQUIRED', 'Produk wajib memilih varian');
    }

    var addonIds = item.addon_ids || [];
    if (!Array.isArray(addonIds)) return _promoError('BAD_REQUEST', 'Format add-on tidak valid');
    for (var ai = 0; ai < addonIds.length; ai++) {
      var addon = addonMap[String(addonIds[ai])];
      if (!addon) return _promoError('ADDON_NOT_FOUND', 'Add-on tidak ditemukan');
      if (!_promoIsTruthy(addon.aktif)) return _promoError('ADDON_INACTIVE', 'Add-on tidak tersedia');
      if (String(addon.product_id) !== productId) return _promoError('ADDON_MISMATCH', 'Add-on tidak sesuai produk');
      unitPrice += Number(addon.harga) || 0;
    }

    var lineSubtotal = unitPrice * qty;
    subtotal += lineSubtotal;
    lineItems.push({ product_id: productId, kategori_id: String(product.kategori_id || ''), subtotal: lineSubtotal });
  }

  var method = String(payload.metode_kirim || '').trim().toUpperCase();
  var shipping = 0;
  if (method === 'DIANTAR') {
    var lat = Number(payload.lat);
    var lng = Number(payload.lng);
    if (!_promoHasValue(payload.lat) || !_promoHasValue(payload.lng) || isNaN(lat) || isNaN(lng)) {
      return _promoError('BAD_REQUEST', 'lat dan lng wajib untuk menghitung promo pengiriman');
    }
    var pickups = _promoReadAllCached('PickupLocations');
    var bestDistance = Infinity;
    for (var pi = 0; pi < pickups.length; pi++) {
      if (String(pickups[pi].status).toLowerCase() !== 'aktif') continue;
      var pickupLat = Number(pickups[pi].latitude);
      var pickupLng = Number(pickups[pi].longitude);
      if (!pickupLat || !pickupLng) continue;
      var distance = _haversine(pickupLat, pickupLng, lat, lng);
      if (distance < bestDistance) bestDistance = distance;
    }
    if (bestDistance === Infinity) return _promoError('LUAR_JANGKAUAN', 'Tidak ada titik asal pengiriman yang tersedia');
    var correctedDistance = bestDistance * (Number(getSetting('ONGKIR_FAKTOR_KOREKSI')) || 1.3);
    var radiusMax = Number(getSetting('ONGKIR_RADIUS_MAX_KM')) || 15;
    var minimumOrder = Number(getSetting('MIN_ORDER_DELIVERY')) || 0;
    if (correctedDistance > radiusMax) return _promoError('LUAR_JANGKAUAN', 'Lokasi pengiriman di luar jangkauan');
    if (subtotal < minimumOrder) return _promoError('MIN_ORDER', 'Subtotal belum memenuhi minimum pengiriman');
    if (correctedDistance > 5) shipping = Math.round(correctedDistance) * (Number(getSetting('ONGKIR_PER_KM')) || 1000);
  } else if (method !== 'AMBIL' && method !== 'OJOL') {
    return _promoError('BAD_REQUEST', 'metode_kirim tidak valid');
  }

  return {
    ok: true,
    data: {
      now: new Date(), member_id: String(member.member_id), subtotal: subtotal,
      ongkir: shipping, metode_kirim: method, line_items: lineItems,
      pakai_poin: payload.pakai_poin === true || String(payload.pakai_poin).toLowerCase() === 'true',
      saldo_poin: Number(member.total_poin) || 0,
      orders: _promoReadAllCached('Orders')
    }
  };
}

function promoValidateCode(payload, token) {
  var member = requireSession(token);
  if (!member) return _promoError('UNAUTHORIZED', 'Sesi tidak valid atau kedaluwarsa');

  var contextResult = _promoBuildPreviewContext(payload || {}, member);
  if (!contextResult.ok) return contextResult;
  var result = _promoEvaluate(
    String((payload || {}).promo_code || ''),
    contextResult.data,
    _promoReadAllCached('PromoCodes'),
    _promoReadAllCached('PromoUsage')
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data };
}

function _promoAppendUsage(orderObj, promoResult) {
  if (!promoResult || !promoResult.promo_id) return null;
  var now = new Date();
  var usage = {
    usage_id: genId('PRU'), promo_id: String(promoResult.promo_id),
    promo_code: String(promoResult.promo_code), order_id: String(orderObj.order_id),
    member_id: String(orderObj.member_id), status: 'DIGUNAKAN', used_at: nowJkt(),
    used_date: Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd'), cancelled_at: '',
    promo_diskon_subtotal: promoResult.diskon_subtotal,
    promo_diskon_produk: promoResult.diskon_produk,
    promo_diskon_ongkir: promoResult.diskon_ongkir,
    promo_diskon_total: promoResult.diskon_total,
    promo_bonus_poin: promoResult.bonus_poin,
    promo_multiplier_poin: promoResult.multiplier_poin
  };
  appendRowObj('PromoUsage', usage);
  return usage;
}

/** Ensure usage deterministik untuk recoverable order commit. */
function _promoEnsureUsage(expected) {
  if (!expected) return { ok: true };
  var rows = readAll('PromoUsage');
  var matches = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].usage_id) === String(expected.usage_id) || String(rows[i].order_id) === String(expected.order_id)) matches.push(rows[i]);
  }
  if (matches.length > 1) return { ok: false, code: 'ORDER_PROMO_DUPLICATE' };
  if (matches.length === 1) {
    var row = matches[0];
    if (String(row.status).toUpperCase() === 'DIBATALKAN') return { ok: false, code: 'ORDER_PROMO_CANCELLED_CONFLICT' };
    var keys = ['usage_id','promo_id','promo_code','order_id','member_id','status','promo_diskon_total'];
    for (var k = 0; k < keys.length; k++) {
      if (String(row[keys[k]] == null ? '' : row[keys[k]]) !== String(expected[keys[k]] == null ? '' : expected[keys[k]])) return { ok: false, code: 'ORDER_PROMO_CONFLICT' };
    }
    return { ok: true, existing: true };
  }
  var result = appendRowsObj('PromoUsage', [expected]);
  return result.written === 1 ? { ok: true } : { ok: false, code: 'ORDER_PROMO_WRITE_FAILED' };
}

function _promoRefundUsageByOrder(orderId, cancelledAt) {
  getSheetHeaders('PromoUsage');
  var rows = readAll('PromoUsage');
  var matches = [];
  for (var i = 0; i < rows.length; i++) if (String(rows[i].order_id) === String(orderId)) matches.push(rows[i]);
  if (matches.length === 0) return { ok: true, existing: true, absent: true };
  if (matches.length > 1) return { ok: false, code: 'PROMO_USAGE_DUPLICATE' };
  var row = matches[0];
  var status = String(row.status || '').trim().toUpperCase();
  if (status === 'DIBATALKAN') return { ok: true, existing: true };
  if (status !== 'DIGUNAKAN') return { ok: false, code: 'PROMO_USAGE_STATUS_CONFLICT' };
  if (!updateRowById('PromoUsage', 'usage_id', String(row.usage_id), { status: 'DIBATALKAN', cancelled_at: cancelledAt || nowJkt() })) {
    return { ok: false, code: 'PROMO_USAGE_WRITE_FAILED' };
  }
  return { ok: true, existing: false };
}
