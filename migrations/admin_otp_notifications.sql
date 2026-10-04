\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE IF NOT EXISTS samijaya.admin_otp_challenges (
  challenge_id text PRIMARY KEY,
  otp_hash text NOT NULL,
  request_key_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_otp_challenges_expiry_idx
  ON samijaya.admin_otp_challenges (expires_at);

CREATE TABLE IF NOT EXISTS samijaya.notification_outbox (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  template_code text NOT NULL,
  recipient_phone text NOT NULL,
  message text NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','SENDING','SENT','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (order_id, template_code, recipient_phone)
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON samijaya.notification_outbox (next_attempt_at) WHERE state IN ('PENDING','FAILED');

INSERT INTO samijaya."Settings" (source_row,"key","value","keterangan")
SELECT COALESCE(max(source_row),1)+1,'ADMIN_OTP_PHONES','6285179902504,6285179912504',
       'Nomor WhatsApp penerima OTP admin, pisahkan dengan koma'
FROM samijaya."Settings"
WHERE NOT EXISTS (SELECT 1 FROM samijaya."Settings" WHERE "key"='ADMIN_OTP_PHONES');

GRANT SELECT, INSERT, UPDATE, DELETE ON samijaya.admin_otp_challenges TO samijaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON samijaya.notification_outbox TO samijaya_app;
GRANT USAGE, SELECT ON SEQUENCE samijaya.notification_outbox_id_seq TO samijaya_app;
COMMIT;
