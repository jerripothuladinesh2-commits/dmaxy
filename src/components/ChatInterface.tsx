import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maxy-chat`;

// ── Speech Synthesis ──
const speak = (text: string, onStart?: () => void, onEnd?: () => void) => {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();

  // Strip markdown for speech
  const clean = text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/[*_~`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  const utterance = new SpeechSynthesisUtterance(clean);
  const isTelugu = /[\u0C00-\u0C7F]/.test(clean);
  utterance.lang = isTelugu ? "te-IN" : "en-US";
  utterance.rate = 1.05;
  utterance.pitch = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const lang = isTelugu ? "te" : "en";
  const voice = voices.find(v => v.lang.startsWith(lang) && v.name.includes("Google"))
    || voices.find(v => v.lang.startsWith(lang));
  if (voice) utterance.voice = voice;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
};

// ── Streaming fetch ──
async function streamChat(
  messages: { role: string; content: string }[],
  onDelta: (text: string) => void,
  onDone: (full: string) => void,
  onError: (err: string) => void,
) {
  let attempts = 0;
  const maxRetries = 2;

  while (attempts <= maxRetries) {
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages }),
      });

      if (resp.status === 429 && attempts < maxRetries) {
        attempts++;
        await new Promise(r => setTimeout(r, 3000 * attempts));
        continue;
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        onError(data.error || `Error ${resp.status}`);
        return;
      }

      if (!resp.body) { onError("No response"); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx).replace(/\r$/, "");
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { onDone(full); return; }
          try {
            const c = JSON.parse(json).choices?.[0]?.delta?.content;
            if (c) { full += c; onDelta(c); }
          } catch { /* partial chunk, skip */ }
        }
      }
      onDone(full);
      return;
    } catch (e) {
      if (attempts >= maxRetries) {
        onError("Network error. Please check your connection.");
        return;
      }
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ── Component ──
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
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const hasGreeted = useRef(false);
  // Use refs for values needed inside recognition callbacks
  const stateRef = useRef({ isListening: false, isSpeaking: false });

  useEffect(() => { stateRef.current.isListening = isListening; }, [isListening]);
  useEffect(() => { stateRef.current.isSpeaking = isSpeaking; }, [isSpeaking]);

  // Load voices
  useEffect(() => {
    speechSynthesis?.getVoices();
    if (speechSynthesis) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }, []);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ── Greeting (local, no API call) ──
  useEffect(() => {
    if (hasGreeted.current) return;
    hasGreeted.current = true;
    const greetings = [
      "Systems online, Boss DINESH. MAXY at your service. What do you need?",
      "నమస్కారం Boss DINESH! MAXY ready. Ask me anything.",
      "All systems green, Boss. MAXY intelligence fully loaded. Let's get to work.",
    ];
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    setMessages([{ id: "welcome", role: "assistant", content: g }]);
    setTimeout(() => {
      speak(g,
        () => { setIsSpeaking(true); onSpeakingChange?.(true); },
        () => { setIsSpeaking(false); onSpeakingChange?.(false); }
      );
    }, 600);
  }, []);

  // ── Send message to AI ──
  const sendToAI = useCallback((text: string) => {
    if (!text.trim() || isProcessing) return;
    const uid = Date.now().toString();
    const aid = uid + "_a";

    const userMsg: Message = { id: uid, role: "user", content: text.trim() };
    const asstMsg: Message = { id: aid, role: "assistant", content: "" };

    setMessages(prev => [...prev, userMsg, asstMsg]);
    setIsProcessing(true);

    const newHist = [...history, { role: "user", content: text.trim() }];

    streamChat(
      newHist,
      (chunk) => {
        asstMsg.content += chunk;
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: asstMsg.content } : m));
      },
      (full) => {
        setIsProcessing(false);
        setHistory([...newHist, { role: "assistant", content: full }]);
        if (voiceEnabled && full) {
          speak(full,
            () => { setIsSpeaking(true); onSpeakingChange?.(true); },
            () => { setIsSpeaking(false); onSpeakingChange?.(false); }
          );
        }
      },
      (err) => {
        setMessages(prev => prev.map(m =>
          m.id === aid ? { ...m, content: `Sorry Boss, hit a snag: ${err}` } : m
        ));
        setIsProcessing(false);
      }
    );
  }, [isProcessing, voiceEnabled, onSpeakingChange, history]);

  // Keep a ref so recognition callbacks always call the latest version
  const sendRef = useRef(sendToAI);
  useEffect(() => { sendRef.current = sendToAI; }, [sendToAI]);

  // ── Speech Recognition ──
  const startMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // Stop existing
    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
      recRef.current = null;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) {
        setInput("");
        sendRef.current(text.trim());
      }
    };

    rec.onerror = (e: any) => {
      // Ignore non-fatal errors (aborted, no-speech, network)
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        onToggleListen();
      }
      // All other errors: let onend handle restart
    };

    rec.onend = () => {
      recRef.current = null;
      // Restart if still supposed to be listening and not speaking
      if (stateRef.current.isListening && !stateRef.current.isSpeaking) {
        setTimeout(() => {
          if (stateRef.current.isListening && !stateRef.current.isSpeaking) {
            startMic();
          }
        }, 500);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
    } catch {}
  }, [onToggleListen]);

  const stopMic = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
      recRef.current = null;
    }
  }, []);

  // Start/stop mic based on isListening
  useEffect(() => {
    if (isListening && !isSpeaking) {
      startMic();
    } else {
      stopMic();
    }
    return () => stopMic();
  }, [isListening]);

  // Pause mic while speaking, resume after
  useEffect(() => {
    if (isSpeaking) {
      stopMic();
    } else if (isListening) {
      // Delay restart so audio output clears
      const t = setTimeout(() => {
        if (stateRef.current.isListening && !stateRef.current.isSpeaking) {
          startMic();
        }
      }, 800);
      return () => clearTimeout(t);
    }
  }, [isSpeaking]);

  const handleSend = () => {
    if (input.trim()) {
      sendToAI(input.trim());
      setInput("");
    }
  };

  const toggleVoice = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      onSpeakingChange?.(false);
    }
    setVoiceEnabled(v => !v);
  };

  return (
    <div className="flex flex-col h-full max-h-[480px] w-full max-w-lg">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 mb-1">
        <div className="flex items-center gap-2 min-h-[20px]">
          {isListening && !isSpeaking && (
            <div className="flex items-center gap-1.5 animate-fade-in-up">
              <span className="flex gap-0.5">
                {[0,1,2,3,4].map(i => (
                  <span key={i} className="w-1 bg-primary rounded-full"
                    style={{ height: `${8 + Math.random() * 12}px`, animation: `typing-dot 0.8s ${i * 0.15}s ease-in-out infinite` }} />
                ))}
              </span>
              <span className="text-[10px] font-display tracking-wider text-primary">LISTENING</span>
            </div>
          )}
          {isSpeaking && (
            <div className="flex items-center gap-1.5 animate-fade-in-up">
              <span className="flex gap-0.5">
                {[0,1,2,3,4].map(i => (
                  <span key={i} className="w-1 bg-glow-warm rounded-full"
                    style={{ height: `${8 + Math.random() * 12}px`, animation: `typing-dot 0.6s ${i * 0.1}s ease-in-out infinite` }} />
                ))}
              </span>
              <span className="text-[10px] font-display tracking-wider text-glow-warm">MAXY SPEAKING</span>
            </div>
          )}
          {isProcessing && !isSpeaking && !isListening && (
            <span className="text-[10px] font-display tracking-wider text-muted-foreground animate-pulse">THINKING...</span>
          )}
        </div>
        <button onClick={toggleVoice}
          className={`p-1.5 rounded-lg transition-all duration-200 active:scale-95 ${voiceEnabled ? "text-primary" : "text-muted-foreground"}`}
          title={voiceEnabled ? "Mute MAXY" : "Unmute MAXY"}>
          {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-2 py-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-up`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed font-body ${
              msg.role === "user"
                ? "bg-primary/20 border border-primary/30 text-foreground"
                : "glass-surface text-foreground"
            }`}>
              {msg.role === "assistant" && (
                <span className="text-[10px] font-display tracking-widest text-primary/70 block mb-1">M.A.X.Y</span>
              )}
              {msg.content || (
                <span className="flex gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/50"
                      style={{ animation: `typing-dot 1s ${i * 0.2}s ease-in-out infinite` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="glass-surface rounded-2xl p-2 flex items-center gap-2 mt-2">
        <button onClick={onToggleListen}
          className={`p-2.5 rounded-xl transition-all duration-300 active:scale-95 ${
            isListening
              ? "bg-primary/20 text-primary box-glow-strong"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}>
          {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
        </button>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder={isListening ? "Listening, Boss..." : "Type a command, Boss..."}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-body"
        />

        <button onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          className="p-2.5 rounded-xl text-primary hover:bg-primary/10 transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
