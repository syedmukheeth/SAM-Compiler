import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ThemeToggle({ theme, toggle }) {
  const isDark = theme === 'dark';
  
  return (
    <motion.button
      onClick={toggle}
      className={`relative flex h-8 w-14 items-center rounded-full p-1 focus:outline-none overflow-hidden transition-colors border ${
        isDark ? 'border-white/10 bg-white/10' : 'border-black/10 bg-black/5'
      }`}
      style={{ backdropFilter: 'blur(10px)' }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="absolute left-1 flex h-6 w-6 items-center justify-center rounded-full shadow-md"
        animate={{ 
          x: isDark ? 0 : 24,
          background: isDark ? '#FFFFFF' : '#000000',
        }}
        transition={{ 
          type: "spring",
          stiffness: 500,
          damping: 30,
          mass: 0.8
        }}
      >
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.div
              key="moon"
              initial={{ opacity: 0, rotate: -90, scale: 0.3 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.3 }}
              transition={{ duration: 0.15 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
              </svg>
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ opacity: 0, rotate: 90, scale: 0.3 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.3 }}
              transition={{ duration: 0.15 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.button>
  );
}
