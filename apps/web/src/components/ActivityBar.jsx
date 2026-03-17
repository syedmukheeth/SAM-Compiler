import React from "react";

const items = [
  { id: "explorer", label: "Explorer", glyph: "⧉" },
  { id: "search", label: "Search", glyph: "⌕" },
  { id: "source", label: "Source Control", glyph: "⇄" },
  { id: "run", label: "Run", glyph: "▶" },
  { id: "extensions", label: "Extensions", glyph: "⬚" }
];

export default function ActivityBar({ activeId, onChange }) {
  return (
    <div className="glass-sidebar flex h-full w-[52px] flex-col items-center gap-2 py-3">
      <div className="mb-2 select-none text-xs font-semibold tracking-wide text-white/70">LIQ</div>
      {items.map((it) => {
        const active = it.id === activeId;
        return (
          <button
            key={it.id}
            type="button"
            title={it.label}
            onClick={() => onChange?.(it.id)}
            className={[
              "group relative grid h-10 w-10 place-items-center rounded-xl transition duration-200 ease-out",
              "hover:bg-white/8 hover:text-white",
              active ? "bg-white/8 text-white" : "text-white/70"
            ].join(" ")}
          >
            <span className="text-lg leading-none">{it.glyph}</span>
            <span
              className={[
                "absolute left-[-1px] top-2 h-6 w-[2px] rounded-full transition-opacity",
                active ? "bg-sky-400 opacity-100" : "bg-transparent opacity-0"
              ].join(" ")}
            />
          </button>
        );
      })}
      <div className="mt-auto flex flex-col gap-2 pb-1">
        <button
          type="button"
          title="Settings"
          className="grid h-10 w-10 place-items-center rounded-xl text-white/60 transition duration-200 ease-out hover:bg-white/8 hover:text-white"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

