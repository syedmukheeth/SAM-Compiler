import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, Sparkles, X, Zap, RefreshCw, Copy, Check, Terminal 
} from "lucide-react";
import ENDPOINTS from "../services/endpoints";

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
      const response = await fetch(`${ENDPOINTS.API_BASE_URL}/api/ai/chat`, {
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
      const res = await fetch(`${ENDPOINTS.API_BASE_URL}/api/ai/refactor`, {
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
            className="fixed right-0 top-0 z-[70] h-screen w-full border-l border-[#00D4FF]/20 bg-[#0e131e]/90 shadow-[ -20px_0_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl md:w-[450px] lg:w-[500px]"
          >
            {/* Ambient Background Glow for the panel */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
               <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#00D4FF]/10 blur-[80px]" />
               <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#8B5CF6]/10 blur-[100px]" />
            </div>

            <div className="relative flex h-full flex-col z-10">
              {/* Header */}
              <div className="flex h-20 items-center justify-between border-b border-[#00D4FF]/10 px-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00D4FF] to-[#8B5CF6] text-[#0e131e] shadow-lg shadow-[#00D4FF]/30">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black tracking-tight text-white sam-headline">Sam AI</h2>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#00D4FF] uppercase tracking-widest opacity-90 text-label">
                       <div className="h-1.5 w-1.5 rounded-full bg-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.8)] animate-pulse" />
                       Intelligence Active
                    </div>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-xl p-2.5 text-white/30 transition-all hover:bg-white/5 hover:text-white hover:scale-110 active:scale-95">
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
                          ? "bg-[#00D4FF]/10 text-white border border-[#00D4FF]/30 rounded-tr-none shadow-[0_0_15px_rgba(0,212,255,0.1)]" 
                          : "bg-white/[0.03] text-white/90 border border-[#8B5CF6]/20 backdrop-blur-xl rounded-tl-none"
                      }`}>
                        {msg.content.includes("\`\`\`") ? (
                          <div className="flex flex-col gap-4">
                            <div className="text-[13px] font-medium opacity-90">{msg.content.split("\`\`\`")[0]}</div>
                            <div className="group relative">
                              <pre className="overflow-x-auto rounded-2xl bg-black/60 p-5 font-mono text-[11px] text-emerald-400 border border-white/5 shadow-inner">
                                {msg.content.split("\`\`\`")[1]?.split("\n").slice(1).join("\n")}
                              </pre>
                              <button 
                                onClick={() => navigator.clipboard.writeText(msg.content.split("\`\`\`")[1]?.split("\n").slice(1).join("\n"))}
                                className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 text-white/40 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 hover:text-white"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="text-[12px] opacity-70 italic">{msg.content.split("\`\`\`")[2]}</div>
                            {msg.role === "model" && (
                              <button 
                                onClick={() => onApplyRefactor(msg.content.split("\`\`\`")[1]?.split("\n").slice(1).join("\n"))}
                                className="liquid-button-primary mt-2 w-full text-center py-3"
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
                    <div className="flex items-center gap-3 text-[#00D4FF]/70 ml-2">
                       <span className="sam-dot sam-dot-cyan"></span>
                       <span className="text-label ml-1 opacity-70 text-[#00D4FF]">Sam AI is thinking</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Input Area */}
              <div className="border-t border-[#00D4FF]/10 p-8 bg-[rgba(8,14,24,0.6)] backdrop-blur-md">
                <div className="mb-5 flex flex-wrap gap-2.5">
                  <ChatQuickAction icon={<Zap />} label="Optimize" onClick={handleRefactor} />
                  <ChatQuickAction icon={<Check />} label="Fix Bugs" onClick={() => setInput("Identify and fix potential issues in this code.")} />
                  <ChatQuickAction icon={<Terminal />} label="Explain" onClick={() => setInput("Explain the logic used here in simple terms.")} />
                </div>
                <form onSubmit={handleSendMessage} className="relative group">
                  <div className="absolute -inset-0.5 rounded-[24px] bg-gradient-to-r from-[#00D4FF]/30 to-[#8B5CF6]/30 opacity-0 blur transition duration-500 group-focus-within:opacity-100" />
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Sam AI anything..."
                    className="relative h-28 w-full resize-none rounded-[22px] border border-[#00D4FF]/20 bg-[rgba(0,0,0,0.4)] p-5 text-sm text-white placeholder:text-[#dde2f1]/30 focus:border-[#00D4FF]/50 focus:outline-none transition-all scrollbar-hide shadow-2xl backdrop-blur-sm"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                  />
                  <button 
                    disabled={!input.trim() || loading}
                    className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00D4FF] to-[#8B5CF6] text-[#0e131e] transition-all hover:scale-110 hover:brightness-110 active:scale-90 disabled:opacity-20 disabled:grayscale shadow-lg shadow-[#00D4FF]/40"
                  >
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin text-[#0e131e]" /> : <Send className="h-4 w-4" />}
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
      className="flex items-center gap-2.5 rounded-xl border border-[#00D4FF]/10 bg-[#00D4FF]/5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#dde2f1]/60 transition-all hover:bg-[#00D4FF]/10 hover:text-white hover:border-[#00D4FF]/40 active:scale-95"
    >
      {React.cloneElement(icon, { size: 13, className: "opacity-70 text-[#00D4FF]" })}
      {label}
    </button>
  );
}

