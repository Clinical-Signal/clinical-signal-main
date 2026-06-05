import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

import { env } from "@/lib/env";

/** Claude 3 Opus on Amazon Bedrock (HIPAA-eligible when under a BAA-covered account). */
export const BEDROCK_CLAUDE_3_OPUS_MODEL_ID =
  "anthropic.claude-3-opus-20240229-v1:0" as const;

const bedrock = createAmazonBedrock({
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
});

export function getBedrockChatModel() {
  return bedrock(BEDROCK_CLAUDE_3_OPUS_MODEL_ID);
}
