\set ON_ERROR_STOP on
DO $$
DECLARE item record; actual_count integer;
BEGIN
  FOR item IN SELECT sheet_name, source_rows FROM samijaya.import_manifest LOOP
    EXECUTE format('SELECT count(*) FROM samijaya.%I', item.sheet_name) INTO actual_count;
    IF actual_count <> item.source_rows THEN
      RAISE EXCEPTION 'count mismatch for %: % vs %', item.sheet_name, actual_count, item.source_rows;
    END IF;
  END LOOP;
END $$;
SELECT count(*) AS business_tables, sum(source_rows) AS business_rows FROM samijaya.import_manifest;
SELECT count(*)-count(DISTINCT "addon_id") AS duplicate_addon_ids FROM samijaya."ProductAddons";
SELECT count(*) AS orphan_order_items FROM samijaya."OrderItems" i
LEFT JOIN samijaya."Orders" o ON i."order_id"=o."order_id" WHERE o."order_id" IS NULL;
SELECT count(*) AS orphan_addon_products FROM samijaya."ProductAddons" a
LEFT JOIN samijaya."Products" p ON a."product_id"=p."product_id" WHERE p."product_id" IS NULL;
SELECT count(*) FILTER (WHERE "no_hp" LIKE '%.0') AS malformed_phone_rows,
       count(*) FILTER (WHERE "tgl_antar" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') AS malformed_delivery_dates,
       count(*) FILTER (WHERE "promo_diskon_total" <> '' AND "promo_diskon_total" !~ '^[0-9]+([.][0-9]+)?$') AS malformed_promo_amounts
FROM samijaya."Orders";
