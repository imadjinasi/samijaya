/**
 * Audit/migration terjaga untuk OrderItems legacy yang product_id-nya sudah
 * tidak ada di Products. Pencocokan hanya memakai nama_snapshot yang, setelah
 * trim, sama persis dengan tepat satu Products.nama.
 */

function _legacyOrderItemHeaderIndex_(headers, headerName, sheetName) {
  var index = -1;
  for (var i = 0; i < headers.length; i++) {
    var current = String(headers[i] == null ? '' : headers[i]).trim();
    if (current === headerName) {
      if (index !== -1) throw new Error('HEADER_DUPLICATE:' + sheetName + ':' + headerName);
      index = i;
    }
  }
  if (index === -1) throw new Error('HEADER_MISSING:' + sheetName + ':' + headerName);
  return index;
}

function _legacyOrderItemBuildPlan_() {
  var productsSheet = getSheet('Products');
  var orderItemsSheet = getSheet('OrderItems');
  var productData = productsSheet.getDataRange().getValues();
  var orderItemData = orderItemsSheet.getDataRange().getValues();
  if (productData.length === 0 || orderItemData.length === 0) throw new Error('LEGACY_ORDER_ITEM_HEADER_MISSING');

  var productIdCol = _legacyOrderItemHeaderIndex_(productData[0], 'product_id', 'Products');
  var productNameCol = _legacyOrderItemHeaderIndex_(productData[0], 'nama', 'Products');
  var itemOrderIdCol = _legacyOrderItemHeaderIndex_(orderItemData[0], 'order_id', 'OrderItems');
  var itemProductIdCol = _legacyOrderItemHeaderIndex_(orderItemData[0], 'product_id', 'OrderItems');
  var itemNameCol = _legacyOrderItemHeaderIndex_(orderItemData[0], 'nama_snapshot', 'OrderItems');

  var currentProductIds = {};
  var productIdsByExactName = {};
  for (var p = 1; p < productData.length; p++) {
    var productId = String(productData[p][productIdCol] == null ? '' : productData[p][productIdCol]).trim();
    var productName = String(productData[p][productNameCol] == null ? '' : productData[p][productNameCol]).trim();
    if (!productId) continue;
    if (currentProductIds[productId]) throw new Error('DATA_DUPLICATE_PRIMARY_ID:Products:product_id');
    currentProductIds[productId] = true;
    if (!productName) continue;
    if (!productIdsByExactName[productName]) productIdsByExactName[productName] = [];
    productIdsByExactName[productName].push(productId);
  }

  var plan = {
    sheet: orderItemsSheet,
    product_id_column: itemProductIdCol + 1,
    valid_rows: 0,
    orphan_rows: 0,
    mappable_rows: 0,
    unmatched_rows: 0,
    ambiguous_rows: 0,
    proposals: [],
    samples: []
  };
  for (var r = 1; r < orderItemData.length; r++) {
    var orderId = String(orderItemData[r][itemOrderIdCol] == null ? '' : orderItemData[r][itemOrderIdCol]).trim();
    var oldProductId = String(orderItemData[r][itemProductIdCol] == null ? '' : orderItemData[r][itemProductIdCol]).trim();
    var snapshotName = String(orderItemData[r][itemNameCol] == null ? '' : orderItemData[r][itemNameCol]).trim();
    if (!orderId && !oldProductId && !snapshotName) continue;
    if (currentProductIds[oldProductId]) {
      plan.valid_rows++;
      continue;
    }

    plan.orphan_rows++;
    var candidates = productIdsByExactName[snapshotName] || [];
    var status = 'UNMATCHED';
    if (candidates.length === 1) {
      status = 'MAPPABLE';
      plan.mappable_rows++;
      plan.proposals.push({
        row_number: r + 1,
        order_id: orderId,
        old_product_id: oldProductId,
        new_product_id: candidates[0]
      });
    } else if (candidates.length > 1) {
      status = 'AMBIGUOUS';
      plan.ambiguous_rows++;
    } else {
      plan.unmatched_rows++;
    }
    if (plan.samples.length < 10) {
      plan.samples.push({
        row_number: r + 1,
        order_id: orderId,
        old_product_id: oldProductId,
        nama_snapshot: snapshotName,
        status: status,
        candidate_count: candidates.length
      });
    }
  }
  return plan;
}

function _legacyOrderItemReport_(plan) {
  return {
    ok: plan.orphan_rows === 0,
    valid_rows: plan.valid_rows,
    orphan_rows: plan.orphan_rows,
    mappable_rows: plan.mappable_rows,
    unmatched_rows: plan.unmatched_rows,
    ambiguous_rows: plan.ambiguous_rows,
    samples: plan.samples.slice()
  };
}

/** Read-only: tidak menulis sheet, cache, atau property. */
function auditLegacyOrderItemProductMappingReadOnly() {
  var report = _legacyOrderItemReport_(_legacyOrderItemBuildPlan_());
  Logger.log(JSON.stringify(report));
  return report;
}

/**
 * Jalankan manual hanya setelah backup. Row unmatched/ambiguous tidak diubah.
 * Fungsi aman dijalankan ulang karena product_id yang sudah valid akan dilewati.
 */
function migrateLegacyOrderItemProductIdsByExactName() {
  return withLock(function() {
    var plan = _legacyOrderItemBuildPlan_();
    for (var i = 0; i < plan.proposals.length; i++) {
      var proposal = plan.proposals[i];
      plan.sheet.getRange(proposal.row_number, plan.product_id_column).setValue(
        sheetPrepareValue(proposal.new_product_id)
      );
    }
    var report = _legacyOrderItemReport_(plan);
    report.updated_rows = plan.proposals.length;
    report.ok = report.unmatched_rows === 0 && report.ambiguous_rows === 0;
    Logger.log(JSON.stringify(report));
    return report;
  });
}
