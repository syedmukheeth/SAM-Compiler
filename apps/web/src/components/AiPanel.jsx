import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, Sparkles, X, ChevronRight, Zap, RefreshCw, Check, Copy, MessageSquare, Terminal 
} from "lucide-react";

export default function AiPanel({ 
  isOpen, 
  onClose, 
  currentCode, 
  language, 
  metrics,
  onApplyRefactor 
}) {
  const [messages, setMessages] = useState([
    { role: "model", content: "I am your Senior SRE Assistant. How can I optimize your code today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentCode, language, messages: [...messages, userMsg] })
      });

      if (!response.ok) throw new Error("AI Service unavailable");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = { role: "model", content: "" };
      setMessages(prev => [...prev, assistantMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "");
            if (dataStr === "[DONE]") break;
            try {
              const { chunk: text, error } = JSON.parse(dataStr);
              if (error) throw new Error(error);
              assistantMsg.content += text;
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1] = { ...assistantMsg };
                return newMsgs;
              });
            } catch (e) { /* ignore parse errors for partial chunks */ }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "model", content: `❌ Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefactor = async () => {
    setLoading(true);
    const query = "Refactor this code for maximum performance and Google SRE standards.";
    setMessages(prev => [...prev, { role: "user", content: query }]);

    try {
      const res = await fetch("/api/ai/refactor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentCode, language, metrics, query })
      });
      const data = await res.json();
      if (data.refactor) {
        setMessages(prev => [...prev, { role: "model", content: data.refactor }]);
      }
    } catch (err) {
       setMessages(prev => [...prev, { role: "model", content: `❌ Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm md:hidden"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-[70] h-screen w-full border-l border-white/5 bg-[#0a0a0c]/90 shadow-2xl backdrop-blur-3xl md:w-[400px] lg:w-[450px]"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex h-16 items-center justify-between border-b border-white/5 px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/20 text-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.2)]">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-white">SRE Assistant</h2>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                       <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                       Gemini 1.5 Pro Active
                    </div>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/5 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Chat Area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                <div className="flex flex-col gap-6">
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                        msg.role === "user" 
                          ? "bg-blue-600/20 text-blue-100 border border-blue-600/20" 
                          : "bg-white/[0.03] text-white/80 border border-white/5"
                      }`}>
                        {msg.content.includes("```") ? (
                          <div className="flex flex-col gap-3">
                            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[10px] text-emerald-400 border border-white/5">
                              {msg.content.split("```")[1]?.split("\n").slice(1).join("\n")}
                            </pre>
                            <div className="text-[11px] opacity-80">{msg.content.split("```")[2]}</div>
                            {msg.role === "model" && (
                              <button 
                                onClick={() => onApplyRefactor(msg.content.split("```")[1]?.split("\n").slice(1).join("\n"))}
                                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-500 active:scale-95 shadow-lg shadow-blue-600/20"
                              >
                                <Zap className="h-3 w-3" />
                                Apply Changes
                              </button>
                            )}
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-blue-500/40">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">SRE is thinking...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Input Area */}
              <div className="border-t border-white/5 p-6 bg-white/[0.01]">
                <div className="mb-4 flex flex-wrap gap-2">
                  <QuickAction icon={<Zap />} label="Optimize" onClick={handleRefactor} />
                  <QuickAction icon={<Check />} label="Fix Bugs" onClick={() => setInput("Identify and fix potential bugs in this code.")} />
                  <QuickAction icon={<MessageSquare />} label="Explain" onClick={() => setInput("Explain how this code works like I'm a Junior Engineer.")} />
                </div>
                <form onSubmit={handleSendMessage} className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask your SRE assistant..."
                    className="h-24 w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none transition-all scrollbar-hide"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                  />
                  <button 
                    disabled={!input.trim() || loading}
                    className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:opacity-30 disabled:grayscale"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/40 transition-all hover:bg-white/10 hover:text-white"
    >
      {React.cloneElement(icon, { size: 12 })}
      {label}
    </button>
  );
}
