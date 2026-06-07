import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

import { env } from "@/lib/env";

/** Claude Opus 4.8 on Amazon Bedrock (HIPAA-eligible when under a BAA-covered account). */
/** Regional inference profile — on-demand invoke requires profile ID, not raw model ID. */
export const BEDROCK_CLAUDE_OPUS_MODEL_ID = "us.anthropic.claude-opus-4-8" as const;

const bedrock = createAmazonBedrock({
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
});

export function getBedrockChatModel() {
  return bedrock(BEDROCK_CLAUDE_OPUS_MODEL_ID);
}
