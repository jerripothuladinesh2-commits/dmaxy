import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maxy-chat`;

const speak = (text: string, onStart?: () => void, onEnd?: () => void) => {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const isTelugu = /[\u0C00-\u0C7F]/.test(text);
  utterance.lang = isTelugu ? "te-IN" : "en-US";
  utterance.rate = 1.0;
  utterance.pitch = 0.9;
  utterance.volume = 1;

  const voices = window.speechSynthesis.getVoices();
  const langPrefix = isTelugu ? "te" : "en";
  const preferred = voices.find((v) => v.lang.startsWith(langPrefix) && v.name.includes("Google"));
  const fallback = voices.find((v) => v.lang.startsWith(langPrefix));
  if (preferred) utterance.voice = preferred;
  else if (fallback) utterance.voice = fallback;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
};

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const maxRetries = 2;
  let attempt = 0;
  let resp: Response | null = null;

  while (attempt <= maxRetries) {
    resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });

    if (resp.status === 429 && attempt < maxRetries) {
      attempt++;
      await new Promise((r) => setTimeout(r, 3000 * attempt)); // wait 3s, then 6s
      continue;
    }
    break;
  }

  if (!resp || !resp.ok) {
    const data = await resp?.json().catch(() => ({})) || {};
    onError(data.error || `Error ${resp?.status}`);
    return;
  }

  if (!resp.body) {
    onError("No response body");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Flush remaining
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        /* skip */
      }
    }
  }

  onDone();
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
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const hasGreeted = useRef(false);
  const isListeningRef = useRef(isListening);
  const handleSendRef = useRef<(text: string) => void>(() => {});

  // Keep refs in sync
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // Initial greeting - local, no AI call to avoid rate limits
  useEffect(() => {
    if (hasGreeted.current) return;
    hasGreeted.current = true;

    const greetings = [
      "Good to see you, Boss DINESH. All systems online and operational. MAXY is at your service.",
      "నమస్కారం DINESH sir! MAXY సిద్ధంగా ఉంది. How can I assist you today?",
      "Welcome back, Boss DINESH. MAXY intelligence systems fully loaded. Ready for your command.",
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    setMessages([{
      id: "welcome",
      role: "assistant",
      content: greeting,
      timestamp: new Date(),
    }]);

    setTimeout(() => {
      if (voiceEnabled) {
        speak(
          greeting,
          () => { setIsSpeaking(true); onSpeakingChange?.(true); },
          () => { setIsSpeaking(false); onSpeakingChange?.(false); }
        );
      }
    }, 800);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Speech Recognition
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }
    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        handleSendRef.current(transcript.trim());
        setInput("");
      }
    };
    recognition.onerror = (e: any) => {
      console.error("Speech error:", e.error);
      if (e.error !== "no-speech") onToggleListen();
    };
    recognition.onend = () => {
      if (isListeningRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };
    recognition.start();
    recognitionRef.current = recognition;
  }, [onToggleListen]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isListening) startListening();
    else stopListening();
    return () => stopListening();
  }, [isListening, startListening, stopListening]);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isProcessing) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsProcessing(true);

      const newHistory = [...chatHistory, { role: "user", content: text.trim() }];
      let fullResponse = "";

      streamChat({
        messages: newHistory,
        onDelta: (chunk) => {
          fullResponse += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: fullResponse } : m))
          );
        },
        onDone: () => {
          setIsProcessing(false);
          setChatHistory([...newHistory, { role: "assistant", content: fullResponse }]);
          if (voiceEnabled && fullResponse) {
            speak(
              fullResponse,
              () => { setIsSpeaking(true); onSpeakingChange?.(true); },
              () => { setIsSpeaking(false); onSpeakingChange?.(false); }
            );
          }
        },
        onError: (err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: `Apologies Boss, something went wrong: ${err}` } : m
            )
          );
          setIsProcessing(false);
        },
      });
    },
    [isProcessing, voiceEnabled, onSpeakingChange, chatHistory]
  );

  // Keep ref in sync so speech recognition callback always has latest
  useEffect(() => { handleSendRef.current = handleSendMessage; }, [handleSendMessage]);

  const handleSend = () => {
    handleSendMessage(input);
    setInput("");
  };

  const toggleVoice = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      onSpeakingChange?.(false);
    }
    setVoiceEnabled((v) => !v);
  };

  return (
    <div className="flex flex-col h-full max-h-[480px] w-full max-w-lg">
      {/* Voice status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 mb-2">
        <div className="flex items-center gap-2">
          {isListening && (
            <div className="flex items-center gap-1.5 animate-fade-in-up">
              <span className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-1 bg-primary rounded-full"
                    style={{
                      height: `${8 + Math.random() * 12}px`,
                      animation: `typing-dot 0.8s ${i * 0.15}s ease-in-out infinite`,
                    }}
                  />
                ))}
              </span>
              <span className="text-[10px] font-display tracking-wider text-primary">LISTENING...</span>
            </div>
          )}
          {isSpeaking && (
            <div className="flex items-center gap-1.5 animate-fade-in-up">
              <span className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-1 bg-glow-warm rounded-full"
                    style={{
                      height: `${8 + Math.random() * 12}px`,
                      animation: `typing-dot 0.6s ${i * 0.1}s ease-in-out infinite`,
                    }}
                  />
                ))}
              </span>
              <span className="text-[10px] font-display tracking-wider text-glow-warm">MAXY SPEAKING...</span>
            </div>
          )}
          {isProcessing && !isSpeaking && (
            <span className="text-[10px] font-display tracking-wider text-muted-foreground animate-pulse">THINKING...</span>
          )}
        </div>
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

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-2 py-4 scrollbar-thin">
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-up`}
            style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
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
              {msg.content || (isProcessing && msg.role === "assistant" ? (
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/50" style={{ animation: `typing-dot 1s ${i * 0.2}s ease-in-out infinite` }} />
                  ))}
                </span>
              ) : null)}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="glass-surface rounded-2xl p-2 flex items-center gap-2 mt-2">
        <button
          onClick={onToggleListen}
          className={`p-2.5 rounded-xl transition-all duration-300 active:scale-95 ${
            isListening
              ? "bg-primary/20 text-primary box-glow-strong"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
          title={isListening ? "Stop listening" : "Start listening"}
        >
          {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
        </button>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={isListening ? "Listening to you, Boss..." : "Speak or type a command, Boss..."}
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
