import React from "react";
import { Sparkles, Settings } from "lucide-react";



export default function ActivityBar({ 
  onOpenAI, 
  aiActive,
  onOpenSettings
}) {
  return (
    <div className="liquid-glass m-4 hidden w-[72px] flex-col items-center rounded-3xl py-8 shadow-2xl md:flex">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/20 mb-12" title="LiquidIDE">
        <span className="text-lg font-black text-white">L</span>
      </div>
      
      <div className="flex flex-1 flex-col gap-8">
        <button 
          onClick={onOpenAI}
          className={`group relative flex h-12 w-12 items-center justify-center transition-all duration-500 ${aiActive ? "text-blue-400" : "text-white/30 hover:text-blue-400 hover:bg-blue-500/5 rounded-2xl"}`} 
          title="Sam AI"
        >
          {aiActive && <div className="absolute inset-0 animate-pulse rounded-2xl bg-blue-500/10" />}
          <Sparkles className="h-6 w-6 transition-transform group-hover:scale-110 group-hover:rotate-12" />
        </button>
      </div>

      <button 
        onClick={onOpenSettings}
        className="mt-auto text-white/20 transition-all hover:text-white/60 hover:rotate-90 duration-700"
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>
    </div>
  );
}



