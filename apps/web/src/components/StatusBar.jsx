import React from "react";

export default function StatusBar({ language = "JavaScript", position = "Ln 1, Col 1", status = "Ready", isOnline = true }) {
  return (
    <div className="flex w-full items-center justify-between px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300" 
         style={{ color: 'var(--sam-text-dim)', background: 'var(--sam-glass-bg)', borderTop: '1px solid var(--sam-glass-border)' }}>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`} />
          <span className={isOnline ? "text-emerald-600/80" : "text-red-500"}>{isOnline ? status : "OFFLINE"}</span>
        </span>
        <span className="opacity-20" style={{ color: 'var(--sam-text-dim)' }}>/</span>
        <span style={{ color: 'var(--sam-text-muted)' }}>SAM Engine v3.0-Robust</span>
      </div>
      <div className="flex items-center gap-4">
        <span style={{ color: 'var(--sam-text-muted)' }}>{position}</span>
        <span className="opacity-20" style={{ color: 'var(--sam-text-dim)' }}>/</span>
        <span className="rounded-lg px-2.5 py-1" style={{ 
          background: 'var(--sam-surface-low)', 
          color: 'var(--sam-accent)',
          border: '1px solid var(--sam-glass-border)'
        }}>{language}</span>
      </div>
    </div>
  );
}

