import React, { useState } from "react";
import Modal from "./Modal";

export default function SettingsModal({ isOpen, onClose, isDarkMode, settings, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState("editor");

  const tabs = [
    { id: "editor", label: "Editor", icon: "M14.318 18.222a7.5 7.5 0 000-10.606M11.485 15.39a4.5 4.5 0 000-6.364m-4.582 4.59a1.5 1.5 0 000-2.122m3.106 3.11a.5.5 0 000-.708M14.318 18.222a7.5 7.5 0 000-10.606" },
    { id: "account", label: "Account", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { id: "engine", label: "Flux Engine", icon: "M13 10V3L4 14h7v7l9-11h-7z" }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Flux System Settings" isDarkMode={isDarkMode}>
      <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Tab Navigation */}
        <div className={`flex items-center gap-2 rounded-2xl p-1.5 transition-colors ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? (isDarkMode ? "bg-white/10 text-white shadow-lg" : "bg-white text-slate-900 shadow-sm") : "text-white/20 hover:text-white/40"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-8 min-h-[300px]">
          {activeTab === "editor" && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className={`text-[12px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/80" : "text-slate-700"}`}>Font Size</p>
                  <p className={`text-[10px] font-bold ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>Adjust font size for the editor</p>
                </div>
                <div className="flex items-center gap-4">
                   <button 
                    onClick={() => onSettingsChange({ ...settings, fontSize: Math.max(8, (settings.fontSize || 14) - 1) })}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${isDarkMode ? "bg-white/5 hover:bg-white/10 text-white/40" : "bg-slate-100 hover:bg-slate-200 text-slate-500"}`}
                   >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
                   </button>
                   <span className={`text-[13px] font-black w-8 text-center ${isDarkMode ? "text-white" : "text-slate-900"}`}>{settings.fontSize || 14}</span>
                   <button 
                    onClick={() => onSettingsChange({ ...settings, fontSize: Math.min(32, (settings.fontSize || 14) + 1) })}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${isDarkMode ? "bg-white/5 hover:bg-white/10 text-white/40" : "bg-slate-100 hover:bg-slate-200 text-slate-500"}`}
                   >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                   </button>
                </div>
              </div>
              
              <div className={`h-px ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`} />
              
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className={`text-[12px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/80" : "text-slate-700"}`}>Tab Size</p>
                  <p className={`text-[10px] font-bold ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>Number of spaces per indentation</p>
                </div>
                <div className={`flex gap-1.5 rounded-xl p-1 ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`}>
                  {[2, 4, 8].map(size => (
                    <button
                      key={size}
                      onClick={() => onSettingsChange({ ...settings, tabSize: size })}
                      className={`h-8 w-12 rounded-lg text-[11px] font-black transition-all active:scale-95 ${settings.tabSize === size ? (isDarkMode ? "bg-white/10 text-white shadow-xl" : "bg-white text-slate-900 shadow-sm") : (isDarkMode ? "text-white/20 hover:text-white/40" : "text-slate-400 hover:text-slate-600")}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "account" && (
            <div className="flex flex-col items-center justify-center gap-8 py-10 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="relative h-24 w-24 rounded-[2rem] bg-gradient-to-br from-blue-500 to-indigo-600 p-1 shadow-2xl shadow-blue-500/20">
                {/* Real User Logic will go here if passed as prop, using placeholder for now but matching style */}
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[1.8rem] bg-black/40 backdrop-blur-3xl">
                   {/* We don't have user prop here yet, but let's make it look premium */}
                   <div className="text-3xl font-black text-white bg-gradient-to-b from-white to-white/20 bg-clip-text text-transparent">L</div>
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? "text-white" : "text-slate-800"}`}>Flux Member</p>
                <div className="inline-flex rounded-lg bg-emerald-500/10 px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500 ring-1 ring-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]">Active Developer</div>
              </div>
              <button className="rounded-2xl bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 px-10 py-4 text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-125 active:scale-95 text-blue-400">Manage Subscription</button>
            </div>
          )}

          {activeTab === "engine" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="rounded-[2rem] bg-blue-500/[0.03] border border-blue-500/10 p-8 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_12px_#3b82f6] animate-pulse" />
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400">Engine V0.2.3-PRO</p>
                  </div>
                  <div className={`space-y-4 text-[10px] font-bold leading-7 ${isDarkMode ? "text-white/30" : "text-slate-500"}`}>
                    <p>Connected to <span className="text-blue-400/60 font-black">Flux-Cluster-Global</span>. Latency: 1ms.</p>
                    <p>Execution Limits: <span className={isDarkMode ? "text-white/60" : "text-slate-800"}>Unlimited RAM, 60s Time Limit</span>.</p>
                    <p>Status: <span className="text-emerald-500 font-black italic">OPTIMIZED</span></p>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
