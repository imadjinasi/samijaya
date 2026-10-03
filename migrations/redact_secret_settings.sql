\set ON_ERROR_STOP on
-- Run only after the equivalent values have been placed in prod.env and loaded by Node.
BEGIN;
UPDATE samijaya."Settings" SET "value"=''
WHERE "key" IN ('ADMIN_CHAT_IDS','ADMIN_PASSWORD_HASH','DEMO_OTP',
                'TELEGRAM_BOT_TOKEN','TELEGRAM_SECRET','TELEGRAM_WEBHOOK_KEY_NEXT');
COMMIT;
