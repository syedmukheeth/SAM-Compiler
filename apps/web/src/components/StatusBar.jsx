import React from "react";
import { Bug, RefreshCw, Info } from "lucide-react";
import { reconnect } from "../services/socketClient";

const ISSUES_URL = "https://github.com/syedmukheeth/SAM-Compiler/issues/new";

const StatusBar = ({
  language = "JavaScript",
  onShowAbout,
  theme = 'dark',
  socketStatus = "connected",
  showBanner = true
}) => {
  const [localPos, setLocalPos] = React.useState({ lineNumber: 1, column: 1 });
  const [isSmallMobile, setIsSmallMobile] = React.useState(() => typeof window !== 'undefined' ? window.innerWidth < 480 : false);

  React.useEffect(() => {
    const handleMetricsUpdate = (e) => {
      setLocalPos({ lineNumber: e.detail.lineNumber, column: e.detail.column });
    };
    const handleResize = () => setIsSmallMobile(window.innerWidth < 480);
    window.addEventListener("sam:editor:metrics", handleMetricsUpdate);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("sam:editor:metrics", handleMetricsUpdate);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const isOnline = socketStatus === "connected";
  const isRecovering = socketStatus === "reconnecting" || socketStatus === "connecting";
  const isWaking = socketStatus === "waking";
  const isFailed = socketStatus === "failed";

  const displayStatus = isWaking 
    ? "WAKING..." 
    : isRecovering 
      ? "SYNCING" 
      : isOnline 
        ? (isSmallMobile ? "LIVE" : "CONNECTED") 
        : "OFFLINE";

  const statusColorClass = isWaking || isRecovering
    ? "text-[var(--sam-amber)] font-black"
    : isOnline 
      ? "text-[var(--sam-green)] font-black" 
      : "text-[var(--sam-red)] font-black";

  const glowClass = isWaking || isRecovering
    ? "bg-[var(--sam-amber)]/30 animate-pulse"
    : isOnline ? "bg-[var(--sam-green)]/30 animate-pulse" : "bg-[var(--sam-red)]/30 animate-pulse";
    
  const dotClass = isWaking || isRecovering
    ? "bg-[var(--sam-amber)] shadow-[0_0_15px_rgba(245,158,11,0.8)] animate-bounce"
    : isOnline 
      ? "bg-[var(--sam-green)] shadow-[0_0_15px_rgba(16,185,129,0.8)]" 
      : "bg-[var(--sam-red)] shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse";

  return (
    <div className={`relative flex w-full h-11 sm:h-12 items-center justify-between px-3 sm:px-6 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-700 backdrop-blur-xl overflow-hidden select-none ${
      theme === 'dark'
        ? 'bg-sam-bg/95 text-white/70 border-t border-sam-glass-border'
        // Was `bg-sam-text/95`: --sam-text is the foreground token, which is
        // #000 in the light theme, so the light-mode footer rendered black.
        : 'bg-sam-bg/95 text-slate-600 border-t border-slate-200 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.08)]'
    }`}>
      {/* Top Accent Bar replaced by parent footer neon box-shadow */}

      <div className="flex items-center gap-3 sm:gap-5 flex-nowrap overflow-hidden">
        <span className={`flex items-center gap-2 relative group cursor-default transition-all duration-700 ${!showBanner && isOnline ? 'opacity-40 grayscale-[0.5] scale-95' : 'opacity-100'}`}>
          <div className={`absolute -inset-1 rounded-full blur-md transition-all duration-500 ${glowClass}`} />
          <div className={`relative h-2 w-2 rounded-full transition-all duration-500 ring-2 ring-black/20 ${dotClass}`} />
          <span className={`relative ml-1 text-[9px] tracking-[0.2em] transition-all duration-300 ${statusColorClass} ${!showBanner && isOnline ? 'hidden' : 'inline'}`}>
            {isFailed && navigator.onLine ? "DISCONNECTED" : displayStatus}
          </span>
        </span>

        {isFailed && (
          <button 
            onClick={() => reconnect()}
            className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all text-[9px] font-black shadow-lg ${
              isSmallMobile 
                ? "bg-rose-500 text-white animate-pulse px-4 py-2"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white"
            }`}
          >
            <RefreshCw className={`h-3 w-3 ${isSmallMobile ? 'animate-spin-slow' : ''}`} />
            <span>RECONNECT</span>
          </button>
        )}

        <span className={`opacity-20 ${theme === 'dark' ? 'text-sam-text-muted' : 'text-slate-300'} ${!isOnline ? 'hidden' : ''} hidden sm:inline`}>|</span>

        {/* Language & Metrics (Lean on Mobile) */}
        <div className="flex items-center gap-3 flex-nowrap shrink-0">
          <span className={`text-[9.5px] font-mono tracking-widest uppercase ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>
            {language}
          </span>
          <span className={`text-[8px] opacity-40 font-black tracking-widest hidden md:inline ${theme === 'dark' ? 'text-sam-text' : 'text-slate-600'}`}>
            Ln {localPos.lineNumber}, Col {localPos.column}
          </span>

        </div>

        {/* Removed: a "CPU" readout rendered from Math.random() and presented
            to users as live telemetry. It measured nothing. */}
      </div>

      <div className="flex items-center gap-3 sm:gap-6 flex-nowrap">
        {/* Was wired to a modal that told the user "Report Received / Our
            engineers are on it" and then console.logged the report and threw it
            away. Now it goes somewhere a report is actually recorded. */}
        <a
          href={ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`group flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${theme === 'dark' ? 'text-rose-400 hover:text-rose-300' : 'text-rose-500 hover:text-rose-600'}`}
          title="Report a bug on GitHub"
        >
          <Bug className="h-3.5 w-3.5 transition-transform group-hover:rotate-12" />
          <span className="tracking-[0.2em] font-black opacity-80 group-hover:opacity-100 hidden sm:inline">Report Bug</span>
        </a>

        <button 
           onClick={onShowAbout}
           className={`group flex items-center justify-center p-1.5 rounded-lg border border-sam-glass-border bg-sam-text/5 transition-all hover:bg-sam-text/10 ${isSmallMobile ? 'inline-flex' : 'hidden lg:inline-flex'}`}
           title="About SAM"
        >
          <Info className="h-3.5 w-3.5 text-sam-text-muted group-hover:text-sam-text transition-colors" />
        </button>

        {/* Branding - Hidden on Small Mobile (< 480px) */}
        <div className="hidden sm:flex items-center gap-3 flex-nowrap">
          <span className={`font-black tracking-[0.3em] hidden lg:block ${theme === 'dark' ? 'text-sam-text-muted' : 'text-slate-500'}`}>SAM © 2026</span>
          <span className={`opacity-10 hidden lg:inline ${theme === 'dark' ? 'text-sam-text-muted' : 'text-slate-300'}`}>|</span>
          
          <div 
             onClick={onShowAbout}
             className="group flex items-center gap-3 cursor-pointer select-none"
          >
            <span className={`text-[8.5px] font-black uppercase tracking-[0.3em] transition-opacity hidden lg:inline ${
              theme === 'dark' ? 'text-white/50 group-hover:text-white/80' : 'text-slate-500 group-hover:text-slate-900'
            }`}>
              BUILT BY
            </span>
            <div className={`flex items-center gap-2 rounded-md py-1 px-2 border transition-all duration-300 ${
               theme === 'dark'
                 ? 'bg-[#0077b5]/10 border-[#0077b5]/30 text-[#0077b5] group-hover:bg-[#0077b5] group-hover:text-white'
                 : 'bg-slate-50 border-slate-200 text-slate-700 group-hover:bg-[#0077b5] group-hover:text-white'
            }`}>
              <span className={`text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap`}>
                syed mukheeth
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StatusBar);
