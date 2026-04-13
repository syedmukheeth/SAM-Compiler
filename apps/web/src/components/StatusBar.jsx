import { Bug, User } from "lucide-react";

export default function StatusBar({ 
  language = "JavaScript", 
  position = "Ln 1, Col 1", 
  status = "Ready", 
  isOnline = true, 
  onReportBug,
  theme = 'dark',
  busy = false 
}) {
  return (
    <div className={`relative flex w-full items-center justify-between px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 backdrop-blur-md ${
      theme === 'dark' 
        ? 'bg-black/90 text-white/60' 
        : 'bg-white/95 text-slate-500 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.05)]'
    }`}>
      {/* Top Accent Bar — Full-Width Fading Glow Horizon (Intense) */}
      <div className="absolute top-0 left-0 right-0 h-[3px] z-10 overflow-visible">
        <div 
          className={`w-full h-full ${
            theme === 'dark' 
              ? 'sam-pulse-glow-red bg-gradient-to-r from-transparent via-[#ff3b3b] to-transparent shadow-[0_0_40px_rgba(255,59,59,0.9)]' 
              : 'sam-pulse-glow-blue bg-gradient-to-r from-transparent via-[#3b82f6] to-transparent shadow-[0_0_30px_rgba(59,130,246,0.7)]'
          }`}
        />
        {/* Intense Core — High-Energy Saturated Neon Blade */}
        <div 
          className={`absolute top-0 left-0 right-0 h-[1.5px] ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-transparent via-[#ff1a1a] to-transparent' 
              : 'bg-gradient-to-r from-transparent via-[#2563eb] to-transparent'
          }`}
          style={{ opacity: 0.9 }}
        />
      </div>

      <div className="flex items-center gap-4">
        {/* Left Side: Status & Bug */}
        <span className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`} />
          <span className={isOnline ? "text-emerald-600/80" : "text-red-500"}>{isOnline ? status : "OFFLINE"}</span>
        </span>
        
        <span className={`opacity-20 ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'}`}>/</span>
        
        {/* DYNAMIC METRICS: CPU / RAM */}
        <div className="hidden lg:flex items-center gap-4">
           <div className="flex items-center gap-2">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>CPU</span>
              <span className={`font-mono text-[10px] font-bold tabular-nums ${theme === 'dark' ? 'text-white' : 'text-slate-700'}`}>
                {busy ? (8 + Math.random() * 5).toFixed(1) : (0.1 + Math.random() * 0.3).toFixed(1)}%
              </span>
           </div>
           <div className="flex items-center gap-2">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>RAM</span>
              <span className={`font-mono text-[10px] font-bold tabular-nums ${theme === 'dark' ? 'text-white' : 'text-slate-700'}`}>
                {busy ? (110 + Math.random() * 20).toFixed(0) : (42 + Math.random() * 5).toFixed(0)}MB
              </span>
           </div>
        </div>

        <span className={`opacity-20 hidden lg:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'}`}>/</span>
        
        <button 
          onClick={onReportBug}
          className="group flex items-center gap-2 text-rose-500/60 transition-all hover:text-rose-500 active:scale-95"
          title="Report a bug"
        >
          <Bug className="h-3 w-3 transition-transform group-hover:rotate-12" />
          <span>Report Bug</span>
        </button>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <span className={`hidden sm:block ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>SAM © 2026</span>
        <span className={`opacity-20 hidden sm:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'}`}>/</span>

        <span className={theme === 'dark' ? 'text-white/50' : 'text-slate-500'}>{position}</span>
        <span className="rounded-lg px-2.5 py-1" style={{ 
          background: theme === 'dark' ? 'var(--sam-surface-low)' : '#f1f5f9', 
          color: theme === 'dark' ? 'var(--sam-accent)' : '#2563eb',
          border: theme === 'dark' ? '1px solid var(--sam-glass-border)' : '1px solid #e2e8f0'
        }}>{language}</span>

        <span className={`opacity-20 hidden sm:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'}`}>/</span>
        
        <a 
          href="https://linkedin.com/in/syedmukheeth" 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`group hidden lg:flex items-center gap-2 transition-all active:scale-95 text-white/50 hover:text-white`}
        >
          <span className={`hidden text-[9px] font-black uppercase tracking-[0.2em] transition-opacity lg:inline ${
            theme === 'dark' ? 'text-white/60 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-800'
          }`}>
            BUILT BY
          </span>
          <div className={`flex items-center gap-2 rounded-lg py-1.5 px-2 border transition-all duration-200 ${
             theme === 'dark' 
               ? 'bg-white/5 border-white/10 text-white/80 hover:bg-[#ff3b3b]/15 hover:border-[#ff3b3b]/40 hover:text-[#ff3b3b] hover:shadow-[0_0_12px_rgba(255,59,59,0.25)]' 
               : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-blue-600 hover:border-blue-600 hover:text-white'
          }`}>
            <User className="h-3 w-3" />
            <span className={`text-[9px] font-black uppercase tracking-wider`}>
              SYED MUKHEETH
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}

