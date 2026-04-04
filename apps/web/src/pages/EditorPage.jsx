import React, { useRef, useState, useEffect } from "react";
import CodeEditor from "../components/CodeEditor";
import LanguageSelector from "../components/LanguageSelector";
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket } from "../services/socketClient";
import AuthModal from "../components/AuthModal";
import SettingsModal from "../components/SettingsModal";
import UpgradeModal from "../components/UpgradeModal";
import AiPanel from "../components/AiPanel";
import HistoryModal from "../components/HistoryModal";
import { useAuth } from "../hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles, History, Keyboard, Info } from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from "framer-motion";
import ENDPOINTS from "../services/endpoints";

// Inline SAM logo SVG — no image file dependency
function SamNavLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform hover:scale-110">
      {/* Eye Outer Brackets */}
      <path d="M12 18L4 24L12 30" stroke="var(--sam-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 18L44 24L36 30" stroke="var(--sam-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Central Bolt (S/7 Shape) */}
      <path d="M28 14L20 24H28L20 34" stroke="var(--sam-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Circuit Accents Top */}
      <path d="M18 12L20 8" stroke="var(--sam-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="21" cy="7" r="1.5" fill="var(--sam-accent)" />
      
      <path d="M28 12L30 8" stroke="var(--sam-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="31" cy="7" r="1.5" fill="var(--sam-accent)" />
      
      {/* Circuit Accents Sides */}
      <path d="M10 24H6" stroke="var(--sam-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5" cy="24" r="1.5" fill="var(--sam-accent)" />
      
      <path d="M38 24H42" stroke="var(--sam-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="43" cy="24" r="1.5" fill="var(--sam-accent)" />

      {/* Circuit Accents Bottom */}
      <path d="M18 36L20 40" stroke="var(--sam-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="21" cy="41" r="1.5" fill="var(--sam-accent)" />
      
      <path d="M28 36L30 40" stroke="var(--sam-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="31" cy="41" r="1.5" fill="var(--sam-accent)" />
    </svg>
  );
}

const languageConfigs = {
  cpp: {
    name: "main.cpp",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg",
    template: "#include <iostream>\n\nint main() {\n    std::cout << \"Welcome to SAM Compiler!\" << std::endl;\n    return 0;\n}",
    lang: "cpp"
  },
  c: {
    name: "main.c",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg",
    template: "#include <stdio.h>\n\nint main() {\n    printf(\"Welcome to SAM Compiler!\\n\");\n    return 0;\n}",
    lang: "c"
  },
  python: {
    name: "main.py",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
    template: "print(\"Welcome to SAM Compiler!\")",
    lang: "python"
  },
  javascript: {
    name: "main.js",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
    template: "console.log(\"Welcome to SAM Compiler!\");",
    lang: "javascript"
  },
  java: {
    name: "Main.java",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
    template: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Welcome to SAM Compiler!\");\n    }\n}",
    lang: "java"
  }
};

