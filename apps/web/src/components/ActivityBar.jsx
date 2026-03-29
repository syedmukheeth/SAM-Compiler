import React from "react";
import { Share2, Sparkles, Settings, Clock } from "lucide-react";

const languages = [
  { id: "cpp", label: "C++", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg" },
  { id: "python", label: "Python", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" },
  { id: "javascript", label: "JS", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" },
  { id: "java", label: "Java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" }
];

export default function ActivityBar({ 
  activeLanguage, 
  onLanguageChange, 
  onOpenAI, 
  onOpenCollaborate, 
  aiActive,
  onOpenSettings,
  onOpenHistory,
  historyActive
}) {
  return (
    <div className="liquid-glass m-4 hidden w-[70px] flex-col items-center rounded-3xl py-6 shadow-2xl md:flex">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-500/20 mb-8" title="LiquidIDE">
        <span className="text-sm font-black text-white">L</span>
      </div>
      
      <div className="flex flex-1 flex-col gap-6">
        {languages.map((lang) => {
          const active = lang.id === activeLanguage;
          return (
            <button
              key={lang.id}
              onClick={() => onLanguageChange?.(lang.id)}
              className="group relative flex h-12 w-12 items-center justify-center"
              title={lang.label}
            >
              {active && (
                <div className="absolute inset-0 animate-glow rounded-xl bg-blue-500/10" />
              )}
              <img
                src={lang.icon}
                alt={lang.label}
                className={[
                  "z-10 h-6 w-6 transition-all duration-500 ease-out group-hover:scale-125 group-hover:rotate-6",
                  active ? "scale-110 grayscale-0 brightness-110" : "opacity-30 grayscale group-hover:opacity-80 group-hover:grayscale-0"
                ].join(" ")}
              />
              {active && (
                <div className="absolute -right-2 h-1 w-1 rounded-full bg-blue-400 shadow-[0_0_10px_#60a5fa]" />
              )}
            </button>
          );
        })}

        <div className="my-2 h-[1px] w-8 border-b border-white/5 mx-auto" />

        <button 
          onClick={onOpenCollaborate}
          className="group relative flex h-12 w-12 items-center justify-center text-white/30 transition-all hover:text-white" 
          title="Collaborate"
        >
          <Share2 className="h-5 w-5 transition-transform group-hover:scale-110" />
        </button>

        <button 
          onClick={onOpenAI}
          className={`group relative flex h-12 w-12 items-center justify-center transition-all ${aiActive ? "text-blue-400" : "text-white/30 hover:text-blue-400 hover:bg-blue-500/5 rounded-xl"}`} 
          title="SRE AI Assistant"
        >
          {aiActive && <div className="absolute inset-0 animate-pulse rounded-xl bg-blue-500/10" />}
          <Sparkles className="h-5 w-5 transition-transform group-hover:scale-110 group-hover:rotate-12" />
        </button>

        <button 
          onClick={onOpenHistory}
          className={`group relative flex h-12 w-12 items-center justify-center transition-all ${historyActive ? "text-emerald-400" : "text-white/30 hover:text-emerald-400 hover:bg-emerald-500/5 rounded-xl"}`} 
          title="Execution History"
        >
          {historyActive && <div className="absolute inset-0 animate-pulse rounded-xl bg-emerald-500/10" />}
          <Clock className="h-5 w-5 transition-transform group-hover:scale-110" />
        </button>
      </div>

      <button 
        onClick={onOpenSettings}
        className="mt-auto text-white/20 transition-all hover:text-white/60 hover:rotate-90 duration-500"
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>
    </div>
  );
}


