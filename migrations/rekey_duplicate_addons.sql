\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  duplicate_groups integer;
  excess_rows integer;
  referenced_rows integer;
BEGIN
  SELECT count(*), coalesce(sum(n - 1), 0)
    INTO duplicate_groups, excess_rows
  FROM (
    SELECT count(*) AS n
    FROM samijaya."ProductAddons"
    GROUP BY "addon_id"
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_groups <> 1 OR excess_rows <> 2 THEN
    RAISE EXCEPTION 'Expected exactly one three-row ProductAddons duplicate group, found % groups and % excess rows',
      duplicate_groups, excess_rows;
  END IF;

  SELECT count(*) INTO referenced_rows
  FROM samijaya."OrderItemAddons"
  WHERE "addon_id" IN (
    SELECT "addon_id" FROM samijaya."ProductAddons"
    GROUP BY "addon_id" HAVING count(*) > 1
  );
  IF referenced_rows <> 0 THEN
    RAISE EXCEPTION 'Duplicate add-on IDs already have order references';
  END IF;
END $$;

CREATE TABLE samijaya.addon_id_rekey_log (
  source_row integer PRIMARY KEY,
  original_addon_id text NOT NULL,
  new_addon_id text NOT NULL UNIQUE,
  changed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO samijaya.addon_id_rekey_log (source_row, original_addon_id, new_addon_id)
SELECT source_row, "addon_id", 'MIG_ADDON_SOURCE_ROW_' || source_row
FROM (
  SELECT source_row, "addon_id",
         row_number() OVER (PARTITION BY "addon_id" ORDER BY source_row) AS occurrence,
         count(*) OVER (PARTITION BY "addon_id") AS copies
  FROM samijaya."ProductAddons"
) addons
WHERE copies > 1 AND occurrence > 1;

DO $$
BEGIN
  IF (SELECT count(*) FROM samijaya.addon_id_rekey_log) <> 2 THEN
    RAISE EXCEPTION 'Add-on rekey plan did not contain exactly two rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM samijaya."ProductAddons" a
    JOIN samijaya.addon_id_rekey_log l ON a."addon_id" = l.new_addon_id
  ) THEN
    RAISE EXCEPTION 'Generated add-on ID collides with a source ID';
  END IF;
END $$;

UPDATE samijaya."ProductAddons" a
SET "addon_id" = l.new_addon_id
FROM samijaya.addon_id_rekey_log l
WHERE a.source_row = l.source_row AND a."addon_id" = l.original_addon_id;

DO $$
BEGIN
  IF (SELECT count(*) - count(DISTINCT "addon_id") FROM samijaya."ProductAddons") <> 0 THEN
    RAISE EXCEPTION 'Add-on IDs remain duplicated after rekey';
  END IF;
END $$;

CREATE UNIQUE INDEX "ProductAddons_primary_uidx"
ON samijaya."ProductAddons" ("addon_id");

COMMIT;
