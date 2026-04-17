import { Bug, RefreshCw } from "lucide-react";
import { reconnect } from "../services/socketClient";

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

  busy = false,
  socketStatus = "connected",
  showBanner = true
}) {
  const isOnline = socketStatus === "connected";
  const isRecovering = socketStatus === "reconnecting" || socketStatus === "connecting";
  const isWaking = socketStatus === "waking";
  const isFailed = socketStatus === "failed";

  const displayStatus = isWaking 
    ? "WAKING SERVER..." 
    : isRecovering 
      ? "RECONNECTING..." 
      : isOnline 
        ? "CONNECTED" 
        : "OFFLINE";

  const statusColorClass = isWaking || isRecovering
    ? "text-amber-400 font-black drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]"
    : isOnline 
      ? "text-cyan-400 font-black drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" 
      : "text-red-500 font-black drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]";

  const glowClass = isWaking || isRecovering
    ? "bg-amber-500/30 animate-pulse"
    : isOnline ? "bg-cyan-500/30 animate-pulse" : "bg-red-500/30 animate-pulse";
    
  const dotClass = isWaking || isRecovering
    ? "bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.8)] animate-bounce"
    : isOnline 
      ? "bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]" 
      : "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse";

  return (
    <div className={`relative flex w-full items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-700 backdrop-blur-xl ${
      theme === 'dark' 
        ? 'bg-black/95 text-white/70 border-t border-white/5' 
        : 'bg-white/95 text-slate-600 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.08)] border-t border-slate-100'
    }`}>
      {/* Top Accent Bar */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] z-10 overflow-visible transition-opacity duration-1000 ${showBanner || !isOnline ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`w-full h-full ${theme === 'dark' ? 'bg-[#ff0000] animate-pulse shadow-[0_0_50px_rgba(255,0,0,1)]' : 'bg-[#0077b5] shadow-[0_0_50px_rgba(0,119,181,1)]'}`} />
      </div>

      <div className="flex items-center gap-5">
        <span className={`flex items-center gap-2 relative group cursor-default transition-all duration-700 ${!showBanner && isOnline ? 'opacity-40 grayscale-[0.5] scale-95' : 'opacity-100'}`}>
          <div className={`absolute -inset-1.5 rounded-full blur-md transition-all duration-500 ${glowClass}`} />
          <div className={`relative h-2.5 w-2.5 rounded-full transition-all duration-500 ring-2 ring-black/20 ${dotClass}`} />
          <span className={`relative ml-1 text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] transition-all duration-300 ${statusColorClass} ${!showBanner && isOnline ? 'hidden' : 'inline'}`}>
            {displayStatus}
          </span>
        </span>

        {isFailed && (
          <button 
            onClick={() => reconnect()}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-[8px] font-black animate-pulse"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            RECONNECT
          </button>
        )}

        
        <span className={`opacity-20 ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'} ${!isOnline ? 'hidden' : ''}`}>|</span>

        {/* Editor Position & Language */}
        <div className="flex items-center gap-4">
          <span className={`text-[9.5px] font-mono tracking-widest ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>
            {language}
          </span>
          <span className={`text-[8px] opacity-40 font-black tracking-widest hidden sm:inline ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {position}
          </span>
        </div>

        <span className={`opacity-20 hidden lg:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
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
        <span className={`font-black tracking-[0.3em] hidden sm:block ${theme === 'dark' ? 'text-white/20' : 'text-slate-400'}`}>SAM © 2026</span>
        <span className={`opacity-10 hidden lg:inline ${theme === 'dark' ? 'text-white/40' : 'text-slate-300'}`}>|</span>
        
        <a 
          href="https://linkedin.com/in/syedmukheeth" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="group flex items-center gap-2 sm:gap-3 transition-all active:scale-95"
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
              SYED MUKHEETH
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}

