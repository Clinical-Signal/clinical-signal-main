import { describe, expect, it } from "vitest";

import {
  budgetForcesTermination,
  computeIntakeChatBudget,
  resolveIntakeChatIsComplete,
} from "./intake-chat-budget";
import { buildIntakeChatClosingMessage } from "./intake-chat-closing";
import { INTAKE_CHAT_KICKOFF_MESSAGE } from "./intake-chat-constants";
import type { IntakeChatMessageRow } from "./intake-chat-store";

function row(
  role: IntakeChatMessageRow["role"],
  content: string,
  index: number,
): IntakeChatMessageRow {
  return {
    id: String(index),
    role,
    content,
    parentMessageId: null,
    createdAt: new Date(0),
  };
}

describe("intake chat budget", () => {
  it("ignores kickoff in user turn count", () => {
    const budget = computeIntakeChatBudget([
      row("user", INTAKE_CHAT_KICKOFF_MESSAGE, 0),
      row("assistant", "Hello", 1),
    ]);
    expect(budget.userTurns).toBe(0);
    expect(budget.assistantTurns).toBe(1);
  });

  it("forces termination at 21 persisted messages", () => {
    const messages: IntakeChatMessageRow[] = [
      row("user", INTAKE_CHAT_KICKOFF_MESSAGE, 0),
    ];
    for (let index = 0; index < 10; index += 1) {
      messages.push(row("assistant", `Q${index}`, messages.length));
      messages.push(row("user", `A${index}`, messages.length));
    }
    const budget = computeIntakeChatBudget(messages);
    expect(budget.totalMessages).toBe(21);
    expect(budgetForcesTermination(budget)).toBe(true);
  });

  it("ignores early completion marker before minimum interview depth", () => {
    const closing = buildIntakeChatClosingMessage("Jane");
    const messages = [
      row("user", INTAKE_CHAT_KICKOFF_MESSAGE, 0),
      row("assistant", "Q1", 1),
      row("user", "A1", 2),
      row("assistant", closing, 3),
    ];
    const budget = computeIntakeChatBudget(messages);
    expect(budget.assistantTurns).toBe(2);
    expect(
      resolveIntakeChatIsComplete({
        budget,
        assistantReply: closing,
        interviewCompleteMarker: true,
      }),
    ).toBe(false);
  });

  it("detects closing phrase as complete after minimum depth", () => {
    const closing = buildIntakeChatClosingMessage("Jane");
    const messages: IntakeChatMessageRow[] = [
      row("user", INTAKE_CHAT_KICKOFF_MESSAGE, 0),
    ];
    for (let index = 0; index < 7; index += 1) {
      messages.push(row("assistant", `Q${index}`, messages.length));
      messages.push(row("user", `A${index}`, messages.length));
    }
    messages.push(row("assistant", closing, messages.length));
    const budget = computeIntakeChatBudget(messages);
    expect(budget.assistantTurns).toBe(8);
    expect(
      resolveIntakeChatIsComplete({
        budget,
        assistantReply: closing,
        interviewCompleteMarker: true,
      }),
    ).toBe(true);
  });
});
