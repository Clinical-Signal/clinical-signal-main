"use client";

import { useCallback, useState } from "react";

import { IntakeTransitionLoader } from "../intake-transition-loader";
import { StepTwoChat } from "./step-two-chat";
import type { ChatBubbleMessage } from "./step-two-chat-bubbles";
import type { UiChatBranch } from "@/lib/intake/partition-intake-chat-messages";

type StepTwoEntryProps = {
  token: string;
  initialMessages: ChatBubbleMessage[];
  initialBranches: Record<string, UiChatBranch>;
};

export function StepTwoEntry({
  token,
  initialMessages,
  initialBranches,
}: StepTwoEntryProps) {
  const needsBootstrap = initialMessages.length === 0;
  const [showTransitionLoader, setShowTransitionLoader] = useState(needsBootstrap);

  const handleBootstrapSettled = useCallback(() => {
    setShowTransitionLoader(false);
  }, []);

  return (
    <div className="relative h-[100dvh] w-full bg-canvas">
      {showTransitionLoader ? <IntakeTransitionLoader /> : null}
      <StepTwoChat
        token={token}
        initialMessages={initialMessages}
        initialBranches={initialBranches}
        onBootstrapSettled={needsBootstrap ? handleBootstrapSettled : undefined}
      />
    </div>
  );
}
