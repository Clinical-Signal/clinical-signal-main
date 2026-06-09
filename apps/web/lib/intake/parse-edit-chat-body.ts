import { z } from "zod";

import { isPersistedIntakeChatMessageId } from "./intake-chat-message-id";

export const EditChatBodySchema = z
  .object({
    messageId: z.string().min(1),
    content: z.string().min(1).max(4000).optional(),
    newContent: z.string().min(1).max(4000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.content?.trim() && !value.newContent?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Either content or newContent is required",
        path: ["content"],
      });
    }
    if (!isPersistedIntakeChatMessageId(value.messageId)) {
      ctx.addIssue({
        code: "custom",
        message: "messageId must be a persisted chat message UUID",
        path: ["messageId"],
      });
    }
  })
  .transform((value) => ({
    messageId: value.messageId,
    content: (value.content ?? value.newContent)!.trim(),
  }));

export type EditChatBody = z.infer<typeof EditChatBodySchema>;
