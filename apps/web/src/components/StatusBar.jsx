import React from "react";

export default function StatusBar({ language = "JavaScript", position = "Ln 1, Col 1", status = "Ready" }) {
  return (
    <div className="flex w-full items-center justify-between px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 backdrop-blur-md bg-white/[0.01]">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-emerald-500/80">{status}</span>
        </span>
        <span className="opacity-20">/</span>
        <span>SAM Engine v2.0</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{position}</span>
        <span className="opacity-20">/</span>
        <span className="rounded-lg bg-white/5 px-2.5 py-1 text-white/50 border border-white/5">{language}</span>
      </div>
    </div>
  );
}