function ThemeToggle({ theme, toggle }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggle}
      className="p-2 rounded-xl bg-sam-surface-high border border-sam-glass-border hover:border-sam-text-dim transition-all duration-300 group"
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
    >
      <div className="relative w-6 h-6 overflow-hidden">
        <AnimatePresence mode="wait">
          {theme === "dark" ? (
            <motion.div
              key="moon"
              initial={{ y: 20, opacity: 0, rotate: 45 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -20, opacity: 0, rotate: -45 }}
              transition={{ duration: 0.4, ease: "backOut" }}
              className="absolute inset-0 flex items-center justify-center text-sam-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ y: 20, opacity: 0, scale: 0.5 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.4, ease: "backOut" }}
              className="absolute inset-0 flex items-center justify-center text-sam-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}

export default function EditorPage() {
  const [activeLangId, setActiveLangId] = useState("cpp");
  const [buffers, setBuffers] = useState(
    Object.fromEntries(Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.template]))
  );
  const [runStatus, setRunStatus] = useState("Ready");
  const [metrics, setMetrics] = useState(null);
  
  const [searchParams] = useSearchParams();
  const rawSessionId = searchParams.get("session") || "default";
  
  // FIX: Isolate sessions by language to prevent cross-language code duplication
  const sessionId = `${rawSessionId}_${activeLangId}`;

  const [theme, setTheme] = useState(localStorage.getItem("sam_theme") || "dark");
  
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Pre-connect socket for performance
  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }
  }, []);
  const [busy, setBusy] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);
  const [isApiOnline, setIsApiOnline] = useState(true);
  
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [activeMobileTab, setActiveMobileTab] = useState("editor"); // "editor" or "terminal"
  
  const { user, loginUser, logoutUser } = useAuth();


  // Poll worker status & Sync theme
  useEffect(() => {
    const checkStatus = async () => {
      if (!navigator.onLine) {
        setIsApiOnline(false);
        setIsWorkerOnline(false);
        return;
      }
      try {
        const res = await fetch(`${ENDPOINTS.API_BASE_URL}/api/runs/health/queue`);
        if (res.ok) {
          const data = await res.json();
          setIsApiOnline(true);
          setIsWorkerOnline(data.workerOnline);
        } else {
          setIsApiOnline(false);
          setIsWorkerOnline(false);
        }
      } catch (err) {
        setIsApiOnline(false);
        setIsWorkerOnline(false);
      }
    };
    checkStatus();

    // Sync theme class to root
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("sam_theme", theme);
    
    const timer = setInterval(checkStatus, 15000);
    return () => clearInterval(timer);
  }, [theme]);



  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("sam_settings") || localStorage.getItem("liquid_settings");
      if (!saved) return { fontSize: 14, tabSize: 2 };
      const parsed = JSON.parse(saved);
      return (parsed && typeof parsed === 'object') ? parsed : { fontSize: 14, tabSize: 2 };
    } catch (e) {
      return { fontSize: 14, tabSize: 2 };
    }
  });
  
  const onSettingsUpdate = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem("sam_settings", JSON.stringify(newSettings));
  };
  
  const [pyodide, setPyodide] = useState(null);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);

  // Pre-load Pyodide for instant Python execution
  useEffect(() => {
    if (!window.loadPyodide && !isPyodideLoading) {
      setIsPyodideLoading(true);
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      script.onload = async () => {
        try {
          const py = await window.loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"
          });
          setPyodide(py);
          setIsPyodideLoading(false);
        } catch (err) {
          console.error("❌ Pyodide loading failed:", err);
          setIsPyodideLoading(false);
        }
      };
      document.body.appendChild(script);
    }
  }, [isPyodideLoading, pyodide]);

  // Initialize XTerm
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new XTerm({
      theme: {
        background: 'transparent',
        foreground: '#dde2f1',
        cursor: '#00D4FF',
        cursorAccent: '#001f27',
        selectionBackground: 'rgba(0, 212, 255, 0.2)',
        black: '#0e131e',
        red: '#f43f5e',
        green: '#22c55e',
        yellow: '#ffd9a1',
        blue: '#00D4FF',
        magenta: '#8B5CF6',
        cyan: '#3cd7ff',
        white: '#dde2f1',
      },
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      if (runRef.current.jobId) {
        const socket = getSocket();
        socket.emit("exec:input", { jobId: runRef.current.jobId, input: data });
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // CMD/CTRL + Enter = RUN
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onRun();
      }
      // CMD/CTRL + S = SAVE (Mock)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        toast.success("Workspace saved to cloud", {
          style: { background: '#0e131e', color: '#fff', border: '1px solid rgba(0,212,255,0.2)', fontSize: '12px' },
          icon: '💾'
        });
      }
      // CMD/CTRL + L = CLEAR TERMINAL
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        if (xtermRef.current) xtermRef.current.clear();
      }
      // CMD/CTRL + / = TOGGLE AI
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowAiPanel(prev => !prev);
      }
      // CMD/CTRL + H = TOGGLE HISTORY
      if ((e.metaKey || e.ctrlKey) && e.key === "h" && user) {
        e.preventDefault();
        setShowHistoryModal(prev => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user]); // user is a dependency for history shortcut

  const runRef = useRef({ jobId: null });
  const activeConfig = languageConfigs[activeLangId];

  function onCodeChange(value) {
    setBuffers((b) => ({ ...b, [activeLangId]: value ?? "" }));
  }

  async function runPythonInBrowser(code) {
    if (!pyodide) throw new Error("Python engine is still booting...");
    
    pyodide.setStdout({ batched: (str) => { 
      xtermRef.current.write(str);
    } });
    pyodide.setStderr({ batched: (str) => { 
      xtermRef.current.write(str);
    } });

    try {
      // Shim input() to use window.prompt()
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
  }

  async function onRun() {
    const code = buffers[activeLangId] ?? "";
    const language = activeConfig.lang;

    if (busy) return;
    setBusy(true);

    // ULTIMATE SYNC FIX: Explicitly unsubscribe from old job and reset terminal
    const socket = getSocket();
    if (runRef.current.jobId) {
      socket.emit("unsubscribe", { jobId: runRef.current.jobId });
      socket.off("exec:log"); // Wipe all previous log listeners
    }

    if (xtermRef.current) {
      xtermRef.current.reset();
      xtermRef.current.write("\x1b[2J\x1b[0;0H"); // Clear screen and move cursor to 0,0
    }

    setRunStatus("Running");
    setMetrics(null);

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

      // Ensure socket is connected before subscribing
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
           if (evt.type === "stdout") {
             xtermRef.current.write(evt.chunk);
           } else if (evt.type === "stderr") {
             xtermRef.current.write(`\x1b[31m${evt.chunk}\x1b[0m`); // Color stderr red
           }
        }
        if (evt.type === "end") {
          setRunStatus(evt.status === "succeeded" ? "Succeeded" : "Failed");
          if (evt.chunk?.metrics) {
            setMetrics(evt.chunk.metrics);
          }
          setBusy(false);
        }
      };

      socket.on("exec:log", onLog);

      let lastSeenStdout = 0;
      let lastSeenStderr = 0;

      await pollUntilDone(jobId, {
        onUpdate: (s) => {
          if (runRef.current.jobId !== jobId) return;
          setRunStatus(s.status.charAt(0).toUpperCase() + s.status.slice(1));
          
          const sock = getSocket();
          // Fallback if socket isn't connected
          if (!sock.connected && xtermRef.current) {
            if (s.stdout && s.stdout.length > lastSeenStdout) {
              const newPart = s.stdout.slice(lastSeenStdout);
              xtermRef.current.write(newPart);
              lastSeenStdout = s.stdout.length;
            }
            if (s.stderr && s.stderr.length > lastSeenStderr) {
              const newPart = s.stderr.slice(lastSeenStderr);
              xtermRef.current.write(`\x1b[31m${newPart}\x1b[0m`);
              lastSeenStderr = s.stderr.length;
            }
          }
        }
      });

      // Cleanup
      socket.off("exec:log", onLog);
      socket.emit("unsubscribe", { jobId });
    } catch (e) {
      setRunStatus("Failed");
      if (xtermRef.current) {
        xtermRef.current.write(`\x1b[1;31mError: ${e?.message || String(e)}\x1b[0m\r\n`);
      }
    } finally {
      setBusy(false);
    }
  }

  const onClear = () => {
    xtermRef.current.clear();
    setRunStatus("Ready");
  };



  return (
    <div className="relative flex h-screen h-[100dvh] w-full flex-col overflow-hidden selection:bg-cyan-500/20" style={{ background: 'var(--sam-bg)' }}>
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      <header className="relative z-20 flex h-14 md:h-16 shrink-0 items-center justify-between px-4 md:px-8 border-b-0 sam-glass" style={{ borderBottom: '1px solid rgba(0,212,255,0.05)', background: 'rgba(14,19,30,0.85)', backdropFilter: 'blur(30px)' }}>
        <div className="flex items-center gap-4 md:gap-10">
          <div className="flex items-center gap-3 transition-transform hover:scale-105 shrink-0">
            <SamNavLogo />
            <div className="flex flex-col leading-tight">
              <span className="sam-headline tracking-tighter" style={{ fontSize: 13, color: 'var(--sam-text)' }}>SAM</span>
              <span className="text-label" style={{ fontSize: 8, color: 'var(--sam-text-muted)', lineHeight: 1 }}>Compiler</span>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-6">
            {['Editor', 'Dashboard', 'Settings'].map((tab) => {
              if (tab === 'Dashboard') {
                if (user?.role !== 'admin') return null;
                return (
                  <Link
                    key={tab}
                    to="/dashboard"
                    className="group relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all"
                    style={{ color: 'rgba(221,226,241,0.4)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#00D4FF'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(221,226,241,0.4)'}
                  >
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(0,212,255,0.4)' }} />
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
                    color: isActive ? '#00D4FF' : 'rgba(221,226,241,0.4)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    transition: 'color 0.2s',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#dde2f1'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(221,226,241,0.4)'; }}
                >
                  {tab}
                </button>
              );
            })}
          </nav>
        </div>
        
        <div className="flex items-center gap-3 md:gap-5">
          <ThemeToggle theme={theme} toggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />
          
          {user ? (
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 8px 4px 12px',
                borderRadius: 20,
                border: '1px solid rgba(0,212,255,0.12)',
                background: 'rgba(0,212,255,0.04)',
              }}>
                <span className="hidden lg:block" style={{ fontSize: 11, fontWeight: 600, color: '#dde2f1', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                  {user.name}
                </span>
                <img
                  src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=00D4FF&color=001f27`}
                  alt="Avatar"
                  style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(0,212,255,0.3)', objectFit: 'cover' }}
                />
              </div>
              <button
                onClick={() => confirm("Sign out of SAM Compiler?") && logoutUser()}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  border: '1px solid rgba(244,63,94,0.2)',
                  background: 'rgba(244,63,94,0.05)',
                  color: 'rgba(244,63,94,0.6)',
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                  cursor: 'pointer', transition: 'all 0.2s',
                  fontFamily: 'var(--font-body)',
                }}
              >Sign Out</button>
            </div>
          ) : (
            <button
              id="signin-btn"
              onClick={() => setActiveModal('auth')}
              className="sam-button-primary"
              style={{
                padding: '7px 16px', borderRadius: 6,
                fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em',
                cursor: 'pointer', transition: 'all 0.25s',
                fontFamily: 'var(--font-body)',
              }}
            >Sign In</button>
          )}

          {/* Navigation & Actions */}
            <div className="flex items-center gap-3">
              {user && (
                <button 
                  onClick={() => setShowHistoryModal(true)}
                  className="hidden md:flex h-10 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-4 transition-all hover:bg-white/10 hover:border-[#00D4FF]/20"
                >
                  <History className="h-4 w-4 text-white/40 group-hover:text-white" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">History</span>
                </button>
              )}
              
              <button 
                onClick={() => setShowShortcutsHelp(true)}
                className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 transition-all hover:bg-white/10"
                title="Keyboard Shortcuts"
              >
                <Keyboard className="h-5 w-5 text-white/20 transition-colors group-hover:text-white" />
              </button>

              <button 
                onClick={() => setShowAiPanel(!showAiPanel)}
                className={`group flex h-10 items-center gap-2 rounded-xl border px-4 transition-all duration-300 ${showAiPanel ? 'border-sam-text/40 bg-sam-text/5 text-sam-text' : 'border-white/5 bg-white/5 text-white/60 hover:bg-white/10'}`}
              >
                <Sparkles className={`h-4 w-4 ${showAiPanel ? 'animate-pulse' : 'text-white/40'}`} />
                <span className="text-[10px] font-black uppercase tracking-widest">Sam AI</span>
              </button>
            </div>

          <div className="flex md:hidden">
            <button onClick={() => setActiveModal('settings')} style={{ padding: 8, background: 'none', border: 'none', color: 'rgba(221,226,241,0.3)', cursor: 'pointer' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex md:hidden h-12 shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.08)', background: 'rgba(8,14,24,0.9)' }}>
        <button
          onClick={() => setActiveMobileTab('editor')}
          className="relative flex-1 flex items-center justify-center gap-2"
          style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em',
            color: activeMobileTab === 'editor' ? '#00D4FF' : 'rgba(221,226,241,0.3)',
            background: activeMobileTab === 'editor' ? 'rgba(0,212,255,0.05)' : 'transparent',
            border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          Code
          {activeMobileTab === 'editor' && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: '#00D4FF', boxShadow: '0 0 8px #00D4FF' }} />}
        </button>
        <div style={{ width: 1, background: 'rgba(0,212,255,0.08)' }} />
        <button
          onClick={() => setActiveMobileTab('terminal')}
          className="relative flex-1 flex items-center justify-center gap-2"
          style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em',
            color: activeMobileTab === 'terminal' ? '#00D4FF' : 'rgba(221,226,241,0.3)',
            background: activeMobileTab === 'terminal' ? 'rgba(0,212,255,0.05)' : 'transparent',
            border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
            {busy && <div style={{ position: 'absolute', top: -3, right: -3, width: 6, height: 6, borderRadius: '50%', background: '#00D4FF', boxShadow: '0 0 8px #00D4FF', animation: 'sam-pulse 1s infinite' }} />}
          </div>
          Output
          {activeMobileTab === 'terminal' && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: '#00D4FF', boxShadow: '0 0 8px #00D4FF' }} />}
        </button>
      </div>

      <div className={`flex flex-1 overflow-hidden transition-all duration-500 ease-in-out ${showAiPanel ? 'md:pr-[450px] lg:pr-[500px]' : ''}`}>
        <main className="relative z-10 flex flex-1 flex-col md:flex-row overflow-hidden p-2 md:p-4 gap-2 md:gap-4 transition-all duration-500">
          <section className={`flex flex-col overflow-hidden gap-4 ${activeMobileTab === 'editor' ? 'flex-1' : 'hidden'} md:flex md:flex-[7]`}>
            <div className="sam-glass flex flex-1 flex-col overflow-hidden" style={{ borderRadius: 16 }}>
              <div className="flex h-11 shrink-0 items-center justify-between px-3 md:px-5" style={{ background: 'rgba(14,19,30,0.4)', borderBottom: '1px solid rgba(0,212,255,0.05)' }}>
                <div className="flex items-center gap-2 md:gap-4">
                  <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} />
                  <div style={{ width: 1, height: 16, background: 'rgba(0,212,255,0.1)' }} className="hidden md:block" />
                  <span className="hidden md:inline font-mono tracking-wider animate-pulse" style={{ fontSize: 11, fontWeight: 500, color: 'rgba(0,212,255,0.4)' }}>
                    {languageConfigs[activeLangId]?.name}
                  </span>
                </div>
                <button
                  id="editor-run-btn"
                  onClick={onRun}
                  disabled={busy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 14px', borderRadius: 7,
                    border: '1px solid rgba(0,212,255,0.3)',
                    background: busy ? 'rgba(0,212,255,0.04)' : 'rgba(0,212,255,0.08)',
                    color: '#00D4FF',
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    transition: 'all 0.2s',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {busy ? (
                    <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(0,212,255,0.2)', borderTopColor: '#00D4FF', animation: 'spin 0.8s linear infinite' }} />
                  ) : (
                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
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
                  sessionId={`${sessionId}-${activeLangId}`}
                  userName={user?.name}
                  theme="monolith-dark"
                  options={{
                    fontSize: settings.fontSize,
                    tabSize: settings.tabSize,
                  }}
                />
              </div>
            </div>
          </section>
  
          <section className={`flex flex-col overflow-hidden gap-4 ${activeMobileTab === 'terminal' ? 'flex-1' : 'hidden'} md:flex md:flex-[3]`}>
            <div className="sam-glass flex flex-1 flex-col overflow-hidden" style={{ borderRadius: 16, background: 'var(--sam-surface)' }}>
              <div className="flex h-11 shrink-0 items-center justify-between px-4 md:px-6" style={{ background: 'rgba(14,19,30,0.4)', borderBottom: '1px solid rgba(0,212,255,0.05)' }}>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={onClear}
                    title="Clear Output"
                    style={{ padding: '5px', background: 'none', border: 'none', color: 'rgba(221,226,241,0.25)', cursor: 'pointer', borderRadius: 6, transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(221,226,241,0.25)'; e.currentTarget.style.background = 'none'; }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: runStatus === 'Succeeded' ? '#22c55e' : runStatus === 'Failed' ? '#f43f5e' : busy ? '#00D4FF' : 'rgba(221,226,241,0.2)',
                    boxShadow: runStatus === 'Succeeded' ? '0 0 10px #22c55e' : runStatus === 'Failed' ? '0 0 10px #f43f5e' : busy ? '0 0 10px #00D4FF' : 'none',
                    animation: busy ? 'sam-pulse 1s infinite' : 'none',
                    transition: 'all 0.5s',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(221,226,241,0.4)', fontFamily: 'var(--font-mono)' }}>
                    {isWorkerOnline ? 'Terminal' : 'Cloud Output'}
                  </span>
                  {metrics && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid rgba(0,212,255,0.1)' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#00D4FF', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}>
                        {metrics.sandbox?.replace('docker-', '')}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(221,226,241,0.3)', fontFamily: 'var(--font-mono)' }}>
                        {metrics.durationMs}ms
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(221,226,241,0.25)', fontFamily: 'var(--font-body)' }}>{runStatus}</div>
              </div>
              
              <div className="flex-1 overflow-hidden p-2 md:p-5 bg-black/40 relative">
                <div ref={terminalRef} className="h-full w-full" />
                
                {!isWorkerOnline && busy && (
                  <div className="absolute top-4 left-4 right-4 z-10">
                    <div className="text-[10px] font-bold text-amber-500/50 uppercase tracking-widest bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 backdrop-blur-md">
                       ⚠️ Cloud Sandbox - Interactivity limited. Run API locally for full stdin.
                    </div>
                  </div>
                )}
              </div>
  
              <div className="flex h-8 md:h-10 shrink-0 items-center justify-between px-4 md:px-6" style={{ borderTop: '1px solid rgba(0,212,255,0.06)', background: 'rgba(8,14,24,0.4)' }}>
                <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(0,212,255,0.3)', fontFamily: 'var(--font-body)' }}>SAM-RUNTIME</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(221,226,241,0.2)', fontFamily: 'var(--font-mono)' }}>{languageConfigs[activeLangId]?.name}</span>
              </div>
            </div>
          </section>
        </main>
      </div>

      <footer className="relative z-20 flex h-10 shrink-0 items-center justify-between px-4 md:px-6 sam-glass border-x-0 border-b-0 border-t border-[#00D4FF]/10 mt-2" style={{ background: 'rgba(14,19,30,0.9)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isApiOnline ? '#22c55e' : '#f43f5e',
              boxShadow: isApiOnline ? '0 0 8px #22c55e' : '0 0 8px #f43f5e',
            }} />
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: isApiOnline ? 'rgba(34,197,94,0.7)' : 'rgba(244,63,94,0.7)', fontFamily: 'var(--font-body)' }}>
              {isApiOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(0,212,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}>
            {activeLangId}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="hidden sm:inline" style={{ fontSize: 9, fontWeight: 600, color: 'rgba(221,226,241,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-body)' }}>
            Built by{' '}
            <a href="https://linkedin.com/in/syedmukheeth" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(0,212,255,0.5)', textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#00D4FF'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(0,212,255,0.5)'}
            >Syed Mukheeth</a>
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(221,226,241,0.15)', fontFamily: 'var(--font-body)' }}>SAM © 2026</span>
        </div>
      </footer>

      <AiPanel 
        isOpen={showAiPanel} 
        onClose={() => setShowAiPanel(false)}
        language={activeLangId}
        currentCode={buffers[activeLangId]}
        onApplyRefactor={(newCode) => {
          setBuffers(prev => ({ ...prev, [activeLangId]: newCode }));
          setShowAiPanel(false);
          toast.success("AI refactor applied", {
            style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '10px' }
          });
        }}
      />

      <HistoryModal 
        isOpen={showHistoryModal} 
        onClose={() => setShowHistoryModal(false)}
        onRestore={(code, lang) => {
          if (languageConfigs[lang]) {
            setActiveLangId(lang);
          }
          setBuffers(prev => ({ ...prev, [lang || activeLangId]: code }));
          toast.success("Code restored from history", {
            style: { background: '#0e131e', color: '#fff', border: '1px solid rgba(0,212,255,0.2)', fontSize: '10px' }
          });
        }}
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
              className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#0e131e] p-8 shadow-2xl"
            >
              <h3 className="mb-6 flex items-center gap-3 text-lg font-black uppercase tracking-[0.2em] text-white">
                 <Keyboard className="h-5 w-5 text-[#00D4FF]" />
                 Shortcuts
              </h3>
              <div className="flex flex-col gap-4">
                 <ShortcutItem keys={["CTRL", "ENTER"]} label="Run Code" />
                 <ShortcutItem keys={["CTRL", "S"]} label="Save Locally" />
                 <ShortcutItem keys={["CTRL", "L"]} label="Clear Terminal" />
                 <ShortcutItem keys={["CTRL", "/"]} label="Toggle Sam AI" />
                 <ShortcutItem keys={["CTRL", "H"]} label="Open History" />
              </div>
              <button 
                onClick={() => setShowShortcutsHelp(false)}
                className="mt-8 w-full rounded-xl bg-white/5 p-3 text-[10px] font-black uppercase tracking-widest text-white/40 transition-all hover:bg-white/10 hover:text-white"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AuthModal isOpen={activeModal === 'auth'} onClose={() => setActiveModal(null)} onLogin={loginUser} />
      <SettingsModal isOpen={activeModal === 'settings'} onClose={() => setActiveModal(null)} settings={settings} onSettingsChange={onSettingsUpdate} />
      <UpgradeModal isOpen={activeModal === 'upgrade'} onClose={() => setActiveModal(null)} />
      
      <Toaster position="bottom-right" reverseOrder={false} />
    </div>
  );
}

function ShortcutItem({ keys, label }) {
  return (
    <div className="flex items-center justify-between">
       <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</span>
       <div className="flex gap-1">
          {keys.map(k => (
            <kbd key={k} className="flex h-5 items-center justify-center rounded bg-white/10 px-1.5 text-[9px] font-black text-white/80">{k}</kbd>
          ))}
       </div>
    </div>
  );
}
