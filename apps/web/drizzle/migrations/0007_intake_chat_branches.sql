-- 0007_intake_chat_branches.sql — nested edit follow-up threads on Step 2 chat.

BEGIN;

ALTER TABLE intake_chat_messages
  ADD COLUMN IF NOT EXISTS parent_message_id uuid
    REFERENCES intake_chat_messages (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS intake_chat_messages_parent_idx
  ON intake_chat_messages (parent_message_id, created_at)
  WHERE parent_message_id IS NOT NULL;

COMMENT ON COLUMN intake_chat_messages.parent_message_id IS
  'When set, message belongs to a nested follow-up thread anchored on the edited user message.';

COMMIT;
