import React, { useEffect } from "react";
import logo from "../assets/logo.jpg";

export default function Modal({ isOpen, onClose, title, children, isDarkMode }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity duration-500 animate-in fade-in"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className={`relative w-full max-w-lg overflow-hidden rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl transition-all duration-500 animate-in zoom-in-95 slide-in-from-bottom-10 ${isDarkMode ? "border-white/10 bg-[#0a0a0a]/80 text-white" : "border-slate-200 bg-white/90 text-slate-900"}`}>
        <div className={`flex items-center justify-between border-b px-8 py-6 ${isDarkMode ? "border-white/5" : "border-slate-100"}`}>
          <div className="flex items-center gap-4">
            <div className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border transition-all ${isDarkMode ? "border-white/10" : "border-slate-200"}`}>
               <img src={logo} alt="Logo" className="h-full w-full object-cover" />
            </div>
            <h2 className={`text-[12px] font-black uppercase tracking-[0.3em] ${isDarkMode ? "text-white/60" : "text-slate-500"}`}>{title}</h2>
          </div>
          <button 
            onClick={onClose}
            className={`rounded-xl p-2 transition-all active:scale-95 ${isDarkMode ? "hover:bg-white/5 text-white/20" : "hover:bg-slate-100 text-slate-400"}`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="p-8 max-h-[70vh] overflow-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
