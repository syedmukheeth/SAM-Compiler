import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import CodeEditor from "../components/CodeEditor";
import LanguageSelector from "../components/LanguageSelector";
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket } from "../services/socketClient";
import SettingsModal from "../components/SettingsModal";
import AuthModal from "../components/AuthModal";
import UpgradeModal from "../components/UpgradeModal";
import HistoryPanel from "../components/HistoryPanel";
import AiPanel from "../components/AiPanel";
import StatusBar from "../components/StatusBar";
import FeedbackModal from "../components/FeedbackModal";
import { useAuth } from "../hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";

import { Sparkles, Keyboard, Clock, Menu, X } from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from "framer-motion";
import ENDPOINTS from "../services/endpoints";
import OfficialLogo, { OFFICIAL_LOGO_WHITE, OFFICIAL_LOGO_BLACK } from "../components/OfficialLogo";
import analytics from "../services/analytics";

// Standalone components imported for clean scoping
import ThemeToggle from "../components/ThemeToggle";
import SamNavLogo from "../components/SamNavLogo";
import ShortcutItem from "../components/ShortcutItem";

const languageConfigs = {
  cpp: {
    name: "main.cpp",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg",
    template: "#include <iostream>\n\nint main() {\n    std::cout << \"Welcome to SAM Compiler!\" << std::endl;\n    return 0;\n}\n",
    lang: "cpp"
  },
  c: {
    name: "main.c",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg",
    template: "#include <stdio.h>\n\nint main() {\n    printf(\"Welcome to SAM Compiler!\\n\");\n    return 0;\n}\n",
    lang: "c"
  },
  python: {
    name: "main.py",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
    template: "print(\"Welcome to SAM Compiler!\")\n",
    lang: "python"
  },
  javascript: {
    name: "main.js",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
    template: "console.log(\"Welcome to SAM Compiler!\");\n",
    lang: "javascript"
  },
  java: {
    name: "Main.java",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
    template: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Welcome to SAM Compiler!\");\n    }\n}\n",
    lang: "java"
  }
};

