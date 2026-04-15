import React from "react";

export default function ShortcutItem({ keys, label, theme }) {
  const isDark = theme === 'dark';
  return (
    <div className="flex items-center justify-between">
       <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-500'}`}>{label}</span>
       <div className="flex gap-1">
          {keys.map(k => (
            <kbd key={k} className={`flex h-5 items-center justify-center rounded px-1.5 text-[9px] font-black ${
               isDark ? 'bg-white/10 text-white/80' : 'bg-slate-200 text-slate-700'
            }`}>{k}</kbd>
          ))}
       </div>
    </div>
  );
}
