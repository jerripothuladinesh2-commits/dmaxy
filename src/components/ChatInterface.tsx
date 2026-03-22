import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, Languages } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type RecognitionLanguage = "en-IN" | "te-IN";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maxy-chat`;

const WEB_APP_COMMANDS = [
  { keys: ["youtube"], name: "YouTube", url: "https://www.youtube.com" },
  { keys: ["gmail", "mail"], name: "Gmail", url: "https://mail.google.com" },
  { keys: ["whatsapp"], name: "WhatsApp Web", url: "https://web.whatsapp.com" },
  { keys: ["github"], name: "GitHub", url: "https://github.com" },
  { keys: ["chatgpt"], name: "ChatGPT", url: "https://chat.openai.com" },
  { keys: ["spotify"], name: "Spotify", url: "https://open.spotify.com" },
  { keys: ["google"], name: "Google", url: "https://www.google.com" },
] as const;

const speak = (text: string, onStart?: () => void, onEnd?: () => void) => {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const clean = text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/[*_~`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  const utterance = new SpeechSynthesisUtterance(clean);
  const isTelugu = /[\u0C00-\u0C7F]/.test(clean);
  utterance.lang = isTelugu ? "te-IN" : "en-US";
  utterance.rate = 1.03;
  utterance.pitch = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const langPrefix = isTelugu ? "te" : "en";
  const voice =
    voices.find((v) => v.lang.startsWith(langPrefix) && v.name.includes("Google")) ||
    voices.find((v) => v.lang.startsWith(langPrefix));
  if (voice) utterance.voice = voice;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
};

