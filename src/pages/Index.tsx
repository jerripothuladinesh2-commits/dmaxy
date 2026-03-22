import { useState } from "react";
import JarvisOrb from "@/components/JarvisOrb";
import ChatInterface from "@/components/ChatInterface";
import StatusPanel from "@/components/StatusPanel";

const Index = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  return (
    <div className="relative min-h-screen flex flex-col items-center overflow-hidden bg-background">
      {/* Ambient background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, hsl(200 100% 50%), transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, hsl(180 100% 40%), transparent 70%)' }} />
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(hsl(200 100% 50%) 1px, transparent 1px), linear-gradient(90deg, hsl(200 100% 50%) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-6 py-4 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center box-glow">
            <div className="w-3 h-3 rounded-full bg-primary" />
          </div>
          <div>
            <h1 className="font-display text-sm tracking-widest text-foreground text-glow">M.A.X.Y</h1>
            <p className="text-[10px] font-body text-muted-foreground tracking-wider">PERSONAL INTELLIGENCE SYSTEM</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-display tracking-wider text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
          SYSTEM ACTIVE
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-4 w-full max-w-4xl py-8">
        {/* Orb */}
        <div className="animate-fade-in-up animate-float" style={{ animationDelay: '0.1s' }}>
          <JarvisOrb isListening={isListening || isSpeaking} size={240} />
        </div>

        {/* Greeting */}
        <div className="text-center animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h2 className="font-display text-xl md:text-2xl tracking-wide text-foreground text-glow" style={{ lineHeight: '1.1' }}>
            Welcome, Boss DINESH
          </h2>
          <p className="mt-2 text-sm text-muted-foreground font-body tracking-wide">
            All systems operational • Multilingual AI ready • Telugu & English active
          </p>
        </div>

        {/* Status */}
        <StatusPanel />

        {/* Chat */}
        <div className="w-full max-w-lg animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
          <ChatInterface isListening={isListening} onToggleListen={() => setIsListening((v) => !v)} onSpeakingChange={setIsSpeaking} />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 pb-4 text-center">
        <p className="text-[10px] font-display tracking-[0.25em] text-muted-foreground/50">
          MAXY • v1.0.0 • ALL RIGHTS RESERVED
        </p>
      </footer>
    </div>
  );
};

export default Index;
