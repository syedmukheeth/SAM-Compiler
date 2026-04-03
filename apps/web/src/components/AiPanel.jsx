import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, Sparkles, X, Zap, RefreshCw, Copy, Check, Terminal 
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
    { role: "model", content: "I am Sam AI, your elite coding partner." }
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
      const decoder = new window.TextDecoder();
      let assistantMsg = { role: "model", content: "" };
      setMessages(prev => [...prev, assistantMsg]);

      // eslint-disable-next-line no-constant-condition
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
    const query = "Refactor this code for maximum performance and professional industry standards.";
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
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md md:hidden"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-[70] h-screen w-full border-l border-white/5 bg-[#030303]/80 shadow-[ -20px_0_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl md:w-[450px] lg:w-[500px]"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex h-20 items-center justify-between border-b border-white/5 px-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black tracking-tight text-white">Sam AI</h2>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-widest opacity-80">
                       <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.8)] animate-pulse" />
                       Intelligence Active
                    </div>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-xl p-2.5 text-white/20 transition-all hover:bg-white/5 hover:text-white hover:scale-110 active:scale-95">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Chat Area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                <div className="flex flex-col gap-8">
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 15, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <div className={`max-w-[90%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-xl ${
                        msg.role === "user" 
                          ? "bg-blue-600/10 text-blue-100 border border-blue-500/20 rounded-tr-none" 
                          : "bg-white/[0.03] text-white/90 border border-white/5 backdrop-blur-xl rounded-tl-none"
                      }`}>
                        {msg.content.includes("```") ? (
                          <div className="flex flex-col gap-4">
                            <div className="text-[13px] font-medium opacity-90">{msg.content.split("```")[0]}</div>
                            <div className="group relative">
                              <pre className="overflow-x-auto rounded-2xl bg-black/60 p-5 font-mono text-[11px] text-emerald-400 border border-white/5 shadow-inner">
                                {msg.content.split("```")[1]?.split("\n").slice(1).join("\n")}
                              </pre>
                              <button 
                                onClick={() => navigator.clipboard.writeText(msg.content.split("```")[1]?.split("\n").slice(1).join("\n"))}
                                className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 text-white/40 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 hover:text-white"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="text-[12px] opacity-70 italic">{msg.content.split("```")[2]}</div>
                            {msg.role === "model" && (
                              <button 
                                onClick={() => onApplyRefactor(msg.content.split("```")[1]?.split("\n").slice(1).join("\n"))}
                                className="flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white transition-all hover:scale-[1.02] hover:brightness-110 active:scale-95 shadow-lg shadow-blue-600/20"
                              >
                                <Zap className="h-3.5 w-3.5 fill-current" />
                                Optimize Codebase
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
                    <div className="flex items-center gap-3 text-blue-400/60 ml-2">
                      <div className="flex gap-1.5">
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="h-1.5 w-1.5 rounded-full bg-current" />
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="h-1.5 w-1.5 rounded-full bg-current" />
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="h-1.5 w-1.5 rounded-full bg-current" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Sam AI is thinking</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Input Area */}
              <div className="border-t border-white/5 p-8 bg-white/[0.01]">
                <div className="mb-5 flex flex-wrap gap-2.5">
                  <ChatQuickAction icon={<Zap />} label="Optimize" onClick={handleRefactor} />
                  <ChatQuickAction icon={<Check />} label="Fix Bugs" onClick={() => setInput("Identify and fix potential issues in this code.")} />
                  <ChatQuickAction icon={<Terminal />} label="Explain" onClick={() => setInput("Explain the logic used here in simple terms.")} />
                </div>
                <form onSubmit={handleSendMessage} className="relative group">
                  <div className="absolute -inset-0.5 rounded-[24px] bg-gradient-to-r from-blue-600/20 to-indigo-600/20 opacity-0 blur transition duration-500 group-focus-within:opacity-100" />
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Sam AI anything..."
                    className="relative h-28 w-full resize-none rounded-[22px] border border-white/10 bg-[#0c0c0e] p-5 text-sm text-white placeholder:text-white/20 focus:border-blue-500/30 focus:outline-none transition-all scrollbar-hide shadow-2xl"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                  />
                  <button 
                    disabled={!input.trim() || loading}
                    className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white transition-all hover:bg-blue-500 hover:scale-110 active:scale-90 disabled:opacity-20 disabled:grayscale shadow-lg shadow-blue-600/20"
                  >
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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

function ChatQuickAction({ icon, label, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40 transition-all hover:bg-white/10 hover:text-white hover:border-white/10 active:scale-95"
    >
      {React.cloneElement(icon, { size: 13, className: "opacity-70" })}
      {label}
    </button>
  );
}

