"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

type UseStepTwoSpeechInput = {
  value: string;
  onValueChange: (next: string) => void;
  disabled?: boolean;
};

export function useStepTwoSpeech({
  value,
  onValueChange,
  disabled = false,
}: UseStepTwoSpeechInput) {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantsRecordingRef = useRef(false);
  const prefixRef = useRef("");
  const finalRef = useRef("");

  useEffect(() => {
    setIsSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const stopRecording = useCallback(() => {
    wantsRecordingRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    prefixRef.current = "";
    finalRef.current = "";
  }, []);

  const buildTranscript = useCallback((interim: string) => {
    const parts = [prefixRef.current.trimEnd(), finalRef.current.trim(), interim.trim()].filter(
      (part) => part.length > 0,
    );
    return parts.join(" ");
  }, []);

  const applyTranscript = useCallback(
    (interim: string) => {
      onValueChange(buildTranscript(interim));
    },
    [buildTranscript, onValueChange],
  );

  const startRecording = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || disabled) {
      return;
    }

    stopRecording();

    prefixRef.current = value;
    finalRef.current = "";

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const chunk = event.results[index]?.[0]?.transcript ?? "";
        if (event.results[index]?.isFinal) {
          finalRef.current += chunk;
        } else {
          interim += chunk;
        }
      }
      applyTranscript(interim);
    };

    recognition.onerror = () => {
      stopRecording();
    };

    recognition.onend = () => {
      if (!wantsRecordingRef.current || recognitionRef.current !== recognition) {
        return;
      }
      try {
        recognition.start();
      } catch {
        stopRecording();
      }
    };

    wantsRecordingRef.current = true;
    recognitionRef.current = recognition;
    setIsRecording(true);

    try {
      recognition.start();
    } catch {
      stopRecording();
    }
  }, [applyTranscript, disabled, stopRecording, value]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return {
    isSupported,
    isRecording,
    toggleRecording,
    stopRecording,
  };
}
