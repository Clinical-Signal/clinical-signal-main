import { generateText } from "ai";

import { createSmtpTransport } from "@/lib/email/smtp-transport";
import { getBedrockChatModel } from "@/lib/llm/bedrock";

import { integrationErrorDetail } from "./integration-error-detail";

export type IntegrationHealthResult = {
  bedrock: string;
  smtp: string;
};

async function testBedrockConnection(): Promise<string> {
  try {
    const { text } = await generateText({
      model: getBedrockChatModel(),
      prompt: 'Respond with the word "CONNECTED" only.',
      maxOutputTokens: 16,
      temperature: 0,
    });

    if (!text.toUpperCase().includes("CONNECTED")) {
      return `Error: Unexpected model reply (expected CONNECTED)`;
    }

    return "Success";
  } catch (error) {
    return integrationErrorDetail(error);
  }
}

async function testSmtpConnection(): Promise<string> {
  try {
    const transport = createSmtpTransport();
    await transport.verify();
    return "Success";
  } catch (error) {
    return integrationErrorDetail(error);
  }
}

export async function runIntegrationHealthCheck(): Promise<IntegrationHealthResult> {
  const [bedrock, smtp] = await Promise.all([
    testBedrockConnection(),
    testSmtpConnection(),
  ]);

  return { bedrock, smtp };
}
