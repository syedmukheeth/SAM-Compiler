import React from "react";

function FileRow({ depth = 0, icon, name, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-all duration-300",
        "hover:bg-[var(--sam-accent-muted)] hover:text-sam-text",
        active ? "bg-[var(--sam-accent)] text-[var(--sam-bg)] shadow-md" : "text-sam-text-muted"
      ].join(" ")}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <span className={active ? "text-[var(--sam-bg)]" : "text-sam-text-muted"}>{icon}</span>
      <span className="truncate tracking-wide font-medium">{name}</span>
    </button>
  );
}

export default function Sidebar({ files, activePath, onOpen }) {
  return (
    <div className="sam-glass flex h-full w-[280px] flex-col overflow-hidden rounded-xl border-l-0 shadow-2xl relative z-20">
      <div className="flex items-center justify-between border-b border-[var(--sam-glass-border)] px-4 py-4 bg-sam-bg/20">
        <div className="text-[10px] font-black tracking-[0.25em] text-sam-text-muted uppercase font-[family-name:var(--font-mono)]">EXPLORER</div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-xs text-white/30 transition duration-200 ease-out hover:bg-sam-text/10 hover:text-sam-text"
          title="New file"
        >
          +
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-4">
        <div className="text-[11px] font-black tracking-widest text-[var(--sam-accent)]">STORAGE-MNT</div>
        <div className="text-[9px] text-[#dde2f1]/30 uppercase tracking-widest font-bold">local</div>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2 scrollbar-hide">
        <div className="mb-2 px-2 text-[10px] font-bold tracking-[0.2em] text-[#dde2f1]/40 uppercase mt-2">FILES</div>
        {files.map((f) => (
          <FileRow
            key={f.path}
            depth={f.depth}
            icon={f.icon}
            name={f.name}
            active={f.path === activePath}
            onClick={() => onOpen?.(f.path)}
          />
        ))}
      </div>
    </div>
  );
}

