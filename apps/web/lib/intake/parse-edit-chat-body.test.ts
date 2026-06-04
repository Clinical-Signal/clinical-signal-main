import { describe, expect, it } from "vitest";

import { EditChatBodySchema } from "./parse-edit-chat-body";

describe("EditChatBodySchema", () => {
  it("accepts newContent alias", () => {
    const parsed = EditChatBodySchema.parse({
      messageId: "bf47a671-a3ff-4264-889e-d6bd0eeec6e1",
      newContent: "Updated text",
    });
    expect(parsed.content).toBe("Updated text");
  });

  it("rejects optimistic placeholder ids", () => {
    const result = EditChatBodySchema.safeParse({
      messageId: "user-pending-123",
      content: "Updated text",
    });
    expect(result.success).toBe(false);
  });
});
