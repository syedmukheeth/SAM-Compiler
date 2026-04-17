import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, ShieldCheck } from "lucide-react";
import OfficialLogo from "./OfficialLogo";

// 🛡️ BRAND ICON RECOVERY: Local SVG components to bypass lucide-react v1+ removal of brand icons
const LinkedinIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);

const GithubIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.042-1.416-4.042-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

export default function AboutModal({ isOpen, onClose, theme = "dark" }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />
        
        <motion.div
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          className={`relative w-full max-w-sm overflow-hidden rounded-[32px] border p-8 shadow-2xl backdrop-blur-2xl ${
            theme === 'dark' ? 'border-white/10 bg-black/95' : 'border-slate-200 bg-white/95'
          }`}
        >
          <button 
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full p-2 text-white/20 hover:bg-white/5 hover:text-white transition-all"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <OfficialLogo theme={theme} size={64} className="mb-6" />
            
            <h2 className={`text-lg font-black uppercase tracking-[0.3em] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              SAM COMPILER
            </h2>
            <p className={`mt-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 ${theme === 'dark' ? 'text-white' : 'text-slate-500'}`}>
              Syntax Analysis Machine v2.4
            </p>

            <div className="my-8 h-[1px] w-full bg-white/5" />

            <div className="space-y-6 w-full">
              <div className="flex flex-col items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Architect & Developer</span>
                <h3 className={`text-sm font-black uppercase tracking-widest ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Syed Mukheeth
                </h3>
              </div>

                <a 
                  href="https://linkedin.com/in/syedmukheeth" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center justify-between rounded-2xl p-4 transition-all group ${
                    theme === 'dark' 
                      ? 'bg-[#0077b5]/10 border border-[#0077b5]/20 hover:bg-[#0077b5]' 
                      : 'bg-[#0077b5]/5 border border-[#0077b5]/10 hover:bg-[#0077b5]'
                  }`}
                >
                  <div className={`flex items-center gap-3 transition-colors ${
                    theme === 'dark' ? 'text-[#0077b5] group-hover:text-white' : 'text-[#0077b5] group-hover:text-white'
                  }`}>
                    <LinkedinIcon className="h-5 w-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Connect on LinkedIn</span>
                  </div>
                  <ExternalLink className="h-4 w-4 text-[#0077b5] group-hover:text-white transition-colors" />
                </a>

                <a 
                  href="https://github.com/syedmukheeth" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center justify-between rounded-2xl p-4 transition-all group ${
                    theme === 'dark' 
                      ? 'bg-white/5 border border-white/10 hover:bg-white hover:text-black' 
                      : 'bg-slate-900/5 border border-slate-900/10 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className={`flex items-center gap-3 transition-colors ${
                    theme === 'dark' ? 'text-white group-hover:text-black' : 'text-slate-900 group-hover:text-white'
                  }`}>
                    <GithubIcon className="h-5 w-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Follow on GitHub</span>
                  </div>
                  <ExternalLink className={`h-4 w-4 transition-colors ${
                    theme === 'dark' ? 'text-white group-hover:text-black' : 'text-slate-900 group-hover:text-white'
                  }`} />
                </a>
            </div>

            <div className="mt-8 flex items-center gap-2 opacity-30">
              <ShieldCheck className="h-3 w-3" />
              <span className="text-[8px] font-bold uppercase tracking-widest">Hardened Runtime | Enterprise Grade</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