async function streamChat(
  messages: { role: string; content: string }[],
  onDelta: (chunk: string) => void,
  onDone: (full: string) => void,
  onError: (error: string) => void,
) {
  let attempt = 0;
  const maxRetries = 2;

  while (attempt <= maxRetries) {
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages }),
      });

      if (resp.status === 429 && attempt < maxRetries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 2500 * attempt));
        continue;
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        onError(data.error || `Error ${resp.status}`);
        return;
      }

      if (!resp.body) {
        onError("No response from MAXY");
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            onDone(full);
            return;
          }

          try {
            const chunk = JSON.parse(json).choices?.[0]?.delta?.content;
            if (chunk) {
              full += chunk;
              onDelta(chunk);
            }
          } catch {
            // Partial json chunk, wait for more
          }
        }
      }

      onDone(full);
      return;
    } catch {
      if (attempt >= maxRetries) {
        onError("Network issue. Please try again, Boss.");
        return;
      }
      attempt += 1;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

const ChatInterface = ({
  isListening,
  onToggleListen,
  onSpeakingChange,
}: {
  isListening: boolean;
  onToggleListen: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionLang, setRecognitionLang] = useState<RecognitionLanguage>("en-IN");

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<number | null>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const hasGreetedRef = useRef(false);
  const lastTranscriptRef = useRef({ text: "", ts: 0 });
  const speechSupportedRef = useRef<boolean>(
    typeof window !== "undefined" &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );

  const liveStateRef = useRef({
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    shouldRestartMic: false,
  });

  useEffect(() => {
    liveStateRef.current.isListening = isListening;
    liveStateRef.current.shouldRestartMic = isListening;
  }, [isListening]);

  useEffect(() => {
    liveStateRef.current.isSpeaking = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    liveStateRef.current.isProcessing = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const addAssistantMessage = useCallback((text: string) => {
    const msg: Message = { id: `${Date.now()}_assistant`, role: "assistant", content: text };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const scheduleMicRestart = useCallback((delay = 500) => {
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      if (
        liveStateRef.current.shouldRestartMic &&
        !liveStateRef.current.isSpeaking &&
        !liveStateRef.current.isProcessing &&
        !recognitionRef.current
      ) {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;

        const recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = recognitionLang;
        recognition.maxAlternatives = 3;

        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            transcript += event.results[i][0].transcript;
          }
          setInput(transcript);

          const latest = event.results[event.results.length - 1];
          if (latest?.isFinal) {
            const finalText = transcript.trim();
            setInput("");

            const now = Date.now();
            const normalized = finalText.toLowerCase();
            const duplicateFastRepeat =
              normalized &&
              normalized === lastTranscriptRef.current.text &&
              now - lastTranscriptRef.current.ts < 1800;

            if (!duplicateFastRepeat && normalized.length > 0) {
              lastTranscriptRef.current = { text: normalized, ts: now };
              sendRef.current(finalText);
            }
          }
        };

        recognition.onerror = (event: any) => {
          const error = event?.error;
          if (error === "not-allowed" || error === "service-not-allowed") {
            if (liveStateRef.current.isListening) onToggleListen();
            return;
          }
          // ignore aborted/no-speech/network and let onend restart
        };

        recognition.onend = () => {
          recognitionRef.current = null;
          if (
            liveStateRef.current.shouldRestartMic &&
            !liveStateRef.current.isSpeaking &&
            !liveStateRef.current.isProcessing
          ) {
            scheduleMicRestart(350);
          }
        };

        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }
    }, delay);
  }, [onToggleListen, recognitionLang]);

  const stopMic = useCallback((disableRestart = false) => {
    if (disableRestart) liveStateRef.current.shouldRestartMic = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  const handleAppCommand = useCallback(
    (text: string): boolean => {
      const lower = text.toLowerCase().trim();
      if (!lower.startsWith("open ") && !lower.includes("open")) return false;

      const command = WEB_APP_COMMANDS.find((app) => app.keys.some((k) => lower.includes(k)));
      if (command) {
        window.open(command.url, "_blank", "noopener,noreferrer");
        const reply = `Opening ${command.name} now, Boss.`;
        addAssistantMessage(reply);
        if (voiceEnabled) {
          speak(
            reply,
            () => {
              setIsSpeaking(true);
              onSpeakingChange?.(true);
            },
            () => {
              setIsSpeaking(false);
              onSpeakingChange?.(false);
            },
          );
        }
        return true;
      }

      if (lower.includes("calculator") || lower.includes("camera") || lower.includes("settings")) {
        addAssistantMessage(
          "Boss, I can open web apps by voice in this browser. Direct laptop/mobile system app control needs native permissions outside browser security.",
        );
        return true;
      }

      if (lower.startsWith("open ")) {
        const query = encodeURIComponent(text.replace(/^open\s+/i, ""));
        window.open(`https://www.google.com/search?q=${query}`, "_blank", "noopener,noreferrer");
        addAssistantMessage("Opening search results, Boss.");
        return true;
      }

      return false;
    },
    [addAssistantMessage, voiceEnabled, onSpeakingChange],
  );

  const sendToAI = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || liveStateRef.current.isProcessing) return;

      const userId = `${Date.now()}_user`;
      const assistantId = `${Date.now()}_assistant_pending`;

      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: trimmed },
        { id: assistantId, role: "assistant", content: "" },
      ]);

      if (handleAppCommand(trimmed)) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      setIsProcessing(true);
      liveStateRef.current.shouldRestartMic = false;
      stopMic(false);

      const context = [...historyRef.current, { role: "user", content: trimmed }];
      let full = "";

      streamChat(
        context,
        (chunk) => {
          full += chunk;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: full } : m)));
        },
        (doneText) => {
          setIsProcessing(false);
          historyRef.current = [...context, { role: "assistant", content: doneText }];

          if (voiceEnabled && doneText) {
            speak(
              doneText,
              () => {
                setIsSpeaking(true);
                onSpeakingChange?.(true);
              },
              () => {
                setIsSpeaking(false);
                onSpeakingChange?.(false);
              },
            );
          }

          if (liveStateRef.current.isListening) {
            liveStateRef.current.shouldRestartMic = true;
            if (!voiceEnabled) scheduleMicRestart(450);
          }
        },
        (errorText) => {
          setIsProcessing(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Sorry Boss, I hit an issue: ${errorText}` }
                : m,
            ),
          );

          if (liveStateRef.current.isListening) {
            liveStateRef.current.shouldRestartMic = true;
            scheduleMicRestart(500);
          }
        },
      );
    },
    [handleAppCommand, onSpeakingChange, scheduleMicRestart, stopMic, voiceEnabled],
  );

  const sendRef = useRef(sendToAI);
  useEffect(() => {
    sendRef.current = sendToAI;
  }, [sendToAI]);

  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const greetings = [
      "Systems online, Boss DINESH. MAXY at your service.",
      "నమస్కారం బాస్! MAXY సిద్ధంగా ఉంది.",
      "All systems green, Boss. MAXY intelligence fully loaded.",
    ];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    setMessages([{ id: "welcome", role: "assistant", content: greeting }]);

    setTimeout(() => {
      if (voiceEnabled) {
        speak(
          greeting,
          () => {
            setIsSpeaking(true);
            onSpeakingChange?.(true);
          },
          () => {
            setIsSpeaking(false);
            onSpeakingChange?.(false);
          },
        );
      }
    }, 500);
  }, [onSpeakingChange, voiceEnabled]);

  useEffect(() => {
    if (!speechSupportedRef.current) return;

    if (isListening && !isSpeaking && !isProcessing) {
      liveStateRef.current.shouldRestartMic = true;
      scheduleMicRestart(250);
    }

    if (!isListening) {
      stopMic(true);
    }
  }, [isListening, isSpeaking, isProcessing, scheduleMicRestart, stopMic]);

  useEffect(() => {
    if (isSpeaking) {
      stopMic(false);
    } else if (isListening && !isProcessing) {
      liveStateRef.current.shouldRestartMic = true;
      scheduleMicRestart(700);
    }
  }, [isSpeaking, isListening, isProcessing, scheduleMicRestart, stopMic]);

  useEffect(
    () => () => {
      stopMic(true);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [stopMic],
  );

  const handleSend = () => {
    if (!input.trim()) return;
    sendToAI(input.trim());
    setInput("");
  };

  const toggleVoice = () => {
    if (isSpeaking && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      onSpeakingChange?.(false);
    }
    setVoiceEnabled((v) => !v);
  };

  const toggleLang = () => {
    setRecognitionLang((prev) => (prev === "en-IN" ? "te-IN" : "en-IN"));
    if (isListening) {
      stopMic(false);
      liveStateRef.current.shouldRestartMic = true;
      scheduleMicRestart(350);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[480px] w-full max-w-lg">
      <div className="flex items-center justify-between px-3 py-1.5 mb-1">
        <div className="flex items-center gap-2 min-h-[20px]">
          {!speechSupportedRef.current && (
            <span className="text-[10px] font-display tracking-wider text-destructive">
              MIC NOT SUPPORTED IN THIS BROWSER
            </span>
          )}
          {speechSupportedRef.current && isListening && !isSpeaking && (
            <span className="text-[10px] font-display tracking-wider text-primary">LISTENING</span>
          )}
          {isSpeaking && (
            <span className="text-[10px] font-display tracking-wider text-glow-warm">MAXY SPEAKING</span>
          )}
          {isProcessing && (
            <span className="text-[10px] font-display tracking-wider text-muted-foreground animate-pulse">THINKING...</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleLang}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            title={`Mic language: ${recognitionLang}`}
          >
            <Languages className="w-4 h-4" />
          </button>
          <span className="text-[10px] font-display tracking-wider text-muted-foreground px-1">
            {recognitionLang === "en-IN" ? "EN" : "TE"}
          </span>
          <button
            onClick={toggleVoice}
            className={`p-1.5 rounded-lg transition-all duration-200 active:scale-95 ${
              voiceEnabled ? "text-primary" : "text-muted-foreground"
            }`}
            title={voiceEnabled ? "Mute MAXY" : "Unmute MAXY"}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-2 py-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-up`}
          >
            <div
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed font-body ${
                msg.role === "user"
                  ? "bg-primary/20 border border-primary/30 text-foreground"
                  : "glass-surface text-foreground"
              }`}
            >
              {msg.role === "assistant" && (
                <span className="text-[10px] font-display tracking-widest text-primary/70 block mb-1">
                  M.A.X.Y
                </span>
              )}
              {msg.content || (
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary/50"
                      style={{ animation: `typing-dot 1s ${i * 0.2}s ease-in-out infinite` }}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-surface rounded-2xl p-2 flex items-center gap-2 mt-2">
        <button
          onClick={onToggleListen}
          className={`p-2.5 rounded-xl transition-all duration-300 active:scale-95 ${
            isListening
              ? "bg-primary/20 text-primary box-glow-strong"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
          disabled={!speechSupportedRef.current}
          title={speechSupportedRef.current ? "Toggle mic" : "Mic not supported"}
        >
          {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
        </button>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={isListening ? "Listening, Boss..." : "Type or speak a command, Boss..."}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-body"
        />

        <button
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          className="p-2.5 rounded-xl text-primary hover:bg-primary/10 transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
