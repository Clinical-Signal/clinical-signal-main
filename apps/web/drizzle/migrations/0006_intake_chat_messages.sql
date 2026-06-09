-- 0006_intake_chat_messages.sql — Step 2 OpenRouter chat transcript (SEC-18 / tenant RLS).

BEGIN;

CREATE TABLE IF NOT EXISTS intake_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  intake_token_id uuid NOT NULL REFERENCES intake_tokens(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT intake_chat_messages_role_check
    CHECK (role IN ('system', 'user', 'assistant'))
);

CREATE INDEX IF NOT EXISTS intake_chat_messages_token_created_idx
  ON intake_chat_messages (intake_token_id, created_at);

CREATE INDEX IF NOT EXISTS intake_chat_messages_tenant_idx
  ON intake_chat_messages (tenant_id);

COMMENT ON TABLE intake_chat_messages IS
  'Step 2 conversational intake: one question at a time via OpenRouter chat.';

ALTER TABLE intake_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON intake_chat_messages;
CREATE POLICY tenant_isolation ON intake_chat_messages
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

COMMIT;
