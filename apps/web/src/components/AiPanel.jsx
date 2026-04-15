import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, Sparkles, X, Zap, RefreshCw, Copy, Check, Terminal, ExternalLink
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ENDPOINTS from "../services/endpoints";
import analytics from "../services/analytics";

export default function AiPanel({ 
  isOpen, 
  onClose, 
  currentCode, 
  language, 
  metrics,
  onApplyRefactor,
  theme,
  width = 500
}) {
  const [messages, setMessages] = useState([
    { role: "model", content: "I am Sam AI, your world-class code helper and compiler assistant. How can I help you understand or fix your code today?" }
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
    analytics.trackAiInteraction("chat", input.length); // Track the interaction
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`${ENDPOINTS.API_BASE_URL}/ai/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({ code: currentCode, language, messages: [...messages, userMsg] })
      });

      if (!response.ok) throw new Error("AI Service unavailable");

      const reader = response.body.getReader();
      const decoder = new window.TextDecoder();
      let assistantMsg = { role: "model", content: "" };
      setMessages(prev => [...prev, assistantMsg]);

      let buffer = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let lines = buffer.split("\n");
        // The last element might be incomplete, keep it in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;
          
          const dataStr = trimmedLine.substring(6).trim(); // More robust than replace
          if (dataStr === "[DONE]") break;
          
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              if (parsed.terminal) throw new Error(parsed.error);
              continue;
            }
            if (parsed.chunk) {
              assistantMsg.content = (assistantMsg.content || "") + parsed.chunk;
              setMessages(prev => {
                const newMsgs = [...prev];
                const lastIdx = newMsgs.length - 1;
                if (newMsgs[lastIdx] && newMsgs[lastIdx].role === "model") {
                  newMsgs[lastIdx] = { ...assistantMsg };
                }
                return newMsgs;
              });
            }
          } catch (e) {
            console.warn("⚠️ [SAM AI] Stream chunk error:", e.message, dataStr);
          }
        }
      }


    } catch (err) {
      console.error("[AiPanel] Error in stream:", err);
      setMessages(prev => {
        // If the last message was the empty AI message we just created, update it to show the error
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "model" && lastMsg.content === "") {
           const newMsgs = [...prev];
           newMsgs[newMsgs.length - 1] = { role: "model", content: `❌ Error: ${err.message}` };
           return newMsgs;
        }
        return [...prev, { role: "model", content: `❌ Error: ${err.message}` }];
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefactor = async () => {
    setLoading(true);
    const query = "Refactor this code for maximum performance and professional industry standards.";
    setMessages(prev => [...prev, { role: "user", content: query }]);

    try {
      const res = await fetch(`${ENDPOINTS.API_BASE_URL}/ai/refactor`, {
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
    h2: ({ children }) => <h2 className={`text-lg font-bold mb-3 tracking-tight ${theme === 'dark' ? 'text-white/90' : 'text-slate-900'}`}>{children}</h2>,
    p: ({ children }) => <p className={`mb-4 last:mb-0 leading-relaxed font-medium ${theme === 'dark' ? 'text-white/90' : 'text-slate-900'}`}>{children}</p>,
    ul: ({ children }) => <ul className="mb-4 space-y-2 list-none">{children}</ul>,
    li: ({ children }) => (
      <li className="flex gap-3 items-start">
        <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full shadow-lg ${
           theme === 'dark' ? 'bg-white/40' : 'bg-slate-400'
        }`} />
        <span className={`font-medium ${theme === 'dark' ? 'text-white/90' : 'text-slate-900'}`}>{children}</span>
      </li>
    ),
    code({ inline, className, children, ...props }) {
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
    <section 
      className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${
        activeMobileTab === 'ai' ? 'flex-1' : 'hidden md:flex'
      }`}
      style={isMobile ? { width: '100%', flex: '1 1 100%' } : { width: `${width}%`, flex: `0 0 ${width}%` }}
    >
      <div className="sam-glass flex flex-1 flex-col overflow-hidden" style={{ borderRadius: 16, border: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface)' }}>
        {/* Panel Header - Standardized with Editor/Terminal */}
        <div className={`flex h-11 shrink-0 items-center justify-between px-4 md:px-5 border-b ${
          theme === 'dark' ? 'border-white/5 bg-black/20' : 'border-slate-100 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`flex h-6 w-6 items-center justify-center rounded-lg shadow-lg ${
              theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'
            }`}>
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>
              SAM AI
            </span>
            <div className={`flex items-center gap-1 opacity-60`}>
              <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                theme === 'dark' ? 'bg-white' : 'bg-black'
              }`} />
            </div>
          </div>
          <button 
            onClick={onClose} 
            className={`rounded-lg p-1.5 transition-all hover:bg-white/5 ${
              theme === 'dark' ? 'text-white/30 hover:text-white' : 'text-slate-400 hover:text-slate-900'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chat Area - Scrollable */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 select-text custom-scrollbar">
          {messages.map((msg, i) => (
            <div 
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className={`max-w-[95%] rounded-2xl px-4 py-3 text-[12px] leading-[1.6] shadow-sm select-text border ${
                msg.role === "user" 
                  ? (theme === 'dark' ? "bg-white/10 text-white border-white/10" : "bg-slate-100 text-slate-900 border-slate-200") + " rounded-tr-none" 
                  : (theme === 'dark' ? "bg-white/5 text-white/90 border-white/5" : "bg-white text-slate-800 border-slate-100") + " rounded-tl-none"
              }`}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={MarkdownComponents}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className={`flex items-center gap-2 ml-1 ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'}`}>
               <div className={`h-1 w-1 rounded-full animate-pulse ${theme === 'dark' ? 'bg-white/40' : 'bg-slate-300'}`} />
               <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Thinking...</span>
            </div>
          )}
        </div>

        {/* Action Bar & Input - Non-Floating */}
        <div className={`border-t p-4 space-y-4 ${
          theme === 'dark' ? 'border-white/5 bg-black/20' : 'border-slate-50 bg-slate-50/50'
        }`}>
          <div className="flex flex-wrap gap-2">
            <ChatQuickAction icon={<Zap />} label="Optimize" onClick={handleRefactor} theme={theme} />
            <ChatQuickAction icon={<Check />} label="Fix" onClick={() => setInput("Identify and fix potential issues in this code.")} theme={theme} />
          </div>
          
          <form onSubmit={handleSendMessage} className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sam AI..."
              className={`h-20 w-full resize-none rounded-xl border p-3 text-sm transition-all focus:outline-none ${
                  theme === 'dark' 
                    ? 'border-white/10 bg-black/40 text-white placeholder:text-white/20 focus:border-white/30' 
                    : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-300 focus:border-slate-400 shadow-sm'
              }`}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
            />
            <button 
              disabled={!input.trim() || loading}
              className={`absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-90 disabled:opacity-20 shadow-lg ${
                  theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'
              }`}
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </form>
        </div>
        
        {/* Panel Footer - Standardized Terminal Style */}
        <div className="flex h-8 md:h-10 shrink-0 items-center justify-center border-t border-[var(--sam-glass-border)]" style={{ background: 'var(--sam-surface-low)' }}>
           <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.25em', color: 'var(--sam-text)', opacity: 0.6 }}>SAM AI ASSISTANT</span>
        </div>
      </div>
    </section>
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

