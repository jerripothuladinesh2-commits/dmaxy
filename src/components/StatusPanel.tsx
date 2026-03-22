import { Activity, Cpu, Globe, Shield, Wifi } from "lucide-react";

const stats = [
  { icon: Cpu, label: "CPU", value: "12%", status: "optimal" },
  { icon: Activity, label: "Systems", value: "Online", status: "optimal" },
  { icon: Shield, label: "Security", value: "Active", status: "optimal" },
  { icon: Wifi, label: "Network", value: "Connected", status: "optimal" },
  { icon: Globe, label: "Languages", value: "Multi", status: "optimal" },
];

const StatusPanel = () => (
  <div className="flex flex-wrap justify-center gap-3 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
    {stats.map((s) => (
      <div key={s.label} className="glass-surface rounded-xl px-4 py-3 flex items-center gap-3 min-w-[140px]">
        <s.icon className="w-4 h-4 text-primary/70" />
        <div>
          <p className="text-[10px] font-display tracking-wider text-muted-foreground uppercase">{s.label}</p>
          <p className="text-sm font-body font-semibold text-foreground">{s.value}</p>
        </div>
        <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse-glow" />
      </div>
    ))}
  </div>
);

export default StatusPanel;
