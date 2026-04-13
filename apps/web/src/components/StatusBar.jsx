import { Bug } from "lucide-react";

const LinkedinIcon = ({ className }) => (
  <svg 
    viewBox="0 0 24 24" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className} 
    fill="currentColor"
  >
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
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
    <div className={`relative flex w-full items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 backdrop-blur-xl ${
      theme === 'dark' 
        ? 'bg-black/95 text-white/70 border-t border-white/5' 
        : 'bg-white/95 text-slate-600 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.08)] border-t border-slate-100'
    }`}>
      {/* Top Accent Bar — SYMMETRIC HIGH-POWEREED NEON */}
      <div className="absolute top-0 left-0 right-0 h-[3px] z-10 overflow-visible">
        <div 
          className={`w-full h-full ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-transparent via-[#ff0000] to-transparent shadow-[0_0_50px_rgba(255,0,0,1)] animate-pulse' 
              : 'bg-gradient-to-r from-transparent via-[#0077b5] to-transparent shadow-[0_0_50px_rgba(0,119,181,1)]'
          }`}
        />
        {/* Core Blade */}
        <div 
          className={`absolute top-0 left-0 right-0 h-[1.5px] ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-transparent via-[#ff4d4d] to-transparent' 
              : 'bg-gradient-to-r from-transparent via-[#60a5fa] to-transparent'
          }`}
          style={{ opacity: 1 }}
        />
      </div>

      <div className="flex items-center gap-5">
        {/* Left Side: Status & Bug */}
        <span className="flex items-center gap-2 relative group cursor-default">
          <div className={`absolute -inset-1.5 rounded-full blur-md transition-all duration-500 ${isOnline ? 'bg-emerald-500/30' : 'bg-red-500/30'} animate-pulse`} />
          <div className={`relative h-2.5 w-2.5 rounded-full transition-all duration-500 ring-2 ring-black/20 ${isOnline ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]'}`} />
          <span className={`relative ml-1 text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] transition-all duration-300 ${isOnline ? "text-emerald-500 font-black drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "text-red-500 font-black drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]"}`}>
            {isOnline ? status : "OFFLINE"}
          </span>
        </span>
        
        <span className={`opacity-20 ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
        {/* DYNAMIC METRICS: CPU / RAM */}
        <div className="hidden lg:flex items-center gap-6">
           <div className="flex items-center gap-2 group cursor-default">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-40 transition-opacity group-hover:opacity-100 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>CPU</span>
              <span className={`font-mono text-[10px] font-bold tabular-nums tracking-[0.15em] ${theme === 'dark' ? 'text-white/90' : 'text-slate-700'}`}>
                {busy ? (8 + Math.random() * 5).toFixed(1) : (0.1 + Math.random() * 0.3).toFixed(1)}%
              </span>
           </div>
           <div className="flex items-center gap-2 group cursor-default">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-40 transition-opacity group-hover:opacity-100 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>RAM</span>
              <span className={`font-mono text-[10px] font-bold tabular-nums tracking-[0.15em] ${theme === 'dark' ? 'text-white/90' : 'text-slate-700'}`}>
                {busy ? (110 + Math.random() * 20).toFixed(0) : (42 + Math.random() * 5).toFixed(0)}MB
              </span>
           </div>
        </div>

        <span className={`opacity-20 hidden lg:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
        <button 
          onClick={onReportBug}
          className={`group flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${theme === 'dark' ? 'text-rose-400 hover:text-rose-300' : 'text-rose-500 hover:text-rose-600'}`}
          title="Report a bug"
        >
          <Bug className="h-3.5 w-3.5 transition-transform group-hover:rotate-12" />
          <span className="tracking-[0.2em] font-black opacity-80 group-hover:opacity-100 hidden sm:inline">Report Bug</span>
          <span className="tracking-[0.2em] font-black opacity-80 group-hover:opacity-100 inline sm:hidden">Report</span>
        </button>
      </div>

      <div className="flex items-center gap-4 md:gap-7">
        <span className={`font-black tracking-[0.3em] hidden lg:block ${theme === 'dark' ? 'text-white/20' : 'text-slate-400'}`}>SAM © 2026</span>
        <span className={`opacity-10 hidden lg:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>

        <div className="hidden sm:flex items-center gap-4">
          <span className={`font-mono tracking-widest opacity-60 ${theme === 'dark' ? 'text-white' : 'text-slate-600'}`}>{position}</span>
          <span className="rounded-md px-3 py-1 font-black shadow-lg transition-all hover:bg-opacity-80" style={{ 
            background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8fafc', 
            color: theme === 'dark' ? 'rgb(59, 130, 246)' : '#0ea5e9',
            border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0'
          }}>{language}</span>
        </div>

        <span className={`opacity-10 hidden sm:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
        <a 
          href="https://linkedin.com/in/syedmukheeth" 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`group flex items-center gap-2 sm:gap-3 transition-all active:scale-95`}
        >
          <span className={`text-[8.5px] font-black uppercase tracking-[0.3em] transition-opacity hidden lg:inline ${
            theme === 'dark' ? 'text-white/30 group-hover:text-white/60' : 'text-slate-400 group-hover:text-slate-800'
          }`}>
            BUILT BY
          </span>
          <div className={`flex items-center gap-2 rounded-md py-1.5 px-2.5 sm:px-3 border transition-all duration-300 ${
             theme === 'dark' 
               ? 'bg-[#0077b5]/10 border-[#0077b5]/30 text-[#0077b5] hover:bg-[#0077b5] hover:text-white hover:shadow-[0_0_25px_rgba(0,119,181,0.6)]' 
               : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-[#0077b5] hover:border-[#0077b5] hover:text-white hover:shadow-xl'
          }`}>
            <LinkedinIcon className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
            <span className={`text-[9.5px] font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] whitespace-nowrap`}>
              SYED M.
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}

