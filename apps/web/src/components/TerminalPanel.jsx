import React from "react";

export default function TerminalPanel({
  height = 220,
  activeTab = "Terminal",
  onTabChange,
  stdout,
  stderr
}) {
  return (
    <div className="terminal-container flex w-full flex-col overflow-hidden" style={{ height }}>
      <div className="flex items-center justify-between border-b border-white/10 px-2 py-1">
        <div className="flex items-center gap-1">
          {["Terminal", "Output"].map((t) => {
            const active = t === activeTab;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTabChange?.(t)}
                className={[
                  "rounded-lg px-2 py-1 text-xs transition duration-200 ease-out",
                  active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/8 hover:text-white"
                ].join(" ")}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-white/45">sandbox · no network</div>
      </div>

      <div className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed text-white/80">
        {stdout ? (
          <>
            <div className="mb-2 text-[11px] text-emerald-200/70">stdout</div>
            <pre className="whitespace-pre-wrap">{stdout}</pre>
          </>
        ) : null}
        {stderr ? (
          <>
            <div className="mb-2 mt-4 text-[11px] text-rose-200/70">stderr</div>
            <pre className="whitespace-pre-wrap">{stderr}</pre>
          </>
        ) : null}
        {!stdout && !stderr ? <div className="text-white/45">No output yet.</div> : null}
      </div>
    </div>
  );
}

