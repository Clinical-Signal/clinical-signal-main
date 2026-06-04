import { INTAKE_CHAT_BRANCH_MAX_USER_TURNS } from "./intake-chat-constants";
import { loadIntakeChatPrompt } from "./load-intake-chat-prompt";

const BRANCH_PROMPT_FILE = "intake_chat_branch_v1.md";

type BuildBranchChatSystemPromptInput = {
  originalContent: string;
  editedContent: string;
  gatekeeperReason: string;
  branchUserTurns: number;
};

export function buildBranchChatSystemPrompt(
  input: BuildBranchChatSystemPromptInput,
): string {
  const base = loadIntakeChatPrompt(BRANCH_PROMPT_FILE);
  const remaining = Math.max(
    0,
    INTAKE_CHAT_BRANCH_MAX_USER_TURNS - input.branchUserTurns,
  );

  return `${base}

## Session state (authoritative)
- The patient edited an earlier answer. Investigate only this change.
- Gatekeeper reason: ${input.gatekeeperReason}
- Original answer: """${input.originalContent}"""
- Corrected answer: """${input.editedContent}"""
- You may ask at most ${remaining} more patient-facing question(s) in this nested thread (soft maximum ${INTAKE_CHAT_BRANCH_MAX_USER_TURNS}).
- Stop immediately once the new clinical detail is clear; do not pad with extra questions.`;
}
