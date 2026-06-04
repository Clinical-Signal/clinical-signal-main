import { withTenantContext } from "@cs/db";
import type { TenantContext } from "@cs/core";
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import {
  intakeChatMessages,
  type IntakeChatRole,
} from "@/lib/db/schema/intake-chat-messages";

import { INTAKE_CHAT_KICKOFF_MESSAGE } from "./intake-chat-constants";

export type IntakeChatMessageRow = {
  id: string;
  role: IntakeChatRole;
  content: string;
  parentMessageId: string | null;
  createdAt: Date;
};

function tenantContext(tenantId: string): TenantContext {
  return {
    tenantId,
    practitionerId: "00000000-0000-0000-0000-000000000000",
    sessionId: "intake-chat",
    role: "practitioner",
    lifecycleStatus: "active",
  };
}

function mapRow(row: {
  id: string;
  role: IntakeChatRole;
  content: string;
  parentMessageId: string | null;
  createdAt: Date;
}): IntakeChatMessageRow {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    parentMessageId: row.parentMessageId,
    createdAt: row.createdAt,
  };
}

export async function listIntakeChatMessages(
  tenantId: string,
  intakeTokenId: string,
): Promise<IntakeChatMessageRow[]> {
  return withTenantContext(tenantContext(tenantId), async (client) => {
    const db = drizzle(client);
    const rows = await db
      .select({
        id: intakeChatMessages.id,
        role: intakeChatMessages.role,
        content: intakeChatMessages.content,
        parentMessageId: intakeChatMessages.parentMessageId,
        createdAt: intakeChatMessages.createdAt,
      })
      .from(intakeChatMessages)
      .where(
        and(
          eq(intakeChatMessages.tenantId, tenantId),
          eq(intakeChatMessages.intakeTokenId, intakeTokenId),
        ),
      )
      .orderBy(asc(intakeChatMessages.createdAt));

    return rows.map(mapRow);
  });
}

export async function listMainIntakeChatMessages(
  tenantId: string,
  intakeTokenId: string,
): Promise<IntakeChatMessageRow[]> {
  return withTenantContext(tenantContext(tenantId), async (client) => {
    const db = drizzle(client);
    const rows = await db
      .select({
        id: intakeChatMessages.id,
        role: intakeChatMessages.role,
        content: intakeChatMessages.content,
        parentMessageId: intakeChatMessages.parentMessageId,
        createdAt: intakeChatMessages.createdAt,
      })
      .from(intakeChatMessages)
      .where(
        and(
          eq(intakeChatMessages.tenantId, tenantId),
          eq(intakeChatMessages.intakeTokenId, intakeTokenId),
          isNull(intakeChatMessages.parentMessageId),
        ),
      )
      .orderBy(asc(intakeChatMessages.createdAt));

    return rows.map(mapRow);
  });
}

export async function listBranchIntakeChatMessages(
  tenantId: string,
  intakeTokenId: string,
  parentMessageId: string,
): Promise<IntakeChatMessageRow[]> {
  return withTenantContext(tenantContext(tenantId), async (client) => {
    const db = drizzle(client);
    const rows = await db
      .select({
        id: intakeChatMessages.id,
        role: intakeChatMessages.role,
        content: intakeChatMessages.content,
        parentMessageId: intakeChatMessages.parentMessageId,
        createdAt: intakeChatMessages.createdAt,
      })
      .from(intakeChatMessages)
      .where(
        and(
          eq(intakeChatMessages.tenantId, tenantId),
          eq(intakeChatMessages.intakeTokenId, intakeTokenId),
          eq(intakeChatMessages.parentMessageId, parentMessageId),
        ),
      )
      .orderBy(asc(intakeChatMessages.createdAt));

    return rows.map(mapRow);
  });
}

export async function getIntakeChatMessageById(input: {
  tenantId: string;
  intakeTokenId: string;
  messageId: string;
}): Promise<IntakeChatMessageRow | null> {
  return withTenantContext(tenantContext(input.tenantId), async (client) => {
    const db = drizzle(client);
    const rows = await db
      .select({
        id: intakeChatMessages.id,
        role: intakeChatMessages.role,
        content: intakeChatMessages.content,
        parentMessageId: intakeChatMessages.parentMessageId,
        createdAt: intakeChatMessages.createdAt,
      })
      .from(intakeChatMessages)
      .where(
        and(
          eq(intakeChatMessages.tenantId, input.tenantId),
          eq(intakeChatMessages.intakeTokenId, input.intakeTokenId),
          eq(intakeChatMessages.id, input.messageId),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? mapRow(row) : null;
  });
}

export async function updateIntakeChatMessageContent(input: {
  tenantId: string;
  intakeTokenId: string;
  messageId: string;
  content: string;
}): Promise<void> {
  await withTenantContext(tenantContext(input.tenantId), async (client) => {
    const db = drizzle(client);
    await db
      .update(intakeChatMessages)
      .set({ content: input.content })
      .where(
        and(
          eq(intakeChatMessages.tenantId, input.tenantId),
          eq(intakeChatMessages.intakeTokenId, input.intakeTokenId),
          eq(intakeChatMessages.id, input.messageId),
        ),
      );
  });
}

export async function insertIntakeChatMessage(input: {
  tenantId: string;
  intakeTokenId: string;
  role: IntakeChatRole;
  content: string;
  parentMessageId?: string;
}): Promise<string> {
  return withTenantContext(tenantContext(input.tenantId), async (client) => {
    const db = drizzle(client);
    const [row] = await db
      .insert(intakeChatMessages)
      .values({
        intakeTokenId: input.intakeTokenId,
        tenantId: input.tenantId,
        role: input.role,
        content: input.content,
        parentMessageId: input.parentMessageId ?? null,
      })
      .returning({ id: intakeChatMessages.id });

    return row!.id;
  });
}

export function countPatientChatTurns(messages: IntakeChatMessageRow[]): number {
  return messages.filter(
    (message) =>
      message.role === "user" && message.content !== INTAKE_CHAT_KICKOFF_MESSAGE,
  ).length;
}
