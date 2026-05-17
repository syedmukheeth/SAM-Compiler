import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X, ShieldCheck, ShieldAlert } from "lucide-react";

export default function ConsentNotice() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("sam_cookie_consent");
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 2500); // Slight delay for premium feel
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAction = (choice) => {
    localStorage.setItem("sam_cookie_consent", choice);
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          style={{
            zIndex: 95,
            bottom: 'calc(env(safe-area-inset-bottom) + 110px)' // Position above mobile nav tabs (~96px)
          }}
          className="fixed left-4 right-4 mx-auto max-w-xl md:bottom-8 md:left-8 md:right-8 lg:left-auto lg:right-12"
        >
          <div 
            className="sam-glass flex flex-col gap-4 border border-sam-glass-border bg-[#0A0A0A]/90 p-5 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] rounded-[24px] overflow-hidden"
            style={{ maxHeight: '25vh' }}
          >
            <div className="flex items-start gap-4 overflow-y-auto custom-scrollbar pr-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--sam-accent-muted)] ring-1 ring-[var(--sam-accent)]/20">
                <Cookie className="h-5 w-5 text-[var(--sam-accent)]" />
              </div>
              
              <div className="flex-1">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-sam-text mb-1">Workspace Persistence</h4>
                <p className="text-[11px] font-medium leading-relaxed text-white/50">
                  SAM uses essential cookies to preserve your cloud workspace state and session data. 
                  By continuing, you agree to our <a href="/privacy" className="text-sam-text hover:underline underline-offset-4 decoration-white/20">Privacy Policy</a>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsVisible(false)}
                className="shrink-0 p-1 text-sam-text-muted hover:text-sam-text transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 mt-auto">
              <button
                type="button"
                onClick={() => handleAction("accepted")}
                className="w-full sm:flex-1 rounded-xl bg-sam-text px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-sam-bg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={3} />
                Accept All
              </button>
              
              <button
                type="button"
                onClick={() => handleAction("rejected")}
                className="w-full sm:w-auto rounded-xl bg-sam-text/5 border border-sam-glass-border px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-sam-text-muted transition-all hover:bg-sam-text/10 hover:text-sam-text flex items-center justify-center gap-2"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
