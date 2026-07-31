import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, Sparkles, X, Zap, RefreshCw, Copy, Check, 
  ExternalLink, BookOpen, Wrench, AlertCircle
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ENDPOINTS from "../services/endpoints";

// ── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator({ isDark }) {
  return (
    <div className={`flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-none w-fit border ${
      isDark
        ? 'bg-white/5 border-white/10'
        : 'bg-slate-100 border-slate-200'
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

// ── Quick Action Button ───────────────────────────────────────────────────────
function QuickAction({ icon, label, onClick, isDark }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
        isDark
          ? 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white hover:border-white/20'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 shadow-sm'
      }`}
    >
      {React.cloneElement(icon, { size: 12, className: isDark ? 'text-white/40' : 'text-slate-500' })}
      {label}
    </motion.button>
  );
}

// ── Code Block ───────────────────────────────────────────────────────────────
function CodeBlock({ language: lang, codeStr, isDark, onApply }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-4">
      {/* Language badge */}
      <div className={`absolute -top-3 left-3 px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded-md z-10 ${
        isDark ? 'bg-white text-black' : 'bg-slate-800 text-white'
      }`}>
        {lang}
      </div>

      {/* Code box */}
      <div className={`rounded-2xl border overflow-hidden shadow-lg ${
        isDark
          ? 'bg-black/40 border-white/10'
          : 'bg-slate-900 border-slate-700'
      }`}>
        <pre className="p-4 pt-6 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-slate-100 overflow-x-auto">
          <code>{codeStr}</code>
        </pre>

        {/* Action bar */}
        <div className={`flex items-center justify-end gap-2 border-t p-2 ${
          isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-700/50 bg-black/20'
        }`}>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-95 bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => onApply?.(codeStr)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase transition-all active:scale-95 shadow ${
              isDark
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            <Zap size={11} fill="currentColor" /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isDark, onApplyRefactor }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [msg.content]);

  const remarkPlugins = React.useMemo(() => [remarkGfm], []);

  const MarkdownComponents = React.useMemo(() => ({
    h1: ({ children }) => (
      <h1 className={`text-xl font-black mb-4 tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className={`text-lg font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className={`text-base font-bold mb-2 ${isDark ? 'text-white/80' : 'text-slate-800'}`}>
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className={`mb-3 last:mb-0 leading-relaxed break-words ${isDark ? 'text-white/85' : 'text-slate-700'}`}>
        {children}
      </p>
    ),
    ul: ({ children }) => <ul className="mb-4 space-y-1.5 list-none">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 space-y-1.5 list-decimal pl-4">{children}</ol>,
    li: ({ children }) => (
      <li className="flex gap-2.5 items-start">
        <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${isDark ? 'bg-white/30' : 'bg-slate-400'}`} />
        <span className={`leading-relaxed ${isDark ? 'text-white/85' : 'text-slate-700'}`}>{children}</span>
      </li>
    ),
    strong: ({ children }) => (
      <strong className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{children}</strong>
    ),
    blockquote: ({ children }) => (
      <blockquote className={`border-l-2 pl-3 my-3 italic ${isDark ? 'border-white/20 text-white/50' : 'border-slate-300 text-slate-500'}`}>
        {children}
      </blockquote>
    ),
    code({ inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = (Array.isArray(children)
        ? children.map(c => typeof c === 'string' ? c : '').join('')
        : String(children ?? '')
      ).replace(/\n$/, "");

      if (!inline && match) {
        return (
          <CodeBlock
            language={match[1]}
            codeStr={codeStr}
            isDark={isDark}
            onApply={onApplyRefactor}
          />
        );
      }
      // Inline code — consistent dark pill regardless of mode for readability
      return (
        <code
          className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] ${
            isDark
              ? 'bg-white/10 text-green-300'
              : 'bg-slate-800 text-green-300'
          }`}
          {...props}
        >
          {children}
        </code>
      );
    },
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 font-bold underline ${isDark ? 'text-blue-300' : 'text-blue-600'}`}
      >
        {children} <ExternalLink size={10} />
      </a>
    ),
  }), [isDark, onApplyRefactor]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex w-full min-w-0 flex-col ${isUser ? 'items-end' : 'items-start'}`}
    >
      {/* SAM AI label */}
      {!isUser && (
        <div className="mb-1.5 flex items-center gap-1.5 ml-1">
          <div className={`flex h-4 w-4 items-center justify-center rounded-md ${
            isDark
              ? 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.3)]'
              : 'bg-slate-900 text-white'
          }`}>
            <Sparkles size={9} />
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
            Sam AI
          </span>
        </div>
      )}

      {/* Bubble */}
      <div className="relative w-full min-w-0">
        <div className={`w-full rounded-2xl px-5 py-4 text-[13px] leading-[1.7] border select-text overflow-hidden break-words transition-all ${
          isUser
            ? isDark
              ? 'bg-white/10 text-white border-white/10 rounded-tr-none'
              : 'bg-slate-100 text-slate-900 border-slate-200 rounded-tr-none'
            : isDark
              ? 'bg-white/[0.07] text-white/95 border-white/10 rounded-tl-none backdrop-blur-sm'
              : 'bg-white text-slate-800 border-slate-200 rounded-tl-none shadow-sm'
        }`}>
          {msg.isError ? (
            <div className="flex items-start gap-2 text-rose-400">
              <AlertCircle size={14} className="mt-0.5 flex-none" />
              <span>{msg.content}</span>
            </div>
          ) : (
            <div className="markdown-container">
              <ReactMarkdown remarkPlugins={remarkPlugins} components={MarkdownComponents}>
                {msg.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Copy on hover */}
        <button
          onClick={handleCopy}
          className={`absolute -bottom-2 ${isUser ? 'left-2' : 'right-2'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-md border ${
            isDark
              ? 'bg-white/10 text-white/40 hover:text-white border-white/10'
              : 'bg-white text-slate-400 hover:text-slate-900 border-slate-200'
          }`}
        >
          {copied ? <Check size={9} /> : <Copy size={9} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </motion.div>
  );
}

// ── Error Boundary ────────────────────────────────────────────────────────────
class AiPanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("AiPanel Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: '20px', background: '#000', zIndex: 9999, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 900 }}>AiPanel Crashed!</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, opacity: 0.7 }}>{this.state.error?.toString()}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', background: 'white', color: 'black', borderRadius: 8, fontSize: 10, fontWeight: 800 }}>RELOAD PAGE</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AiPanelWrapper(props) {
  return (
    <AiPanelErrorBoundary>
      <AiPanel {...props} />
    </AiPanelErrorBoundary>
  );
}

// ── Main AiPanel ──────────────────────────────────────────────────────────────
function AiPanel({
  isOpen,
  onClose,
  currentCode,
  language,
  onApplyRefactor,
  theme,
  isMobile,
  initialPrompt = null
}) {
  const [messages, setMessages] = useState([
    { role: "model", content: "SAM AI ready. Ask me anything about your code." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const isDark = theme === 'dark';
  // Stores the prompt value that was last auto-sent, rather than a boolean.
  // The old boolean guard was reset by a second effect on every render where
  // initialPrompt was truthy, which re-armed the auto-send immediately.
  const lastAutoPrompt = useRef(null);
  // Mirrors `messages` so sendMessage does not need it as a dependency. With
  // `messages` in the dep array its identity changed on every streaming chunk,
  // which re-fired the auto-send effect after every completed response —
  // re-sending the same prompt forever while the panel stayed open.
  const messagesRef = useRef(messages);
  const abortRef = useRef(null);
  const focusTimerRef = useRef(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Abort any in-flight stream and cancel the pending focus timer on unmount.
  // Closing the panel unmounts this component, and previously the reader kept
  // running and called setMessages/setLoading on an unmounted component.
  useEffect(() => () => {
    abortRef.current?.abort();
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
  }, []);

  const sendMessage = useCallback(async (prompt) => {
    if (!prompt?.trim() || loading) return;

    const userMsg = { role: "user", content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const placeholderId = Date.now();
    setMessages(prev => [...prev, { role: "model", content: "", _id: placeholderId }]);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const historyToSend = [...messagesRef.current, userMsg].slice(-10);

      const token = localStorage.getItem("token");
      const response = await fetch(`${ENDPOINTS.API_BASE_URL}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ code: currentCode, language, messages: historyToSend }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`AI Service error (${response.status}): ${errText.substring(0, 100)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      // `streamDone` replaces a bare `while (true)`: the [DONE] sentinel used to
      // break only the inner `for`, so the reader kept consuming after the
      // stream had logically ended.
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === "[DONE]") { streamDone = true; break; }
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
          }
        }
      }

      setMessages(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m._id === placeholderId);
        if (idx !== -1) next[idx] = { role: "model", content: accumulated || "✅ Done.", _id: undefined };
        return next;
      });

    } catch (err) {
      // An aborted stream is an intentional teardown, not a failure to report.
      if (err.name === "AbortError") return;
      setMessages(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m._id === placeholderId);
        const errMsg = {
          role: "model",
          content: `AI service is temporarily unavailable. Please try again.\n\n_Error: ${err.message}_`,
          isError: true
        };
        if (idx !== -1) next[idx] = errMsg;
        else next.push(errMsg);
        return next;
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading, currentCode, language]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    sendMessage(input);
  }, [input, sendMessage]);

  // Auto-send a prompt handed in from the editor ("Explain Error"), exactly
  // once per distinct prompt value. A *new* prompt re-arms it naturally
  // because the stored value differs; the same prompt never re-sends.
  useEffect(() => {
    if (!initialPrompt || !isOpen) return;
    if (lastAutoPrompt.current === initialPrompt) return;
    lastAutoPrompt.current = initialPrompt;
    sendMessage(initialPrompt);
  }, [initialPrompt, isOpen, sendMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const quickActions = [
    {
      icon: <BookOpen />,
      label: "Explain",
      prompt: `Explain this ${language} code step by step in simple terms. Break down what each part does and why.`
    },
    {
      icon: <Wrench />,
      label: "Fix",
      prompt: `Identify and fix all bugs, errors, and potential issues in this ${language} code. Provide the full corrected code block with brief explanations of the changes.`
    },
    {
      icon: <Zap />,
      label: "Optimize",
      prompt: `Optimize this ${language} code for maximum performance and production-grade quality. Explain the improvements.`
    },
  ];

  return (
    <div
      className={`sam-glass flex flex-1 flex-col h-full overflow-hidden ${isMobile ? 'rounded-none border-0' : 'rounded-2xl border'}`}
      style={{
        border: isMobile ? 'none' : '1px solid var(--sam-glass-border)',
        background: isDark ? 'var(--sam-surface)' : '#f8fafc'
      }}
    >
      {/* ── Header ── */}
      <div className={`flex h-11 shrink-0 items-center justify-between px-4 border-b ${
        isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-6 w-6 items-center justify-center rounded-lg shadow ${
            isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'
          }`}>
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span style={{
            fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '0.2em', fontFamily: 'var(--font-mono)',
            color: isDark ? 'var(--sam-text)' : '#0f172a'
          }}>
            SAM AI
          </span>
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="h-1.5 w-1.5 rounded-full bg-green-500"
            style={{ boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)' }}
          />
        </div>
        <button
          onClick={onClose}
          className={`rounded-lg p-1.5 transition-all ${
            isDark
              ? 'text-white/30 hover:text-white hover:bg-white/5'
              : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Chat Messages ── */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden ${isMobile ? 'p-3 space-y-4' : 'p-5 space-y-5'} custom-scrollbar min-w-0`}
        style={{ background: isDark ? 'transparent' : '#f1f5f9' }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg._id || i}
              msg={msg}
              isDark={isDark}
              onApplyRefactor={onApplyRefactor}
            />
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start"
          >
            <div className="mb-1.5 flex items-center gap-1.5 ml-1">
              <div className={`flex h-4 w-4 items-center justify-center rounded-md ${
                isDark ? 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'bg-slate-900 text-white'
              }`}>
                <Sparkles size={9} />
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                Sam AI
              </span>
            </div>
            <TypingIndicator isDark={isDark} />
          </motion.div>
        )}
      </div>

      {/* ── Quick Actions + Input ── */}
      <div className={`border-t p-3 space-y-3 ${
        isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white'
      }`}>
        <div className="flex flex-wrap gap-2">
          {quickActions.map(qa => (
            <QuickAction
              key={qa.label}
              icon={qa.icon}
              label={qa.label}
              onClick={() => sendMessage(qa.prompt)}
              isDark={isDark}
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
            className={`w-full resize-none rounded-xl border p-3 pr-12 text-sm transition-all focus:outline-none focus:ring-1 ${
              isDark
                ? 'border-white/10 bg-black/30 text-white placeholder:text-white/25 focus:border-white/30 focus:ring-white/10'
                : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-200'
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
              isDark
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-slate-900 text-white hover:bg-slate-700'
            }`}
          >
            {loading
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />
            }
          </button>
        </form>
      </div>
    </div>
  );
}
