const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True for rows persisted in `intake_chat_messages` (not optimistic UI placeholders). */
export function isPersistedIntakeChatMessageId(messageId: string): boolean {
  return UUID_RE.test(messageId);
}
