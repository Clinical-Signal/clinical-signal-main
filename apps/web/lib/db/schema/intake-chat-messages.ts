import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { intakeTokens } from "./intake-tokens";

/** Magic-link Step 2 interviewer transcript (replaces static question plan UI). */
export const INTAKE_CHAT_ROLES = ["system", "user", "assistant"] as const;
export type IntakeChatRole = (typeof INTAKE_CHAT_ROLES)[number];

export const intakeChatMessages = pgTable(
  "intake_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeTokenId: uuid("intake_token_id")
      .notNull()
      .references(() => intakeTokens.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    role: text("role").notNull().$type<IntakeChatRole>(),
    content: text("content").notNull(),
    parentMessageId: uuid("parent_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenCreatedIdx: index("intake_chat_messages_token_created_idx").on(
      table.intakeTokenId,
      table.createdAt,
    ),
    tenantIdx: index("intake_chat_messages_tenant_idx").on(table.tenantId),
    parentIdx: index("intake_chat_messages_parent_idx").on(
      table.parentMessageId,
      table.createdAt,
    ),
  }),
);

export type IntakeChatMessage = typeof intakeChatMessages.$inferSelect;
export type NewIntakeChatMessage = typeof intakeChatMessages.$inferInsert;
