import React from "react";

/**
 * Top-level error boundary.
 *
 * The app had exactly one boundary, inside the AI panel. Anything thrown by
 * Monaco, Yjs, xterm or the router therefore unmounted the entire React tree
 * and left the user staring at a blank page with no way back except a manual
 * reload. This catches it and offers a recovery path.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept to the console rather than shown: stack traces are not useful to the
    // person using the compiler, and can disclose internal structure.
    console.error("[SAM] Unhandled UI error:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    // Most unrecoverable states here come from a corrupt persisted buffer or a
    // stale editor session, so offer a targeted clear before a full reload.
    try {
      localStorage.removeItem("sam_code_buffers");
      localStorage.removeItem("sam_active_lang");
    } catch {
      // Nothing more to do if storage is unavailable.
    }
    window.location.href = "/";
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-[100dvh] w-full items-center justify-center px-4"
        style={{ background: "var(--sam-bg, #000)" }}
      >
        <div
          className="w-full max-w-md rounded-[24px] border p-8"
          style={{ borderColor: "var(--sam-glass-border, rgba(255,255,255,0.08))" }}
        >
          <h1
            className="text-[13px] font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--sam-text, #fff)" }}
          >
            Something broke in the editor
          </h1>
          <p
            className="mt-3 text-[11px] leading-relaxed"
            style={{ color: "var(--sam-text-dim, rgba(255,255,255,0.6))" }}
          >
            Your saved code is still on this device. Reloading usually fixes it. If it keeps happening,
            reset the workspace to clear the stored editor state.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ background: "var(--sam-accent, #fff)", color: "var(--sam-bg, #000)" }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="flex-1 rounded-xl border px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em]"
              style={{
                borderColor: "var(--sam-glass-border, rgba(255,255,255,0.08))",
                color: "var(--sam-text-dim, rgba(255,255,255,0.6))"
              }}
            >
              Reset workspace
            </button>
          </div>
        </div>
      </div>
    );
  }
}
