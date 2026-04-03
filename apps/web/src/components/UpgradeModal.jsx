import React from "react";
import Modal from "./Modal";

export default function UpgradeModal({ isOpen, onClose, isDarkMode }) {


  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Unlock LiquidIDE Pro" isDarkMode={isDarkMode}>
      <div className="space-y-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-4">
          <div className="inline-flex rounded-2xl bg-blue-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 ring-1 ring-blue-500/20">Limited Time Offer</div>
          <h3 className={`text-2xl font-black ${isDarkMode ? "text-white" : "text-slate-900"}`}>Unlock the Full Potential</h3>
          <p className={`text-[11px] font-bold leading-6 ${isDarkMode ? "text-white/30" : "text-slate-400"}`}>
            Get unlimited cloud executions, advanced sandboxing, and priority access to new LiquidIDE Engine features.
          </p>
        </div>

        <div className="grid gap-4">
           {[
             { title: "Unlimited Runs", desc: "No daily limits on code executions" },
             { title: "Advanced Debugging", desc: "Deep trace analysis for all languages" },
             { title: "Cloud Persistence", desc: "Save unlimited projects to our cloud" }
           ].map((feat, i) => (
             <div key={i} className={`flex items-center gap-6 rounded-2xl border p-5 transition-all hover:scale-[1.02] ${isDarkMode ? "border-white/5 bg-white/[0.02]" : "border-slate-100 bg-slate-50/50"}`}>
                <div className="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/80" : "text-slate-800"}`}>{feat.title}</p>
                  <p className={`text-[9px] font-bold ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>{feat.desc}</p>
                </div>
             </div>
           ))}
        </div>

        <button className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-5 text-[12px] font-black uppercase tracking-widest text-white shadow-2xl shadow-blue-500/20 transition-all hover:brightness-110 active:scale-95">
          Upgrade for $9/mo
        </button>

        <p className={`text-center text-[9px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/10" : "text-slate-300"}`}>No commitment. Cancel anytime.</p>
      </div>
    </Modal>
  );
}
