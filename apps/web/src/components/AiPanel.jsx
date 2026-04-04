import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, Sparkles, X, Zap, RefreshCw, Copy, Check, Terminal, ExternalLink
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ENDPOINTS from "../services/endpoints";

export default function AiPanel({ 
  isOpen, 
  onClose, 
  currentCode, 
  language, 
  metrics,
  onApplyRefactor,
  theme
}) {
  const [messages, setMessages] = useState([
    { role: "model", content: "I am Sam AI, your elite coding partner. How can I assist with your code today?" }
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
            let parsed;
            try {
              parsed = JSON.parse(dataStr);
            } catch (e) {
              continue; // ignore incomplete chunks
            }
            if (parsed.error) throw new Error(parsed.error);
            assistantMsg.content += parsed.chunk;
            setMessages(prev => {
              const newMsgs = [...prev];
              newMsgs[newMsgs.length - 1] = { ...assistantMsg };
              return newMsgs;
            });
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

  const MarkdownComponents = {
    h1: ({ children }) => <h1 className={`text-xl font-black mb-4 tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`text-lg font-bold mb-3 tracking-tight ${theme === 'dark' ? 'text-white/90' : 'text-slate-800'}`}>{children}</h2>,
    p: ({ children }) => <p className={`mb-4 last:mb-0 leading-relaxed ${theme === 'dark' ? 'text-white/80' : 'text-slate-700'}`}>{children}</p>,
    ul: ({ children }) => <ul className="mb-4 space-y-2 list-none">{children}</ul>,
    li: ({ children }) => (
      <li className="flex gap-3 items-start">
        <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full shadow-lg ${
           theme === 'dark' ? 'bg-white/40' : 'bg-slate-400'
        }`} />
        <span className={theme === 'dark' ? 'text-white/80' : 'text-slate-700'}>{children}</span>
      </li>
    ),
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = String(children).replace(/\n$/, "");
      const isDark = theme === 'dark';
      
      if (!inline && match) {
        return (
          <div className="group relative my-6">
            <div className={`absolute -top-3 left-4 px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded-md z-10 ${
              isDark ? 'bg-white text-black' : 'bg-black text-white'
            }`}>
              {match[1]}
            </div>
            <div className={`rounded-2xl border overflow-hidden shadow-2xl backdrop-blur-xl transition-all ${
              isDark ? 'bg-black/60 border-white/5' : 'bg-slate-50/50 border-slate-200'
            }`}>
              <pre className={`p-5 font-mono text-[12px] leading-relaxed overflow-x-auto scrollbar-hide ${
                 isDark ? 'text-white/80' : 'text-slate-700'
              }`}>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
              <div className={`flex items-center justify-end gap-2 border-t p-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                isDark ? 'border-white/5 bg-white/[0.02]' : 'border-slate-200 bg-slate-100/50'
              }`}>
                <button 
                  onClick={() => navigator.clipboard.writeText(codeStr)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    isDark ? 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Copy size={12} /> Copy
                </button>
                <button 
                  onClick={() => onApplyRefactor(codeStr)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    isDark ? 'bg-white/10 text-white hover:bg-white hover:text-black' : 'bg-black text-white hover:opacity-90'
                  }`}
                >
                  <Zap size={12} fill="currentColor" /> Apply
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <code className={`px-1.5 py-0.5 rounded-md font-mono ${
          isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-900'
        }`} {...props}>
          {children}
        </code>
      );
    },
    a: ({ href, children }) => (
      <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 font-bold underline transition-colors ${
           theme === 'dark' ? 'text-white' : 'text-slate-900'
        }`}
      >
        {children} <ExternalLink size={10} />
      </a>
    ),
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop (Mobile Only) */}
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
            className={`fixed right-0 top-0 z-[65] h-screen w-full border-l shadow-[-20px_0_50px_rgba(0,0,0,0.1)] backdrop-blur-3xl md:w-[450px] lg:w-[500px] ${
              theme === 'dark' ? 'bg-black border-white/5 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Ambient Background Glow */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
               <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-[80px]" />
            </div>

            <div className="relative flex h-full flex-col z-10">
              <div className={`flex h-20 items-center justify-between border-b px-8 ${
                theme === 'dark' ? 'border-white/5' : 'border-slate-100'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-lg transition-transform hover:scale-110 ${
                    theme === 'dark' ? 'bg-white text-black shadow-white/10' : 'bg-black text-white shadow-black/10'
                  }`}>
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className={`text-base font-black tracking-tight sam-headline ${
                       theme === 'dark' ? 'text-white' : 'text-slate-900'
                    }`}>Sam AI</h2>
                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-90 text-label ${
                        theme === 'dark' ? 'text-white/40' : 'text-slate-400'
                    }`}>
                       <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                         theme === 'dark' ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-black shadow-[0_0_8px_rgba(0,0,0,0.3)]'
                       }`} />
                       Intelligence Active
                    </div>
                  </div>
                </div>
                <button 
                  onClick={onClose} 
                  className={`rounded-xl p-2.5 transition-all hover:scale-110 active:scale-95 ${
                    theme === 'dark' ? 'text-white/30 hover:bg-white/5 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
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
                      <div className={`max-w-[95%] rounded-3xl px-5 py-4 text-[13px] leading-[1.6] shadow-xl ${
                        msg.role === "user" 
                          ? (theme === 'dark' ? "bg-white/10 text-white border border-white/10" : "bg-slate-100 text-slate-900 border border-slate-200") + " rounded-tr-none shadow-2xl" 
                          : (theme === 'dark' ? "bg-white/5 text-white/90 border border-white/5" : "bg-white text-slate-800 border border-slate-100") + " backdrop-blur-xl rounded-tl-none"
                      }`}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={MarkdownComponents}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className={`flex items-center gap-3 ml-2 ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'}`}>
                       <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${theme === 'dark' ? 'bg-white/40' : 'bg-slate-300'}`} />
                       <span className="text-[10px] font-bold uppercase tracking-widest ml-1 opacity-70">Sam AI is thinking</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={`border-t p-8 backdrop-blur-md ${
                theme === 'dark' ? 'border-white/5 bg-black/40' : 'border-slate-100 bg-slate-50/80'
              }`}>
                <div className="mb-5 flex flex-wrap gap-2.5">
                  <ChatQuickAction icon={<Zap />} label="Optimize" onClick={handleRefactor} theme={theme} />
                  <ChatQuickAction icon={<Check />} label="Fix Bugs" onClick={() => setInput("Identify and fix potential issues in this code.")} theme={theme} />
                  <ChatQuickAction icon={<Terminal />} label="Explain" onClick={() => setInput("Explain the logic used here in simple terms.")} theme={theme} />
                </div>
                <form onSubmit={handleSendMessage} className="relative group">
                  <div className={`absolute -inset-0.5 rounded-[24px] opacity-0 blur transition duration-500 group-focus-within:opacity-100 ${
                    theme === 'dark' ? 'bg-white/10' : 'bg-black/5'
                  }`} />
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Sam AI anything..."
                    className={`relative h-28 w-full resize-none rounded-[22px] border p-5 text-sm transition-all scrollbar-hide shadow-2xl backdrop-blur-sm focus:outline-none ${
                        theme === 'dark' 
                          ? 'border-white/10 bg-black/40 text-white placeholder:text-white/20 focus:border-white/30' 
                          : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-300 focus:border-slate-400'
                    }`}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                  />
                  <button 
                    disabled={!input.trim() || loading}
                    className={`absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-2xl transition-all hover:scale-110 hover:brightness-110 active:scale-90 disabled:opacity-20 disabled:grayscale shadow-lg ${
                        theme === 'dark' ? 'bg-white text-black shadow-white/40' : 'bg-black text-white shadow-black/40'
                    }`}
                  >
                    {loading ? <RefreshCw className={`h-4 w-4 animate-spin ${theme === 'dark' ? 'text-black' : 'text-white'}`} /> : <Send className="h-4 w-4" />}
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

function ChatQuickAction({ icon, label, onClick, theme }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
          theme === 'dark' 
            ? 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white hover:border-white/20' 
            : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-900 hover:border-slate-300 shadow-sm'
      }`}
    >
      {React.cloneElement(icon, { size: 13, className: `opacity-70 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}` })}
      {label}
    </button>
  );
}

