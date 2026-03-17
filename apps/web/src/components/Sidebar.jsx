import React from "react";

function FileRow({ depth = 0, icon, name, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
        "hover:bg-white/5",
        active ? "bg-white/8 text-white" : "text-white/75"
      ].join(" ")}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <span className="text-white/55">{icon}</span>
      <span className="truncate">{name}</span>
    </button>
  );
}

export default function Sidebar({ files, activePath, onOpen }) {
  return (
    <div className="glass-sidebar flex h-full w-[280px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="text-xs font-semibold tracking-wider text-white/70">EXPLORER</div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-xs text-white/60 transition duration-200 ease-out hover:bg-white/8 hover:text-white"
          title="New file"
        >
          +
        </button>
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[11px] font-semibold text-white/60">LIQUIDIDE</div>
        <div className="text-[11px] text-white/40">local</div>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2">
        <div className="mb-1 px-2 text-[11px] font-semibold text-white/50">FILES</div>
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

