import React from 'react';
import { motion } from 'framer-motion';
import { Code2, Terminal, Sparkles } from 'lucide-react';

const MobileTabNav = ({ activeTab, onTabChange, theme }) => {
  const isDark = theme === 'dark';

  const tabs = [
    { id: 'editor', label: 'Editor', icon: <Code2 size={18} /> },
    { id: 'terminal', label: 'Terminal', icon: <Terminal size={18} /> },
    { id: 'ai', label: 'SAM AI', icon: <Sparkles size={18} /> },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[120] lg:hidden safe-bottom">
      <div 
        className="mx-4 mb-4 flex items-center justify-around p-2 rounded-[24px] border backdrop-blur-2xl shadow-2xl transition-all duration-500"
        style={{
          background: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.85)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          boxShadow: isDark 
            ? '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
            : '0 12px 40px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.02)',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center gap-1.5 py-2 px-6 transition-all duration-300"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div 
                className={`transition-all duration-300 ${
                  isActive 
                    ? (isDark ? 'text-white' : 'text-black') 
                    : (isDark ? 'text-white/30' : 'text-slate-400')
                }`}
              >
                {React.cloneElement(tab.icon, { 
                  strokeWidth: isActive ? 2.5 : 2,
                  className: isActive ? 'scale-110' : 'scale-100'
                })}
              </div>
              
              <span 
                className={`text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${
                  isActive 
                    ? (isDark ? 'text-white' : 'text-black') 
                    : (isDark ? 'text-white/20' : 'text-slate-400/60')
                }`}
              >
                {tab.label}
              </span>

              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute -bottom-1 h-1 w-1 rounded-full"
                  style={{ background: isDark ? 'white' : 'black' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileTabNav;
