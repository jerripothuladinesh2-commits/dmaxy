import { useMemo } from "react";

const JarvisOrb = ({ isListening = false, size = 280 }: { isListening?: boolean; size?: number }) => {
  const particles = useMemo(() => 
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      angle: (i / 40) * 360,
      radius: 90 + Math.random() * 40,
      size: 1.5 + Math.random() * 2.5,
      delay: Math.random() * 3,
      duration: 2 + Math.random() * 3,
    })), []
  );

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Background glow */}
      <div className={`absolute rounded-full transition-all duration-700 ${isListening ? 'opacity-60 scale-110' : 'opacity-30'}`}
        style={{
          width: size * 0.7, height: size * 0.7,
          background: 'radial-gradient(circle, hsl(200 100% 50% / 0.3) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }}
      />

      {/* Outer ring 1 */}
      <div className="absolute animate-orbit-slow" style={{ width: size * 0.92, height: size * 0.92 }}>
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="95" fill="none" stroke="hsl(200 100% 50% / 0.15)" strokeWidth="0.5" />
          <circle cx="100" cy="100" r="95" fill="none" stroke="hsl(200 100% 50% / 0.5)" strokeWidth="1"
            strokeDasharray="8 20 3 15" strokeLinecap="round" />
        </svg>
      </div>

      {/* Outer ring 2 */}
      <div className="absolute animate-orbit-reverse" style={{ width: size * 0.82, height: size * 0.82 }}>
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="95" fill="none" stroke="hsl(180 100% 40% / 0.3)" strokeWidth="0.8"
            strokeDasharray="15 10 5 25" strokeLinecap="round" />
        </svg>
      </div>

      {/* Main orbit ring */}
      <div className="absolute animate-orbit" style={{ width: size * 0.7, height: size * 0.7 }}>
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(200 100% 50% / 0.25)" strokeWidth="1.5"
            strokeDasharray="4 8" />
          {/* Orbiting dot */}
          <circle cx="100" cy="10" r="3" fill="hsl(200 100% 60%)" className="animate-pulse-glow" />
        </svg>
      </div>

      {/* Inner ring */}
      <div className="absolute animate-orbit-reverse" style={{ width: size * 0.55, height: size * 0.55 }}>
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(200 100% 50% / 0.2)" strokeWidth="1"
            strokeDasharray="2 12" />
          <circle cx="190" cy="100" r="2.5" fill="hsl(180 100% 50%)" className="animate-pulse-glow" />
        </svg>
      </div>

      {/* Floating particles */}
      {particles.map((p) => {
        const x = 50 + (p.radius / (size / 2)) * 50 * Math.cos((p.angle * Math.PI) / 180);
        const y = 50 + (p.radius / (size / 2)) * 50 * Math.sin((p.angle * Math.PI) / 180);
        return (
          <div key={p.id} className="absolute rounded-full animate-pulse-glow"
            style={{
              width: p.size, height: p.size,
              left: `${x}%`, top: `${y}%`,
              background: 'hsl(200 100% 70%)',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        );
      })}

      {/* Core sphere */}
      <div className={`relative rounded-full transition-all duration-500 ${isListening ? 'scale-105' : ''}`}
        style={{
          width: size * 0.28, height: size * 0.28,
          background: 'radial-gradient(circle at 35% 35%, hsl(200 100% 65%), hsl(200 100% 40%) 50%, hsl(220 80% 20%) 100%)',
          boxShadow: `0 0 30px hsl(200 100% 50% / ${isListening ? 0.6 : 0.3}), 0 0 60px hsl(200 100% 50% / ${isListening ? 0.3 : 0.1}), inset 0 0 20px hsl(200 100% 80% / 0.2)`,
        }}
      >
        {/* Scan line */}
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/30 to-transparent animate-scan" />
        </div>
      </div>

      {/* Label */}
      <div className="absolute font-display text-[10px] tracking-[0.3em] uppercase text-muted-foreground"
        style={{ bottom: size * 0.05 }}>
        D . I . N . E . S . H
      </div>
    </div>
  );
};

export default JarvisOrb;
