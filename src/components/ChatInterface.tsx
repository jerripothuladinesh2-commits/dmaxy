import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Extend window for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

const GREETINGS = [
  "Good to see you, Boss DINESH. All systems are online and operational.",
  "నమస్కారం DINESH sir. మీ సేవలో సిద్ధంగా ఉన్నాను.",
  "Welcome back, DINESH. How may I assist you today?",
];

const RESPONSES: Record<string, string[]> = {
  hello: [
    "Hello Boss DINESH! MAXY is at your service.",
    "Hey Boss! All systems operational. What can I do for you?",
  ],
  namaste: [
    "నమస్కారం Boss DINESH! చెప్పండి, ఏం చేయమంటారు?",
    "నమస్తే sir! MAXY సిద్ధంగా ఉంది.",
  ],
  "how are you": [
    "I'm running at optimal capacity, Boss. All cores engaged and ready.",
    "Systems are perfect, sir. More importantly, how can I help you?",
  ],
  time: [
    `The current time is ${new Date().toLocaleTimeString("en-IN")}. Anything else, Boss?`,
  ],
  "who are you": [
    "I am MAXY, your personal AI intelligence system. Built exclusively for Boss DINESH. I can understand Telugu and English, and I'm always ready to assist you.",
  ],
  "your name": [
    "My name is MAXY, sir. Your personal AI assistant, always at your command.",
  ],
  thanks: [
    "Always a pleasure, Boss DINESH.",
    "You're welcome, sir. That's what I'm here for.",
  ],
  default: [
    "Understood, Boss DINESH. Processing your request now.",
    "Affirmative. I'll take care of that right away, sir.",
    "అర్థమైంది DINESH sir. వెంటనే చేస్తాను.",
    "Running analysis. Results will be ready momentarily.",
    "Of course, Boss. Consider it done.",
    "Roger that. MAXY is on it, sir.",
  ],
};

const getResponse = (input: string): string => {
  const lower = input.toLowerCase();
  for (const [key, responses] of Object.entries(RESPONSES)) {
    if (key !== "default" && lower.includes(key)) {
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }
  // Check Telugu greetings
  if (lower.includes("నమస్") || lower.includes("ఏం") || lower.includes("ఎలా")) {
    const teluguResponses = [
      "అర్థమైంది Boss DINESH. MAXY మీ కోసం పని చేస్తుంది.",
      "చెప్పండి sir, MAXY సిద్ధంగా ఉంది.",
      "అవును Boss, వెంటనే చేస్తాను.",
    ];
    return teluguResponses[Math.floor(Math.random() * teluguResponses.length)];
  }
  return RESPONSES.default[Math.floor(Math.random() * RESPONSES.default.length)];
};

// Speech synthesis helper
const speak = (text: string, onStart?: () => void, onEnd?: () => void) => {
  if (!("speechSynthesis" in window)) return;
  
  window.speechSynthesis.cancel(); // Cancel any ongoing speech

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Detect if text contains Telugu characters
  const isTelugu = /[\u0C00-\u0C7F]/.test(text);
  utterance.lang = isTelugu ? "te-IN" : "en-US";
  utterance.rate = 1.0;
  utterance.pitch = 0.9;
  utterance.volume = 1;

  // Try to find a good voice
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = isTelugu ? "te" : "en";
  const preferred = voices.find(v => v.lang.startsWith(langPrefix) && v.name.includes("Google"));
  const fallback = voices.find(v => v.lang.startsWith(langPrefix));
  if (preferred) utterance.voice = preferred;
  else if (fallback) utterance.voice = fallback;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
};

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const hasGreeted = useRef(false);

  // Load voices
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Initial greeting with voice
  useEffect(() => {
    if (hasGreeted.current) return;
    hasGreeted.current = true;
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    const welcomeMsg: Message = {
      id: "welcome",
      role: "assistant",
      content: greeting,
      timestamp: new Date(),
    };
    setMessages([welcomeMsg]);

    // Speak greeting after a short delay
    setTimeout(() => {
      speak(
        greeting,
        () => { setIsSpeaking(true); onSpeakingChange?.(true); },
        () => { setIsSpeaking(false); onSpeakingChange?.(false); }
      );
    }, 800);
  }, [onSpeakingChange]);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Speech Recognition setup
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US"; // Will also pick up Telugu in practice
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      // If final result, auto-send
      if (event.results[event.results.length - 1].isFinal) {
        handleSendMessage(transcript.trim());
        setInput("");
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      onToggleListen();
    };

    recognition.onend = () => {
      // If still supposed to be listening, restart
      if (isListening) {
        try { recognition.start(); } catch (e) { /* ignore */ }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  // Toggle listening
  useEffect(() => {
    if (isListening) {
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [isListening, startListening, stopListening]);

  const handleSendMessage = useCallback((text: string) => {
    if (!text.trim() || isProcessing) return;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    // Generate and speak response
    setTimeout(() => {
      const response = getResponse(text);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsProcessing(false);

      // Speak the response
      if (voiceEnabled) {
        speak(
          response,
          () => { setIsSpeaking(true); onSpeakingChange?.(true); },
          () => { setIsSpeaking(false); onSpeakingChange?.(false); }
        );
      }
    }, 800);
  }, [isProcessing, voiceEnabled, onSpeakingChange]);

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
            <span className="text-[10px] font-display tracking-wider text-muted-foreground animate-pulse">PROCESSING...</span>
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
            style={{ animationDelay: `${Math.min(i * 0.08, 0.4)}s` }}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed font-body ${
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
              {msg.content}
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
