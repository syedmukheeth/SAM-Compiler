import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, Sparkles, X, Zap, RefreshCw, Copy, Check, 
  Terminal, ExternalLink, BookOpen, Wrench, AlertCircle
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ENDPOINTS from "../services/endpoints";
import analytics from "../services/analytics";

// ── Typing Indicator (ChatGPT-style bouncing dots) ──────────────────────────
function TypingIndicator({ theme }) {
  const isDark = theme === 'dark';
  return (
    <div className={`flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-none w-fit border ${
      isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-100'
    }`}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className={`h-2 w-2 rounded-full ${isDark ? 'bg-white/40' : 'bg-slate-400'}`}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Quick Action Button ──────────────────────────────────────────────────────
function QuickAction({ icon, label, onClick, theme, accent }) {
  const isDark = theme === 'dark';
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
        isDark
          ? 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white hover:border-white/20'
          : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-900 hover:border-slate-300 shadow-sm'
      }`}
    >
      {React.cloneElement(icon, { size: 12, className: isDark ? 'text-white/60' : 'text-slate-600' })}
      {label}
    </motion.button>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, theme, onApplyRefactor, isLast }) {
  const [copied, setCopied] = useState(false);
  const isDark = theme === 'dark';
  const isUser = msg.role === "user";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [msg.content]);

  const MarkdownComponents = {
    h1: ({ children }) => <h1 className={`text-xl font-black mb-4 tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`text-lg font-bold mb-3 ${isDark ? 'text-white/90' : 'text-slate-900'}`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`text-base font-bold mb-2 ${isDark ? 'text-white/80' : 'text-slate-800'}`}>{children}</h3>,
    p: ({ children }) => <p className={`mb-3 last:mb-0 leading-relaxed ${isDark ? 'text-white/85' : 'text-slate-800'}`}>{children}</p>,
    ul: ({ children }) => <ul className="mb-4 space-y-1.5 list-none">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 space-y-1.5 list-decimal pl-4">{children}</ol>,
    li: ({ children }) => (
      <li className="flex gap-2.5 items-start">
        <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${isDark ? 'bg-white/30' : 'bg-slate-400'}`} />
        <span className={`leading-relaxed ${isDark ? 'text-white/85' : 'text-slate-800'}`}>{children}</span>
      </li>
    ),
    strong: ({ children }) => <strong className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{children}</strong>,
    blockquote: ({ children }) => (
      <blockquote className={`border-l-2 pl-3 my-3 italic ${isDark ? 'border-white/20 text-white/60' : 'border-slate-300 text-slate-500'}`}>
        {children}
      </blockquote>
    ),
    code({ inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = String(children).replace(/\n$/, "");

      if (!inline && match) {
        return (
          <div className="group relative my-4">
            <div className={`absolute -top-3 left-3 px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded-md z-10 ${
              isDark ? 'bg-white text-black' : 'bg-black text-white'
            }`}>
              {match[1]}
            </div>
            <div className={`rounded-2xl border overflow-hidden shadow-xl min-w-0 ${
              isDark ? 'bg-black/60 border-white/5' : 'bg-slate-50 border-slate-200'
            }`}>
              <pre className={`p-4 font-mono text-[12px] leading-relaxed overflow-x-auto whitespace-pre ${
                isDark ? 'text-white/80' : 'text-slate-700'
              }`} style={{ maxWidth: '100%', wordBreak: 'normal' }}>
                <code className={className} {...props}>{children}</code>
              </pre>
              <div className={`flex items-center justify-end gap-2 border-t p-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                isDark ? 'border-white/5 bg-white/[0.02]' : 'border-slate-200 bg-slate-100/50'
              }`}>
                <button
                  onClick={() => navigator.clipboard.writeText(codeStr)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    isDark ? 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Copy size={11} /> Copy
                </button>
                <button
                  onClick={() => onApplyRefactor(codeStr)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    isDark ? 'bg-white/10 text-white hover:bg-white hover:text-black' : 'bg-black text-white hover:opacity-90'
                  }`}
                >
                  <Zap size={11} fill="currentColor" /> Apply to Editor
                </button>
              </div>
            </div>
          </div>
        );
      }
      return (
        <code className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] ${
          isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-900'
        }`} {...props}>{children}</code>
      );
    },
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 font-bold underline ${isDark ? 'text-white' : 'text-slate-900'}`}>
        {children} <ExternalLink size={10} />
      </a>
    ),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex w-full min-w-0 flex-col ${isUser ? 'items-end' : 'items-start'}`}
    >
      {!isUser && (
        <div className={`mb-1.5 flex items-center gap-1.5 ml-1`}>
          <div className={`flex h-4 w-4 items-center justify-center rounded-md ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
            <Sparkles size={9} />
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Sam AI</span>
        </div>
      )}
      <div className="relative w-full min-w-0">
        <div className={`w-full rounded-2xl px-4 py-3 text-[12px] leading-[1.65] border select-text overflow-hidden ${
          isUser
            ? (isDark ? 'bg-white/10 text-white border-white/10 rounded-tr-none' : 'bg-slate-100 text-slate-900 border-slate-200 rounded-tr-none')
            : (isDark ? 'bg-white/5 text-white/90 border-white/5 rounded-tl-none' : 'bg-white text-slate-800 border-slate-100 rounded-tl-none shadow-sm')
        }`}>
          {msg.isError ? (
            <div className="flex items-start gap-2 text-rose-400">
              <AlertCircle size={14} className="mt-0.5 flex-none" />
              <span>{msg.content}</span>
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
        {/* Copy button on hover */}
        <button
          onClick={handleCopy}
          className={`absolute -bottom-2 ${isUser ? 'left-2' : 'right-2'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-md ${
            isDark ? 'bg-white/10 text-white/60 hover:text-white' : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200'
          }`}
        >
          {copied ? <Check size={9} /> : <Copy size={9} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main AiPanel ─────────────────────────────────────────────────────────────
export default function AiPanel({
  isOpen,
  onClose,
  currentCode,
  language,
  metrics,
  onApplyRefactor,
  theme,
  width = 33.33,
  isMobile,
  activeMobileTab
}) {
  const [messages, setMessages] = useState([
    { role: "model", content: "I am **Sam AI**, your world-class code assistant.\n\nI can **explain**, **fix**, **optimize**, and **refactor** your code. What would you like to do today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = useCallback(async (prompt) => {
    if (!prompt?.trim() || loading) return;

    const userMsg = { role: "user", content: prompt };
    setMessages(prev => [...prev, userMsg]);
    analytics.trackAiInteraction("chat", prompt.length);
    setInput("");
    setLoading(true);

    // Placeholder for streaming
    const placeholderId = Date.now();
    setMessages(prev => [...prev, { role: "model", content: "", _id: placeholderId }]);

    try {
      const response = await fetch(`${ENDPOINTS.API_BASE_URL}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({ code: currentCode, language, messages: [...messages, userMsg] })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`AI Service error (${response.status}): ${errText.substring(0, 100)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              if (parsed.terminal) throw new Error(parsed.error);
              continue;
            }
            if (parsed.chunk) {
              accumulated += parsed.chunk;
              setMessages(prev => {
                const next = [...prev];
                const idx = next.findIndex(m => m._id === placeholderId);
                if (idx !== -1) next[idx] = { role: "model", content: accumulated, _id: placeholderId };
                return next;
              });
            }
          } catch (e) {
            if (e.message && !e.message.includes("JSON")) throw e;
            console.warn("⚠️ [SAM AI] Chunk parse:", e.message);
          }
        }
      }

      // Finalize — remove _id marker
      setMessages(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m._id === placeholderId);
        if (idx !== -1) next[idx] = { role: "model", content: accumulated || "✅ Done." };
        return next;
      });

    } catch (err) {
      console.error("[AiPanel] Stream error:", err);
      setMessages(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m._id === placeholderId);
        const errMsg = { role: "model", content: `AI service is temporarily unavailable. Please try again.\n\n_Error: ${err.message}_`, isError: true };
        if (idx !== -1) next[idx] = errMsg;
        else next.push(errMsg);
        return next;
      });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading, messages, currentCode, language]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    sendMessage(input);
  }, [input, sendMessage]);

  const quickActions = [
    {
      icon: <BookOpen />,
      label: "Explain",
      prompt: `Explain this ${language} code step by step in simple terms. Break down what each part does and why.`
    },
    {
      icon: <Wrench />,
      label: "Fix",
      prompt: `Identify and fix all bugs, errors, and potential issues in this ${language} code. Show me the corrected version with explanations.`
    },
    {
      icon: <Zap />,
      label: "Optimize",
      prompt: `Optimize this ${language} code for maximum performance and production-grade quality. Explain the improvements.`
    },
  ];

  return (
    <section
      className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${
        activeMobileTab === 'ai' ? 'flex-1' : 'hidden md:flex'
      }`}
      style={isMobile ? { width: '100%', flex: '1 1 100%' } : { width: `${width}%`, flex: `0 0 ${width}%` }}
    >
      <div className="sam-glass flex flex-1 flex-col overflow-hidden" style={{ borderRadius: 16, border: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface)' }}>

        {/* Header */}
        <div className={`flex h-11 shrink-0 items-center justify-between px-4 border-b ${
          isDark ? 'border-white/5 bg-black/20' : 'border-slate-100 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>
              SAM AI
            </span>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`h-1.5 w-1.5 rounded-full ${isDark ? 'bg-green-400' : 'bg-green-500'}`}
            />
          </div>
          <button
            onClick={onClose}
            className={`rounded-lg p-1.5 transition-all ${isDark ? 'text-white/30 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chat Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 custom-scrollbar min-w-0">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg._id || i}
                msg={msg}
                theme={theme}
                onApplyRefactor={onApplyRefactor}
                isLast={i === messages.length - 1}
              />
            ))}
          </AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-start"
            >
              <div className={`mb-1.5 flex items-center gap-1.5 ml-1`}>
                <div className={`flex h-4 w-4 items-center justify-center rounded-md ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
                  <Sparkles size={9} />
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Sam AI</span>
              </div>
              <TypingIndicator theme={theme} />
            </motion.div>
          )}
        </div>

        {/* Quick Actions + Input */}
        <div className={`border-t p-3 space-y-3 ${isDark ? 'border-white/5 bg-black/20' : 'border-slate-100 bg-slate-50/50'}`}>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(qa => (
              <QuickAction
                key={qa.label}
                icon={qa.icon}
                label={qa.label}
                onClick={() => sendMessage(qa.prompt)}
                theme={theme}
              />
            ))}
          </div>

          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sam AI anything about your code..."
              rows={3}
              className={`w-full resize-none rounded-xl border p-3 pr-12 text-sm transition-all focus:outline-none ${
                isDark
                  ? 'border-white/10 bg-black/40 text-white placeholder:text-white/20 focus:border-white/30'
                  : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-300 focus:border-slate-400 shadow-sm'
              }`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className={`absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-90 disabled:opacity-20 shadow-lg ${
                isDark ? 'bg-white text-black' : 'bg-black text-white'
              }`}
            >
              {loading
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />
              }
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className={`flex h-8 shrink-0 items-center justify-center border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`} style={{ background: 'var(--sam-surface-low)' }}>
          <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.25em', color: 'var(--sam-text)', opacity: 0.4 }}>
            Powered by Gemini · SAM AI
          </span>
        </div>
      </div>
    </section>
  );
}
