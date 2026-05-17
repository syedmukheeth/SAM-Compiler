import React from "react";

export default function EditorTabs({ tabs, activeId, onSelect, onClose }) {
  return (
    <div className="glass-panel flex h-10 items-stretch gap-1 overflow-x-auto px-2 py-1">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            className={[
              "group flex items-center gap-2 rounded-xl border px-3 text-sm transition duration-200 ease-out",
              active
                ? "border-white/12 bg-sam-text/10 text-sam-text"
                : "border-transparent bg-transparent text-white/65 hover:border-sam-glass-border hover:bg-sam-text/8 hover:text-sam-text"
            ].join(" ")}
          >
            <button type="button" className="flex items-center gap-2" onClick={() => onSelect?.(t.id)}>
              <span className="text-white/50">{t.icon}</span>
              <span className="max-w-[180px] truncate">{t.title}</span>
              {t.dirty ? <span className="ml-1 h-2 w-2 rounded-full bg-sky-400/80" /> : null}
            </button>
            <button
              type="button"
              title="Close"
              onClick={() => onClose?.(t.id)}
              className={[
                "ml-1 grid h-6 w-6 place-items-center rounded-lg transition",
                active ? "text-white/70 hover:bg-sam-text/10 hover:text-sam-text" : "text-white/0 group-hover:text-sam-text-dim"
              ].join(" ")}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