export default function EditorPage() {
  // --- 1. Framework Hooks (High Priority) ---
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, loginUser, logoutUser } = useAuth();

  // --- 2. State Hooks ---
  const [activeLangId, setActiveLangId] = useState("cpp");
  const [buffers, setBuffers] = useState(
    Object.fromEntries(Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.template]))
  );
  const [runStatus, setRunStatus] = useState("Ready");
  const [metrics, setMetrics] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('sam-theme') || 'dark');
  const [busy, setBusy] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);
  const [socketIsConnected, setSocketIsConnected] = useState(true);
  const [activeMobileTab, setActiveMobileTab] = useState('editor');
  const [editorWidth, setEditorWidth] = useState(() => Number(localStorage.getItem('sam-editor-width')) || 50);
  const [terminalWidth, setTerminalWidth] = useState(() => Number(localStorage.getItem('sam-terminal-width')) || 33.33);
  const [aiWidth, setAiWidth] = useState(() => Number(localStorage.getItem('sam-ai-width-pct')) || 33.33);
  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const [isResizingAi, setIsResizingAi] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [pyodide, setPyodide] = useState(null);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const [settings, setSettings] = useState(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem("sam_settings") : null;
      return saved ? JSON.parse(saved) : { fontSize: 14, tabSize: 2 };
    } catch (e) { return { fontSize: 14, tabSize: 2 }; }
  });

  const onSettingsUpdate = useCallback((newSettings) => {
    setSettings(newSettings);
    localStorage.setItem("sam_settings", JSON.stringify(newSettings));
  }, []);

  // --- 3. Ref Hooks ---
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const runRef = useRef({ jobId: null });
  const isMounted = useRef(true);

  // --- 4. Logic & Memoization ---

  // --- Helpers & Logic ---

  const sessionId = useMemo(() => {
    const s = searchParams.get("session");
    const raw = (s && s !== "default") ? s : "default";
    return `${raw}_${activeLangId}`;
  }, [searchParams, activeLangId]);

  const onCodeChange = useCallback((value) => {
    setBuffers((b) => ({ ...b, [activeLangId]: value ?? "" }));
  }, [activeLangId]);

  const handleLoadFromHistory = useCallback((runtime, code) => {
    const langMap = { javascript: 'javascript', nodejs: 'javascript', python: 'python', cpp: 'cpp', c: 'c', java: 'java' };
    const langId = langMap[runtime] || 'cpp';
    setActiveLangId(langId);
    window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template: code } }));
    setBuffers(prev => ({ ...prev, [langId]: code }));
    toast.success('Code loaded from history', {
      icon: '📦',
      style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '11px', fontWeight: 700 }
    });
  }, []);

  const runPythonInBrowser = useCallback(async (code) => {
    if (!pyodide) throw new Error("Python engine is still booting...");
    pyodide.setStdout({ batched: (str) => { xtermRef.current.write(str); } });
    pyodide.setStderr({ batched: (str) => { xtermRef.current.write(str); } });
    try {
      await pyodide.runPythonAsync(`
import builtins
from js import window
def input_shim(prompt=""):
    return window.prompt(prompt) or ""
builtins.input = input_shim
      `);
      await pyodide.runPythonAsync(code);
      setRunStatus("Succeeded");
    } catch (err) {
      xtermRef.current.write(err.message + "\r\n");
      setRunStatus("Failed");
    }
  }, [pyodide]);

  const onRun = useCallback(async () => {
    const activeConfig = languageConfigs[activeLangId];
    const code = buffers[activeLangId] ?? "";
    const language = activeConfig.lang;
    if (busy) return;
    setBusy(true);
    analytics.trackCodeRun(activeLangId, null); // Track execution attempt
    const socket = getSocket();
    if (runRef.current.jobId && socket) {
      socket.emit("unsubscribe", { jobId: runRef.current.jobId });
      socket.off("exec:log");
    }
    if (xtermRef.current) {
      xtermRef.current.reset();
      xtermRef.current.write("\x1b[2J\x1b[0;0H");
    }
    setRunStatus("Running");
    setMetrics(null);

    // Ensure socket is alive for real-time logs before submission
    if (!socket.connected && activeLangId !== "python") {
      try {
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            socket.off("connect", onConnect);
            resolve(); // Proceed anyway, polling will catch the final state
          }, 2000);
          const onConnect = () => {
             clearTimeout(timeout);
             resolve();
          };
          socket.once("connect", onConnect);
          socket.connect();
        });
      } catch (err) {
        console.warn("Socket connection failed, proceeding with polling only.");
      }
    }

    if (activeLangId === "python") {
      try {
        await runPythonInBrowser(code);
        setBusy(false);
        return;
      } catch (err) {
        xtermRef.current.write("\x1b[1;31m" + err.message + "\x1b[0m\r\n");
        setRunStatus("Failed");
        setBusy(false);
        return;
      }
    }
    try {
      const { jobId } = await submitRun({ language, code });
      runRef.current.jobId = jobId;
      const sendSubscription = () => socket.emit("subscribe", { jobId });
      if (!socket.connected) {
        socket.once("connect", sendSubscription);
        socket.connect();
      } else {
        sendSubscription();
      }
      const onLog = (evt) => {
        if (!evt || runRef.current.jobId !== jobId) return;
        if (xtermRef.current) {
           if (evt.type === "stdout") xtermRef.current.write(evt.chunk);
           else if (evt.type === "stderr") xtermRef.current.write(`\x1b[31m${evt.chunk}\x1b[0m`);
        }
        if (evt.type === "end") {
          const success = evt.status === "succeeded";
          setRunStatus(success ? "Succeeded" : "Failed");
          analytics.trackCodeRun(activeLangId, success); // Track completion status
          if (evt.chunk?.metrics) setMetrics(evt.chunk.metrics);
          setBusy(false);
        }
      };
      socket.on("exec:log", onLog);
      await pollUntilDone(jobId, {
        onUpdate: (s) => {
          if (runRef.current.jobId !== jobId) return;
          setRunStatus(s.status.charAt(0).toUpperCase() + s.status.slice(1));
        }
      });
      socket.off("exec:log", onLog);
      socket.emit("unsubscribe", { jobId });
    } catch (e) {
      setRunStatus("Failed");
      // Senior Dev: Sanitize error output to prevent HTML dumping in terminal
      const rawMsg = e?.message || String(e);
      const isHtml = /<[a-z][\s\S]*>/i.test(rawMsg);
      const cleanMsg = isHtml 
        ? "Server returned an invalid response (HTML). The engine might be under maintenance." 
        : rawMsg.substring(0, 200);
        
      if (xtermRef.current) xtermRef.current.write(`\x1b[1;31mError: ${cleanMsg}\x1b[0m\r\n`);
    } finally {
      setBusy(false);
    }
  }, [activeLangId, buffers, busy, runPythonInBrowser]);

  const onClear = () => {
    if (xtermRef.current) xtermRef.current.clear();
    setRunStatus("Ready");
  };

  const handleCodeReset = useCallback(() => {
    const template = languageConfigs[activeLangId]?.template || "";
    if (window.confirm(`[SYSTEM OVERRIDE]\n\nAre you sure you want to sanitize the ${activeLangId.toUpperCase()} workspace?\nAll unsaved changes will be permanently purged to restore factory templates.`)) {
      window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template } }));
      setBuffers(prev => ({ ...prev, [activeLangId]: template }));
    }
  }, [activeLangId]);

  const startResizingEditor = useCallback(() => {
    setIsResizingEditor(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizingEditor = useCallback(() => {
    setIsResizingEditor(false);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const onResizeEditor = useCallback((e) => {
    if (!isResizingEditor || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const pct = (x / containerRect.width) * 100;
    
    // Safety boundaries
    if (pct > 15 && pct < (showAiPanel ? 100 - aiWidth - 15 : 85)) {
      setEditorWidth(pct);
      localStorage.setItem('sam-editor-width', pct.toString());
    }
  }, [isResizingEditor, showAiPanel, aiWidth]);

  const startResizingAi = useCallback((e) => {
    e.preventDefault();
    setIsResizingAi(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizingAi = useCallback(() => {
    setIsResizingAi(false);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const onResizeAi = useCallback((e) => {
    if (!isResizingAi || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const pct = 100 - ((x / containerRect.width) * 100);
    
    if (pct > 15 && pct < 100 - editorWidth - 15) {
      setAiWidth(pct);
      localStorage.setItem('sam-ai-width-pct', pct.toString());
    }
  }, [isResizingAi, editorWidth]);

  useEffect(() => {
    if (isResizingEditor) {
      window.addEventListener('mousemove', onResizeEditor);
      window.addEventListener('mouseup', stopResizingEditor);
    }
    if (isResizingAi) {
      window.addEventListener('mousemove', onResizeAi);
      window.addEventListener('mouseup', stopResizingAi);
    }
    return () => {
      window.removeEventListener('mousemove', onResizeEditor);
      window.removeEventListener('mouseup', stopResizingEditor);
      window.removeEventListener('mousemove', onResizeAi);
      window.removeEventListener('mouseup', stopResizingAi);
    };
  }, [isResizingEditor, isResizingAi, onResizeEditor, onResizeAi, stopResizingEditor, stopResizingAi]);

  // --- Effects & Lifecycle ---

  // Initial session & token probe
  useEffect(() => {
    const sessionParam = searchParams.get("session");
    const tokenParam = searchParams.get("token");
    if (tokenParam) console.log("[SAM-AUTH] Token found in URL");

    if (!sessionParam || sessionParam === "default") {
      const fresh = Math.random().toString(36).substring(2, 9);
      const newParams = { session: fresh };
      if (tokenParam) newParams.token = tokenParam;
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Health check & worker status
  useEffect(() => {
    const checkStatus = async () => {
      if (!navigator.onLine) { setIsWorkerOnline(false); return; }
      try {
        const res = await fetch(`${ENDPOINTS.API_BASE_URL}/runs/health/queue`);
        const data = await res.json();
        setIsWorkerOnline(data.workerOnline);
      } catch (err) {
        setIsWorkerOnline(false);
      }
    };
    checkStatus();
    const timer = setInterval(checkStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  // Theme synchronization
  useEffect(() => {
    if (theme === "light") document.documentElement.classList.add("light");
    else document.documentElement.classList.remove("light");
    localStorage.setItem("sam-theme", theme);
  }, [theme]);

  // Responsive logic
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lifecycle safety
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Socket status monitoring
  useEffect(() => {
    // Initial connection trigger
    getSocket();
    
    let statusTimeout;
    const handleStatus = (e) => {
      if (e.detail.connected) {
        if (statusTimeout) clearTimeout(statusTimeout);
        setSocketIsConnected(true);
      } else {
        // Debounce disconnect notification to prevent "reconnecting" flickers during momentary drops
        if (statusTimeout) clearTimeout(statusTimeout);
        statusTimeout = setTimeout(() => {
          setSocketIsConnected(false);
        }, 2000);
      }
    };
    window.addEventListener("sam:socket:status", handleStatus);
    return () => {
      if (statusTimeout) clearTimeout(statusTimeout);
      window.removeEventListener("sam:socket:status", handleStatus);
    };
  }, []);

  // Resubscribe Guardian: Pick up lost streams after reconnection
  useEffect(() => {
    if (socketIsConnected && busy && runRef.current.jobId) {
      const socket = getSocket();
      console.log(`🛡️ [SAM] Connection recovered. Resubscribing to active job: ${runRef.current.jobId}`);
      socket.emit("subscribe", { jobId: runRef.current.jobId });
    }
  }, [socketIsConnected, busy]);

  // Pyodide (Python-in-browser) engine
  useEffect(() => {
    if (!window.loadPyodide && !isPyodideLoading && !pyodide) {
      setIsPyodideLoading(true);
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      script.onload = async () => {
        try {
          const py = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
          setPyodide(py);
          setIsPyodideLoading(false);
        } catch (err) {
          console.error("Pyodide failed:", err);
          setIsPyodideLoading(false);
        }
      };
      document.body.appendChild(script);
    }
  }, [isPyodideLoading, pyodide]);

  // High-fidelity branding & Title sync
  useEffect(() => {
    document.title = "SAM Compiler | Syntax Analysis Machine";
    const fav = document.getElementById("favicon");
    if (fav) {
      fav.setAttribute("href", theme === 'light' ? OFFICIAL_LOGO_BLACK : OFFICIAL_LOGO_WHITE);
    }
  }, [theme]);

  // Terminal (XTerm.js) initialization
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;
    const isDark = theme === "dark";
    const term = new XTerm({
      theme: {
        background: isDark ? '#000000' : '#F1F5F9',
        foreground: isDark ? '#FFFFFF' : '#0F172A',
        cursor: isDark ? '#FFFFFF' : '#0F172A',
        selectionBackground: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(15, 23, 42, 0.15)',
        black: isDark ? '#1A1A1A' : '#000000',
        red: isDark ? '#FF3B3B' : '#DC2626',
        green: isDark ? '#10B981' : '#059669',
        white: isDark ? '#FFFFFF' : '#0F172A',
      },
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: true,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      if (runRef.current.jobId) getSocket().emit("exec:input", { jobId: runRef.current.jobId, input: data });
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, [theme]);

  // Consolidate layout fit on change
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      if (fitAddonRef.current) fitAddonRef.current.fit();
    }, 100);
    return () => clearTimeout(timer);
  }, [editorWidth, aiWidth, showAiPanel]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onRun(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "l") { e.preventDefault(); onClear(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setShowAiPanel(prev => !prev); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRun]);

  // Settings management moved to top to satisfy hook ordering rules



  return (
    <div className="relative flex h-screen h-[100dvh] w-full flex-col overflow-hidden selection:bg-white/10" style={{ background: 'var(--sam-bg)' }}>
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      <header className="relative z-[80] flex h-14 md:h-16 shrink-0 items-center justify-between px-4 md:px-8 border-b-0 sam-glass" style={{ borderBottom: '1px solid var(--sam-glass-border)', background: 'var(--sam-glass-bg)', backdropFilter: 'blur(30px)' }}>
        {/* Connection Resilience Banner */}
        {/* Connection banner removed as per user request - StatusBar handles status now */}

        <div className="flex items-center gap-2 md:gap-14 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 transition-all hover:scale-105">
              <div className="scale-75 sm:scale-100 origin-left">
                <SamNavLogo theme={theme} />
              </div>
              <div className="flex flex-col leading-[0.9] mt-1 relative scale-[0.65] sm:scale-100 origin-left -ml-1 sm:ml-0">
                <span className="font-black tracking-tight text-[18px] uppercase italic" style={{ fontFamily: 'var(--font-display)', color: 'var(--sam-text)' }}>SAM</span>
                <span className="text-[10px] font-black uppercase tracking-[0.35em] opacity-40 ml-0.5" style={{ color: 'var(--sam-text)' }}>Compiler</span>
              </div>
            </div>
          </div>
          
          <nav className="hidden xl:flex items-center gap-8">
            {['Editor', 'Dashboard', 'Settings'].map((tab) => {
              if (tab === 'Dashboard') {
                if (user?.role !== 'admin') return null;
                return (
                  <Link
                    key={tab}
                    to="/dashboard"
                    className="group relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all"
                    style={{ color: 'var(--sam-text-dim)' }}
                  >
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--sam-accent)' }} />
                    Dashboard
                  </Link>
                );
              }
              const isActive = (!activeModal && tab === 'Editor') || activeModal === tab.toLowerCase();
              return (
                <button
                  key={tab}
                  onClick={() => setActiveModal(tab === 'Editor' ? null : tab.toLowerCase())}
                  style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                    color: isActive ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    transition: 'color 0.2s', position: 'relative',
                    padding: '8px 0',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {tab}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ background: 'var(--sam-accent)' }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 md:gap-5 shrink-0">
          <div className="scale-75 sm:scale-100 origin-right">
            <ThemeToggle theme={theme} toggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />
          </div>
          
          <div className="hidden sm:flex items-center gap-2 md:gap-3">
            {user ? (
               <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '2px 4px 2px 8px',
                borderRadius: 20,
                border: '1px solid var(--sam-glass-border)',
                background: 'var(--sam-accent-muted)',
              }}>
                <span 
                  className="hidden lg:block text-[11px] font-semibold max-w-[100px] truncate"
                  style={{ color: 'var(--sam-text)' }}
                >
                  {user.name}
                </span>
                <img
                  src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=000000&color=FFFFFF`}
                  alt="Avatar"
                  style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
                />
              </div>
            ) : (
              <button
                id="signin-btn"
                onClick={() => setActiveModal('auth')}
                className="sam-button-primary h-8 px-4 text-[9px] font-black uppercase tracking-wider rounded-md"
              >Sign In</button>
            )}
          </div>

          <div className="flex items-center gap-1.5 md:gap-3">
            <button 
              onClick={() => {
                const next = !showAiPanel;
                setShowAiPanel(next);
                if (!isMobile) {
                  if (next) {
                    setEditorWidth(33.33);
                    setAiWidth(33.33);
                  } else {
                    setEditorWidth(50);
                    setAiWidth(33.33); // Normal defaults
                  }
                }
              }}
              className="flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-auto md:px-4 items-center justify-center gap-2 rounded-xl border transition-all duration-300 shrink-0"
              style={{ 
                background: showAiPanel ? 'var(--sam-accent-muted)' : 'var(--sam-surface-low)',
                borderColor: showAiPanel ? 'var(--sam-accent)' : 'var(--sam-glass-border)',
                color: showAiPanel ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
              }}
            >
              <Sparkles className={`h-4 w-4 ${showAiPanel ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">SAM AI</span>
            </button>

            {/* Desktop-only secondary actions */}
            <div className="hidden lg:flex items-center gap-2">
              <button 
                onClick={() => setShowShortcutsHelp(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sam-glass-border)] bg-[var(--sam-surface-low)] text-[var(--sam-text-dim)] transition-all hover:text-white"
              >
                <Keyboard className="h-5 w-5" />
              </button>
              <button 
                onClick={() => { if (!token) { setActiveModal('auth'); return; } setShowHistory(!showHistory); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sam-glass-border)] bg-[var(--sam-surface-low)] text-[var(--sam-text-dim)] transition-all hover:text-white"
              >
                <Clock className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-[var(--sam-glass-border)] bg-[var(--sam-surface-low)] text-[var(--sam-text-dim)]"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute left-0 right-0 top-full mt-2 mx-4 p-4 sam-glass dark:bg-black/95 bg-white/95 border-white/5 shadow-2xl z-[90] lg:hidden overflow-hidden"
              style={{ borderRadius: 20 }}
            >
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => { setShowShortcutsHelp(true); setMobileMenuOpen(false); }}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors gap-2"
                  >
                    <Keyboard className="h-5 w-5 text-white/60" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Shortcuts</span>
                  </button>
                  <button 
                    onClick={() => { if (!token) { setActiveModal('auth'); } else { setShowHistory(true); } setMobileMenuOpen(false); }}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors gap-2"
                  >
                    <Clock className="h-5 w-5 text-white/60" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">History</span>
                  </button>
                </div>
                
                <div className="h-[1px] bg-white/5 w-full" />

                <div className="flex flex-col gap-1">
                   {['Editor', 'Dashboard', 'Settings'].map((tab) => {
                      if (tab === 'Dashboard' && user?.role !== 'admin') return null;
                      const isActive = (!activeModal && tab === 'Editor') || activeModal === tab.toLowerCase();
                      return (
                        <button
                          key={tab}
                          onClick={() => { setActiveModal(tab === 'Editor' ? null : tab.toLowerCase()); setMobileMenuOpen(false); }}
                          className={`flex items-center justify-between p-3 rounded-xl transition-all ${isActive ? 'bg-white/10 text-white' : 'text-white/40'}`}
                        >
                          <span className="text-xs font-bold uppercase tracking-[0.2em]">{tab}</span>
                          {isActive && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </button>
                      );
                   })}
                </div>

                {!user && (
                   <button 
                    onClick={() => { setActiveModal('auth'); setMobileMenuOpen(false); }}
                    className="w-full sam-button-primary p-4 rounded-xl text-xs font-black uppercase tracking-widest"
                  >
                    Sign In to SAM
                  </button>
                )}

                {user && (
                  <div className="mt-2 flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <img src={user.avatar} className="h-8 w-8 rounded-full border border-white/10" />
                      <span className="text-xs font-bold" style={{ color: 'var(--sam-text)' }}>{user.name}</span>
                    </div>
                    <button onClick={logoutUser} className="text-[9px] font-black uppercase tracking-widest text-rose-500 px-3 py-1.5 rounded-lg bg-rose-500/10">Sign Out</button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="flex xl:hidden h-12 shrink-0 bg-[var(--sam-surface-low)] border-b border-[var(--sam-glass-border)] z-[70] shadow-lg sticky top-0">
        <button
          onClick={() => { setActiveMobileTab('editor'); setShowAiPanel(false); }}
          className="relative flex-1 flex flex-col items-center justify-center gap-1.5 transition-all"
          style={{
            color: activeMobileTab === 'editor' && !showAiPanel ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Code</span>
          {activeMobileTab === 'editor' && !showAiPanel && <motion.div layoutId="mobileTabIdx" className="absolute bottom-0 left-4 right-4 h-0.5 bg-[var(--sam-accent)] rounded-full" />}
        </button>
        
        <button
          onClick={() => { setActiveMobileTab('terminal'); setShowAiPanel(false); }}
          className="relative flex-1 flex flex-col items-center justify-center gap-1.5 transition-all"
          style={{
            color: activeMobileTab === 'terminal' && !showAiPanel ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
          }}
        >
          <div className="relative">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
            {busy && <div className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-[var(--sam-accent)] animate-pulse" />}
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Output</span>
          {activeMobileTab === 'terminal' && !showAiPanel && <motion.div layoutId="mobileTabIdx" className="absolute bottom-0 left-4 right-4 h-0.5 bg-[var(--sam-accent)] rounded-full" />}
        </button>

        <button
          onClick={() => { setActiveMobileTab('ai'); setShowAiPanel(true); }}
          className="relative flex-1 flex flex-col items-center justify-center gap-1.5 transition-all"
          style={{
            color: activeMobileTab === 'ai' || showAiPanel ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
          }}
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-[10px] font-black uppercase tracking-widest">SAM AI</span>
          {(activeMobileTab === 'ai' || (isMobile && showAiPanel)) && <motion.div layoutId="mobileTabIdx" className="absolute bottom-0 left-4 right-4 h-0.5 bg-[var(--sam-accent)] rounded-full" />}
        </button>
      </div>

      <div 
        ref={containerRef}
        className="flex flex-1 overflow-hidden transition-all duration-200 ease-out"
      >
        <main className="relative z-10 flex flex-1 flex-col md:flex-row overflow-hidden p-0 pb-14 md:p-6 gap-0 transition-all duration-200 ease-out">
          {/* EDITOR SECTION */}
          <section 
            className={`flex flex-col overflow-hidden ${(!isMobile || (activeMobileTab === 'editor' && !showAiPanel)) ? 'flex-1' : 'hidden'} md:flex`}
            style={isMobile ? { width: '100%', flex: '1 1 100%' } : { width: `${editorWidth}%`, flex: `0 0 ${editorWidth}%` }}
          >
            <div className="sam-glass flex flex-1 flex-col overflow-hidden" style={{ borderRadius: 16, border: '1px solid var(--sam-glass-border)' }}>
              <div className="flex h-11 shrink-0 items-center justify-between px-3 md:px-5" style={{ background: 'var(--sam-surface-low)', borderBottom: '1px solid var(--sam-glass-border)' }}>
                <div className="flex items-center gap-2 md:gap-4">
                  <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} />
                  
                  {/* Reset Safety Valve */}
                  <button
                    onClick={handleCodeReset}
                    title="Reset To Boilerplate"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--sam-text-dim)', transition: 'color 0.2s',
                      padding: 4, display: 'flex', alignItems: 'center'
                    }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--sam-accent)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--sam-text-dim)'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>

                  <div style={{ width: 1, height: 16, background: 'var(--sam-glass-border)' }} className="hidden md:block" />
                  <span className="hidden md:inline font-mono tracking-wider opacity-40" style={{ fontSize: 11, fontWeight: 500, color: 'var(--sam-text)' }}>
                    {languageConfigs[activeLangId]?.name}
                  </span>
                </div>
                <button
                  id="editor-run-btn"
                  onClick={onRun}
                  disabled={busy}
                  className="sam-button-primary"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 24px', borderRadius: 8,
                    background: busy ? 'var(--sam-accent-dim)' : 'var(--sam-accent)',
                    color: '#FFFFFF',
                    fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.8 : 1,
                    transition: 'all 0.2s',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {busy ? (
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--sam-accent)', animation: 'spin 0.8s linear infinite' }} />
                  ) : (
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
                  )}
                  Run
                </button>
              </div>
              
              <div className="flex-1 overflow-hidden relative">
                <CodeEditor
                   key={`${sessionId}-${activeLangId}`}
                   language={activeLangId}
                   value={buffers[activeLangId]}
                   onChange={onCodeChange}
                   sessionId={sessionId}
                   userName={user?.name}
                   theme={theme}
                   options={{
                     fontSize: settings.fontSize,
                     tabSize: settings.tabSize,
                   }}
                />
              </div>
            </div>
          </section>

          {/* SPLITTER 1 (Editor | Terminal) */}
          <div 
             onMouseDown={startResizingEditor}
             className="hidden md:flex group relative w-1.5 h-full cursor-col-resize items-center justify-center transition-all hover:bg-white/5 z-30"
          >
            <div className={`h-24 w-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-black/5'} group-hover:bg-white/30 transition-all`} />
          </div>

          {/* TERMINAL SECTION */}
          <section 
            className={`flex flex-col overflow-hidden ${(!isMobile || (activeMobileTab === 'terminal' && !showAiPanel)) ? 'flex-1' : 'hidden'} md:flex`}
            style={isMobile ? { width: '100%', flex: '1 1 100%' } : { width: `${showAiPanel ? 100 - editorWidth - aiWidth : 100 - editorWidth}%`, flex: `1 1 auto` }}
          >
            <div className="sam-glass flex flex-1 flex-col overflow-hidden" style={{ borderRadius: 16, background: 'var(--sam-surface)', border: '1px solid var(--sam-glass-border)' }}>
              <div className="flex h-11 shrink-0 items-center justify-between px-4 md:px-6" style={{ background: 'var(--sam-surface-low)', borderBottom: '1px solid var(--sam-glass-border)' }}>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={onClear}
                    title="Clear Output"
                    style={{ padding: '5px', background: 'none', border: 'none', color: 'rgba(221,226,241,0.25)', cursor: 'pointer', borderRadius: 6, transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sam-text)'; e.currentTarget.style.background = 'var(--sam-glass-border)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sam-text-dim)'; e.currentTarget.style.background = 'none'; }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <div className={runStatus === 'Failed' ? 'sam-pulse-glow-red' : ''} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: runStatus === 'Succeeded' ? '#10B981' : runStatus === 'Failed' ? '#FF3B3B' : busy ? 'var(--sam-accent)' : 'var(--sam-glass-border)',
                    boxShadow: runStatus === 'Succeeded' ? '0 0 10px rgba(16,185,129,0.4)' : runStatus === 'Failed' ? '0 0 20px rgba(255,59,59,0.8)' : busy ? '0 0 10px var(--sam-accent)' : 'none',
                    animation: busy ? 'sam-pulse 1s infinite' : 'none',
                    transition: 'all 0.5s',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>
                    CLOUD OUTPUT
                  </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.25em', color: runStatus === 'Failed' ? '#FF3B3B' : 'var(--sam-text-muted)', fontFamily: 'var(--font-body)' }}>{runStatus}</div>
              </div>
              
              <div className={`flex-1 overflow-hidden relative ${theme === 'light' ? 'bg-[#F1F5F9]' : 'bg-[#000000]'}`}>
                <div ref={terminalRef} className="h-full w-full overflow-hidden" 
                   style={{ padding: '10px' }} 
                />
              </div>
  
              <div className="flex h-8 md:h-10 shrink-0 items-center justify-between px-4 md:px-6" style={{ borderTop: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface-low)' }}>
                <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', opacity: 0.8, fontFamily: 'var(--font-body)' }}>SAM-RUNTIME</span>
                <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>{languageConfigs[activeLangId]?.name}</span>
              </div>
            </div>
          </section>

          {/* SPLITTER 2 (Terminal | SAM AI) */}
          {showAiPanel && !isMobile && (
            <div 
               onMouseDown={startResizingAi}
               className="flex group relative w-1.5 h-full cursor-col-resize items-center justify-center transition-all hover:bg-white/5 z-30"
            >
              <div className={`h-24 w-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-black/5'} group-hover:bg-white/30 transition-all`} />
            </div>
          )}

          {/* SAM AI PANEL - Now Integrated */}
          {showAiPanel && (
            <AiPanel 
              isOpen={showAiPanel}
              onClose={() => setShowAiPanel(false)}
              currentCode={buffers[activeLangId]}
              language={activeLangId}
              metrics={metrics}
              onApplyRefactor={(refactoredCode) => {
                setBuffers(prev => ({ ...prev, [activeLangId]: refactoredCode }));
                window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template: refactoredCode } }));
              }}
              theme={theme}
              width={aiWidth}
              isMobile={isMobile}
              activeMobileTab={activeMobileTab}
            />
          )}
        </main>
      </div>


      <footer className="fixed bottom-0 left-0 right-0 z-40">
        <StatusBar 
          language={activeLangId.toUpperCase()}
          position={`Ln ${metrics?.lastLine || 1}, Col ${metrics?.lastCol || 1}`}
          status={busy ? "EXECUTING..." : "CONNECTED"}
          isOnline={socketIsConnected}
          onReportBug={() => setIsFeedbackModalOpen(true)}
          theme={theme}
          busy={busy}
        />
      </footer>

      <FeedbackModal 
        isOpen={isFeedbackModalOpen} 
        onClose={() => setIsFeedbackModalOpen(false)} 
        theme={theme}
      />



      <AnimatePresence>
        {showShortcutsHelp && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowShortcutsHelp(false)}
               className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={`relative w-full max-w-sm rounded-[32px] border p-8 shadow-2xl backdrop-blur-2xl ${
                theme === 'dark' ? 'border-white/5 bg-black/95' : 'border-slate-200 bg-white/95'
              }`}
            >
              <h3 className={`mb-8 flex items-center gap-3 text-sm font-black uppercase tracking-[0.25em] opacity-90 ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}>
                 <Keyboard className={`h-5 w-5 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`} strokeWidth={3} />
                 Terminal Shortcuts
              </h3>
              <div className="flex flex-col gap-5">
                 <ShortcutItem keys={["CTRL", "ENTER"]} label="Run Code" theme={theme} />
                 <ShortcutItem keys={["CTRL", "S"]} label="Save Locally" theme={theme} />
                 <ShortcutItem keys={["CTRL", "L"]} label="Clear Output" theme={theme} />
                 <ShortcutItem keys={["CTRL", "/"]} label="Toggle Sam AI" theme={theme} />

              </div>
              <button 
                onClick={() => setShowShortcutsHelp(false)}
                className={`mt-10 w-full rounded-2xl p-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 ${
                  theme === 'dark' ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                }`}
              >
                Close Guidelines
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AuthModal isOpen={activeModal === 'auth'} onClose={() => setActiveModal(null)} onLogin={loginUser} theme={theme} />
      <SettingsModal 
        isOpen={activeModal === 'settings'} 
        onClose={() => setActiveModal(null)} 
        settings={settings} 
        onSettingsChange={onSettingsUpdate}
        user={user}
        onLogout={() => {
          if (window.confirm("Sign out of SAM Compiler?")) {
            logoutUser();
            setActiveModal(null);
          }
        }}
      />
      <UpgradeModal isOpen={activeModal === 'upgrade'} onClose={() => setActiveModal(null)} />
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        theme={theme}
        token={token}
        onLoadCode={handleLoadFromHistory}
      />
      
      <Toaster position="bottom-right" reverseOrder={false} />
    </div>
  );
}
