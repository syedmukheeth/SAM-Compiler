import React from "react";
import { Clock, Code, Terminal, Calendar, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

export default function HistoryPanel({ history, onSelect, onClose }) {
  return (
    <motion.div 
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 z-[100] h-full w-full max-w-sm border-l border-white/10 bg-[#0a0a0c]/95 backdrop-blur-2xl shadow-2xl"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/5 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <Clock className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">History</h2>
          </div>
          <button 
            onClick={onClose}
            className="rounded-full bg-white/5 p-2 text-white/40 hover:bg-white/10 hover:text-white transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 rounded-full bg-white/5 p-4 text-white/10">
                <Terminal className="h-8 w-8" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">No execution history</p>
            </div>
          ) : (
            history.map((item) => (
              <button
                key={item.runId || item._id}
                onClick={() => onSelect(item)}
                className="group w-full rounded-xl border border-white/5 bg-white/[0.02] p-4 text-left transition-all hover:bg-white/5 hover:border-emerald-500/30"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${item.status === 'succeeded' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/60">{item.runtime}</span>
                  </div>
                  <span className="text-[8px] font-bold text-white/20 uppercase tracking-tighter">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <div className="mb-3 line-clamp-2 font-mono text-[10px] text-white/40 bg-black/40 rounded-lg p-2 border border-white/5">
                  {(item.files?.[0]?.content || "No code content").substring(0, 100)}...
                </div>

                <div className="flex items-center gap-4 text-[8px] font-bold text-white/20 uppercase tracking-widest">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                  {item.metrics?.durationMs && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.metrics.durationMs}ms
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        
        <div className="border-t border-white/5 p-6 bg-white/[0.01]">
          <p className="text-[8px] leading-relaxed font-bold uppercase tracking-[0.2em] text-white/20 text-center">
            Your executions are automatically synced across devices
          </p>
        </div>
      </div>
    </motion.div>
  );
}
