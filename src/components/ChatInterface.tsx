import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const GREETINGS = [
  "Good to see you, Boss DINESH. All systems are online and operational.",
  "నమస్కారం DINESH sir. మీ సేవలో సిద్ధంగా ఉన్నాను.",
  "Welcome back, DINESH. How may I assist you today?",
];

const ChatInterface = ({ isListening, onToggleListen }: { isListening: boolean; onToggleListen: () => void }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulate response
    setTimeout(() => {
      const responses = [
        `Understood, Boss DINESH. Processing your request now.`,
        `Affirmative. I'll take care of that right away, sir.`,
        `అర్థమైంది DINESH sir. వెంటనే చేస్తాను.`,
        `Running analysis. Results will be ready momentarily.`,
        `Of course, Boss. Consider it done.`,
      ];
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: responses[Math.floor(Math.random() * responses.length)],
          timestamp: new Date(),
        },
      ]);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-full max-h-[480px] w-full max-w-lg">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-2 py-4 scrollbar-thin">
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-up`}
            style={{ animationDelay: `${i * 0.08}s` }}
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
        >
          {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Speak or type a command, Boss..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-body"
        />

        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="p-2.5 rounded-xl text-primary hover:bg-primary/10 transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
