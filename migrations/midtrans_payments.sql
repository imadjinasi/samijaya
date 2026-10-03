-- Run as the Samijaya database owner before enabling MIDTRANS_MODE.
CREATE TABLE IF NOT EXISTS samijaya.midtrans_payments (
  order_id text PRIMARY KEY,
  gateway_order_id text NOT NULL UNIQUE,
  amount bigint NOT NULL CHECK (amount > 0),
  state text NOT NULL CHECK (state IN ('INITIATING','INIT_FAILED','PENDING','PAID','PARTIAL_REFUND','EXPIRED','REFUNDED')),
  snap_token text,
  redirect_url text,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  notified_at timestamptz,
  refund_reference text,
  refund_note text,
  refund_recorded_at timestamptz,
  refund_recorded_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS midtrans_payments_pending_idx
  ON samijaya.midtrans_payments (updated_at) WHERE state='PENDING';
GRANT SELECT, INSERT, UPDATE ON samijaya.midtrans_payments TO samijaya_app;
