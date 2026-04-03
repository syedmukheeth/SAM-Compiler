import React from "react";

function FileRow({ depth = 0, icon, name, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-all duration-300",
        "hover:bg-[#00D4FF]/10 hover:text-white",
        active ? "bg-[#00D4FF]/20 text-[#00D4FF] shadow-[inset_2px_0_0_#00D4FF]" : "text-[#dde2f1]/70"
      ].join(" ")}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <span className={active ? "text-[#00D4FF]" : "text-[#dde2f1]/50"}>{icon}</span>
      <span className="truncate tracking-wide font-medium">{name}</span>
    </button>
  );
}

export default function Sidebar({ files, activePath, onOpen }) {
  return (
    <div className="sam-glass flex h-full w-[280px] flex-col overflow-hidden rounded-xl border-l-0 shadow-[20px_0_40px_rgba(0,212,255,0.03)] selection:bg-[#00D4FF]/20 relative z-20">
      <div className="flex items-center justify-between border-b border-[#00D4FF]/10 px-4 py-3 bg-[rgba(8,14,24,0.4)]">
        <div className="text-[10px] font-black tracking-[0.15em] text-[#dde2f1]/60 uppercase font-[family-name:var(--font-body)]">EXPLORER</div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-xs text-[#00D4FF]/60 transition duration-200 ease-out hover:bg-[#00D4FF]/10 hover:text-[#00D4FF]"
          title="New file"
        >
          +
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-label text-[#00D4FF]">SAM</div>
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

