import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Themed confirmation dialog.
 *
 * Replaces window.confirm(), which ignores the app's theme entirely, cannot be
 * styled, blocks the whole page, and is suppressible by the browser. Also gets
 * the keyboard handling the native dialog gave us for free: Escape cancels and
 * focus lands on the confirm button.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 backdrop-blur-md"
            style={{ background: "color-mix(in oklab, var(--sam-bg) 60%, transparent)" }}
          />
          <motion.div
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 16, opacity: 0 }}
            className="relative w-full max-w-sm rounded-[24px] border p-7 shadow-2xl backdrop-blur-2xl"
            style={{
              borderColor: "var(--sam-glass-border)",
              background: "var(--sam-surface)"
            }}
          >
            <h2
              className="text-[12px] font-black uppercase tracking-[0.2em]"
              style={{ color: "var(--sam-text)" }}
            >
              {title}
            </h2>
            <p
              className="mt-3 text-[11px] leading-relaxed"
              style={{ color: "var(--sam-text-dim)" }}
            >
              {message}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                className="flex-1 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-transform active:scale-[0.98]"
                style={
                  destructive
                    ? { background: "var(--sam-red)", color: "#FFFFFF" }
                    : { background: "var(--sam-accent)", color: "var(--sam-bg)" }
                }
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-transform active:scale-[0.98]"
                style={{
                  borderColor: "var(--sam-glass-border)",
                  color: "var(--sam-text-dim)"
                }}
              >
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
