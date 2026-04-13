import { Bug } from "lucide-react";

const LinkedinIcon = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

export default function StatusBar({ 
  language = "JavaScript", 
  position = "Ln 1, Col 1", 
  status = "SAM ONLINE", 
  isOnline = true, 
  onReportBug,
  theme = 'dark',
  busy = false 
}) {
  return (
    <div className={`relative flex w-full items-center justify-between px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 backdrop-blur-xl ${
      theme === 'dark' 
        ? 'bg-black/95 text-white/70 border-t border-white/5' 
        : 'bg-white/95 text-slate-600 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.08)] border-t border-slate-100'
    }`}>
      {/* Top Accent Bar — Full-Width Fading Glow Horizon (Intense) */}
      <div className="absolute top-0 left-0 right-0 h-[3px] z-10 overflow-visible">
        <div 
          className={`w-full h-full ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-transparent via-[#ff3b3b] to-transparent shadow-[0_0_40px_rgba(255,59,59,0.9)] animate-pulse' 
              : 'bg-gradient-to-r from-transparent via-[#3b82f6] to-transparent shadow-[0_0_30px_rgba(59,130,246,0.6)]'
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

      <div className="flex items-center gap-5">
        {/* Left Side: Status & Bug */}
        <span className="flex items-center gap-2 relative">
          <div className="absolute -inset-1 rounded-full bg-emerald-500/20 blur-sm animate-pulse" />
          <div className={`relative h-2 w-2 rounded-full transition-colors duration-500 ${isOnline ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]' : 'bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.6)]'}`} />
          <span className={`ml-1 tracking-[0.25em] ${isOnline ? "text-emerald-500 font-black" : "text-red-500 font-black"}`}>{isOnline ? status : "OFFLINE"}</span>
        </span>
        
        <span className={`opacity-20 ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
        {/* DYNAMIC METRICS: CPU / RAM */}
        <div className="hidden lg:flex items-center gap-5">
           <div className="flex items-center gap-2 group cursor-default">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-50 transition-opacity group-hover:opacity-100 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>CPU</span>
              <span className={`font-mono text-[10px] font-bold tabular-nums tracking-widest ${theme === 'dark' ? 'text-white/90' : 'text-slate-700'}`}>
                {busy ? (8 + Math.random() * 5).toFixed(1) : (0.1 + Math.random() * 0.3).toFixed(1)}%
              </span>
           </div>
           <div className="flex items-center gap-2 group cursor-default">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-50 transition-opacity group-hover:opacity-100 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>RAM</span>
              <span className={`font-mono text-[10px] font-bold tabular-nums tracking-widest ${theme === 'dark' ? 'text-white/90' : 'text-slate-700'}`}>
                {busy ? (110 + Math.random() * 20).toFixed(0) : (42 + Math.random() * 5).toFixed(0)}MB
              </span>
           </div>
        </div>

        <span className={`opacity-20 hidden lg:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
        <button 
          onClick={onReportBug}
          className={`group flex items-center gap-2 transition-all hover:-translate-y-0.5 active:scale-95 ${theme === 'dark' ? 'text-rose-400 hover:text-rose-300' : 'text-rose-500 hover:text-rose-600'}`}
          title="Report a bug"
        >
          <Bug className="h-3.5 w-3.5 transition-transform group-hover:rotate-12" />
          <span className="tracking-[0.2em] font-bold opacity-80 group-hover:opacity-100">Report Bug</span>
        </button>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <span className={`font-bold tracking-[0.25em] hidden sm:block ${theme === 'dark' ? 'text-white/30' : 'text-slate-400'}`}>SAM © 2026</span>
        <span className={`opacity-20 hidden sm:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>

        <div className="flex items-center gap-3">
          <span className={`font-mono tracking-wider ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>{position}</span>
          <span className="rounded-md px-3 py-1 font-black shadow-sm" style={{ 
            background: theme === 'dark' ? 'var(--sam-surface-low)' : '#f8fafc', 
            color: theme === 'dark' ? 'var(--sam-accent)' : '#0ea5e9',
            border: theme === 'dark' ? '1px solid var(--sam-glass-border)' : '1px solid #e2e8f0'
          }}>{language}</span>
        </div>

        <span className={`opacity-20 hidden sm:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
        <a 
          href="https://linkedin.com/in/syedmukheeth" 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`group hidden lg:flex items-center gap-2.5 transition-all active:scale-95`}
        >
          <span className={`text-[8.5px] font-black uppercase tracking-[0.25em] transition-opacity lg:inline ${
            theme === 'dark' ? 'text-white/40 group-hover:text-white/80' : 'text-slate-400 group-hover:text-slate-800'
          }`}>
            BUILT BY
          </span>
          <div className={`flex items-center gap-2 rounded-md py-1.5 px-2.5 border transition-all duration-300 ${
             theme === 'dark' 
               ? 'bg-white/5 border-white/10 text-white/80 hover:bg-[#0077b5]/20 hover:border-[#0077b5]/50 hover:text-[#0077b5] hover:shadow-[0_0_15px_rgba(0,119,181,0.3)]' 
               : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-[#0077b5] hover:border-[#0077b5] hover:text-white hover:shadow-md'
          }`}>
            <LinkedinIcon className="h-3.5 w-3.5" />
            <span className={`text-[9px] font-black uppercase tracking-[0.2em]`}>
              SYED MUKHEETH
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}

