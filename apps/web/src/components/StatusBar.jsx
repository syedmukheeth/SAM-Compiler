import React from "react";

export default function StatusBar({ language = "JavaScript", position = "Ln 1, Col 1", status = "Ready" }) {
  return (
    <div className="status-bar">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          {status}
        </span>
        <span className="text-white/35">•</span>
        <span className="text-white/60">LiquidIDE</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-white/55">{position}</span>
        <span className="text-white/35">•</span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 text-white/70">{language}</span>
      </div>
    </div>
  );
}

