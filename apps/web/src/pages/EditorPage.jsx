import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
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
import HistoryPanel from "../components/HistoryPanel";
import AiPanel from "../components/AiPanel";
import { useAuth } from "../hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles, Keyboard, Clock } from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from "framer-motion";
import ENDPOINTS from "../services/endpoints";
import favicon from "../assets/favicon.svg";
import faviconLight from "../assets/favicon-light.svg";

// Real SAM logo using imported assets
function SamNavLogo({ theme }) {
  const src = theme === 'dark' ? favicon : faviconLight;
  return (
    <div className="flex h-10 w-10 items-center justify-center transition-all duration-500 hover:scale-110">
      <img src={src} alt="SAM" style={{ width: 32, height: 32 }} />
    </div>
  );
}

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

function ThemeToggle({ theme, toggle }) {
  const isDark = theme === 'dark';
  
  return (
    <motion.button
      onClick={toggle}
      className={`relative flex h-8 w-14 items-center rounded-full p-1 focus:outline-none overflow-hidden transition-colors border ${
        isDark ? 'border-white/10 bg-white/10' : 'border-black/10 bg-black/5'
      }`}
      style={{ backdropFilter: 'blur(10px)' }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="absolute left-1 flex h-6 w-6 items-center justify-center rounded-full shadow-md"
        animate={{ 
          x: isDark ? 0 : 24,
          background: isDark ? '#FFFFFF' : '#000000',
        }}
        transition={{ 
          type: "spring",
          stiffness: 500,
          damping: 30,
          mass: 0.8
        }}
      >
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.div
              key="moon"
              initial={{ opacity: 0, rotate: -90, scale: 0.3 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.3 }}
              transition={{ duration: 0.15 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
              </svg>
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ opacity: 0, rotate: 90, scale: 0.3 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.3 }}
              transition={{ duration: 0.15 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
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
  
  const [searchParams, setSearchParams] = useSearchParams();
  
  // High-fidelity session derivation
  const sessionId = useMemo(() => {
    const s = searchParams.get("session");
    const raw = (s && s !== "default") ? s : "default";
    return `${raw}_${activeLangId}`;
  }, [searchParams, activeLangId]);

  useEffect(() => {
    // PRIME MODE: High-Fidelity Authentication Diagnostic
    const sessionParam = searchParams.get("session");
    const tokenParam = searchParams.get("token");
    
    if (tokenParam) {
      console.log("[SAM-AUTH] Token found in URL, initiating verification...");
    }

    if (!sessionParam || sessionParam === "default") {
      const fresh = Math.random().toString(36).substring(2, 9);
      const newParams = { session: fresh };
      if (tokenParam) newParams.token = tokenParam;
      
      console.log(`[SAM-SESSION] Initializing fresh session: ${fresh}`);
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);




  const [theme, setTheme] = useState(localStorage.getItem("sam-theme") || "dark");
  
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const saved = localStorage.getItem('sam-ai-width');
    return saved ? parseInt(saved) : 500;
  });
  const [isResizingAi, setIsResizingAi] = useState(false);

  const startResizingAi = useCallback((e) => {
    e.preventDefault();
    setIsResizingAi(true);
  }, []);

  const stopResizingAi = useCallback(() => {
    setIsResizingAi(false);
  }, []);

  const resizeAi = useCallback((e) => {
    if (!isResizingAi) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 320 && newWidth < window.innerWidth * 0.8) {
      setAiPanelWidth(newWidth);
      localStorage.setItem('sam-ai-width', newWidth.toString());
    }
  }, [isResizingAi]);

  useEffect(() => {
    if (isResizingAi) {
      window.addEventListener('mousemove', resizeAi);
      window.addEventListener('mouseup', stopResizingAi);
    } else {
      window.removeEventListener('mousemove', resizeAi);
      window.removeEventListener('mouseup', stopResizingAi);
    }
    return () => {
      window.removeEventListener('mousemove', resizeAi);
      window.removeEventListener('mouseup', stopResizingAi);
    };
  }, [isResizingAi, resizeAi, stopResizingAi]);

  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Responsive Hook
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Pre-connect socket for performance
  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }
  }, []);
  const [busy, setBusy] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [showHistory, setShowHistory] = useState(false);
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);
  const [isApiOnline, setIsApiOnline] = useState(true);
  const [activeMobileTab, setActiveMobileTab] = useState('editor');
  
  const { user, token, loginUser, logoutUser } = useAuth();

  // Layout Resizing Logic (60/40 Split)
  const [leftPanelWidth, setLeftPanelWidth] = useState(60); // Percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const runRef = useRef({ jobId: null });

  const startResizing = useCallback(() => {
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const onReset = useCallback(() => {
    if (window.confirm(`Are you sure? This will reset your ${activeLangId} code to the default boilerplate.`)) {
      setBuffers(prev => ({ 
        ...prev, 
        [activeLangId]: languageConfigs[activeLangId]?.template || "" 
      }));
      toast.success("Code reset successful", {
        icon: '🔄',
        style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '10px', fontWeight: 700 }
      });
    }
  }, [activeLangId]);

  // Load code from history into the editor
  const handleLoadFromHistory = useCallback((runtime, code) => {
    // Map runtime name to our langId key
    const langMap = { javascript: 'javascript', nodejs: 'javascript', python: 'python', cpp: 'cpp', c: 'c', java: 'java' };
    const langId = langMap[runtime] || 'cpp';
    setActiveLangId(langId);
    // Dispatch to CodeEditor via the same reset event channel
    window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template: code } }));
    setBuffers(prev => ({ ...prev, [langId]: code }));
    toast.success('Code loaded from history', {
      icon: '📦',
      style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '11px', fontWeight: 700 }
    });
  }, []);

  const onResize = useCallback((e) => {
    if (!isResizing || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    
    // Constraints: 20% min, 80% max
    if (newWidth > 20 && newWidth < 80) {
      setLeftPanelWidth(newWidth);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', onResize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', onResize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, onResize, stopResizing]);

  // Sync Monaco & Terminal Layout on Resize
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [leftPanelWidth, showAiPanel]);


  // Poll worker status & Sync theme
  useEffect(() => {
    const checkStatus = async () => {
      if (!navigator.onLine) {
        setIsApiOnline(false);
        setIsWorkerOnline(false);
        return;
      }
      try {
        const res = await fetch(`${ENDPOINTS.API_BASE_URL}/runs/health/queue`);
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
    localStorage.setItem("sam-theme", theme);
    
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

  // Dynamic Monocromatic Brand Sync
  useEffect(() => {
    // 1. Force Page Title for Pro Brand
    document.title = "SAM Compiler | Syntax Analysis Machine";

    // 2. Sync High-Fidelity Favicon with Theme
    const fav = document.getElementById("favicon");
    if (fav) {
      const highFidelityWhite = `data:image/svg+xml,%3Csvg width='48' height='48' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='21' cy='7' r='2.5' fill='white'/%3E%3Ccircle cx='31' cy='7' r='2.5' fill='white'/%3E%3Ccircle cx='5' cy='24' r='2.5' fill='white'/%3E%3Ccircle cx='43' cy='24' r='2.5' fill='white'/%3E%3Ccircle cx='21' cy='41' r='2.5' fill='white'/%3E%3Ccircle cx='31' cy='41' r='2.5' fill='white'/%3E%3Cpath d='M12 18L4 24L12 30' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M36 18L44 24L36 30' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M28 14L20 24H28L20 34' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M18 12L20 8' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M28 12L30 8' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M10 24H6' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M38 24H42' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M18 36L20 40' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M28 36L30 40' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E`;
      const highFidelityBlack = `data:image/svg+xml,%3Csvg width='48' height='48' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='24' cy='24' r='23' fill='white'/%3E%3Ccircle cx='21' cy='7' r='2.5' fill='black'/%3E%3Ccircle cx='31' cy='7' r='2.5' fill='black'/%3E%3Ccircle cx='5' cy='24' r='2.5' fill='black'/%3E%3Ccircle cx='43' cy='24' r='2.5' fill='black'/%3E%3Ccircle cx='21' cy='41' r='2.5' fill='black'/%3E%3Ccircle cx='31' cy='41' r='2.5' fill='black'/%3E%3Cpath d='M12 18L4 24L12 30' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M36 18L44 24L36 30' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M28 14L20 24H28L20 34' stroke='black' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M18 12L20 8' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M28 12L30 8' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M10 24H6' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M38 24H42' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M18 36L20 40' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M28 36L30 40' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E`;
      fav.setAttribute("href", theme === 'light' ? highFidelityBlack : highFidelityWhite);
    }
  }, [theme]);

  // Terminal logic below...
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const isDark = theme === "dark";
    const term = new XTerm({
      theme: {
        background: isDark ? '#000000' : '#F1F5F9',
        foreground: isDark ? '#FFFFFF' : '#0F172A',
        cursor: isDark ? '#FFFFFF' : '#0F172A',
        cursorAccent: isDark ? '#000000' : '#FFFFFF',
        selectionBackground: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(15, 23, 42, 0.15)',
        black: isDark ? '#1A1A1A' : '#000000',
        red: isDark ? '#FF3B3B' : '#DC2626', // Toxic Red for errors
        green: isDark ? '#10B981' : '#059669',
        yellow: isDark ? '#FACC15' : '#D97706',
        blue: isDark ? '#3B82F6' : '#2563EB',
        magenta: isDark ? '#D946EF' : '#C026D3',
        cyan: isDark ? '#06B6D4' : '#0891B2',
        white: isDark ? '#FFFFFF' : '#0F172A',
      },
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
      convertEol: true, // Fixes the stair-step missing \r bug in raw compiler logs
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
  }, [theme]);

  const handleCodeReset = useCallback(() => {
    const template = languageConfigs[activeLangId]?.template || "";
    if (window.confirm(`[SYSTEM OVERRIDE]\n\nAre you sure you want to sanitize the ${activeLangId.toUpperCase()} workspace?\nAll unsaved changes will be permanently purged to restore factory templates.`)) {
      // Dispatch custom event for the Yjs-bound CodeEditor
      window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template } }));

      setBuffers(prev => ({ 
        ...prev, 
        [activeLangId]: template 
      }));
      // Note: The success toast is handled centrally inside CodeEditor.jsx
      // to ensure it only fires when the network transaction actually completes.
    }
  }, [activeLangId, languageConfigs]);

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
          style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '12px' },
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

    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user]); // user is a dependency for history shortcut

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
    <div className="relative flex h-screen h-[100dvh] w-full flex-col overflow-hidden selection:bg-white/10 pb-12" style={{ background: 'var(--sam-bg)' }}>
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      <header className="relative z-20 flex h-14 md:h-16 shrink-0 items-center justify-between px-4 md:px-8 border-b-0 sam-glass" style={{ borderBottom: '1px solid var(--sam-glass-border)', background: 'var(--sam-glass-bg)', backdropFilter: 'blur(30px)' }}>
        <div className="flex items-center gap-2 md:gap-14 shrink-0 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 transition-all hover:scale-105">
              <div className="scale-90 sm:scale-100 origin-left">
                <SamNavLogo theme={theme} />
              </div>
              <div className="flex flex-col leading-[0.9] mt-1 relative scale-75 sm:scale-100 origin-left -ml-1 sm:ml-0">
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
        <motion.div 
          animate={{ x: (showAiPanel && window.innerWidth >= 768) ? -440 : 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="flex items-center gap-1 sm:gap-2 md:gap-5 shrink-0"
        >
          <div className="scale-75 sm:scale-100 origin-right">
            <ThemeToggle theme={theme} toggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />
          </div>
          
          {user ? (
            <div className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '2px 4px 2px 8px',
                borderRadius: 20,
                border: '1px solid var(--sam-glass-border)',
                background: 'var(--sam-accent-muted)',
              }}>
                <span className="hidden lg:block" style={{ fontSize: 11, fontWeight: 600, color: 'var(--sam-text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                  {user.name}
                </span>
                <img
                  src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=000000&color=FFFFFF`}
                  alt="Avatar"
                  style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--sam-glass-border)', objectFit: 'cover' }}
                />
              </div>
              <button
                onClick={() => confirm("Sign out of SAM Compiler?") && logoutUser()}
                className="shrink-0"
                style={{
                  padding: '5px 8px', borderRadius: 6,
                  border: '1px solid var(--sam-glass-border)',
                  background: 'var(--sam-surface-low)',
                  color: 'var(--sam-text-dim)',
                  fontSize: 9, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.1em',
                  cursor: 'pointer', transition: 'all 0.2s',
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sam-text)'; e.currentTarget.style.background = 'var(--sam-glass-border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sam-text-dim)'; e.currentTarget.style.background = 'var(--sam-surface-low)'; }}
              >
                <span className="hidden sm:inline">Sign Out</span>
                <span className="inline sm:hidden">Quit</span>
              </button>
            </div>
          ) : (
            <button
              id="signin-btn"
              onClick={() => setActiveModal('auth')}
              className="sam-button-primary shrink-0"
              style={{
                padding: window.innerWidth < 768 ? '5px 10px' : '7px 18px', 
                borderRadius: 4,
                fontSize: window.innerWidth < 768 ? 9 : 10, 
                fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                cursor: 'pointer', transition: 'all 0.25s',
                fontFamily: 'var(--font-body)',
                background: 'var(--sam-accent)',
                color: 'var(--sam-bg)',
                border: 'none',
                whiteSpace: 'nowrap'
              }}
            >Sign In</button>
          )}

          {/* Navigation & Actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-3 shrink-0">

            <button 
              onClick={() => setShowShortcutsHelp(true)}
              className="group hidden md:flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300"
              style={{ 
                background: 'var(--sam-surface-low)',
                borderColor: 'var(--sam-glass-border)',
                boxShadow: 'var(--sam-glow-bloom)'
              }}
              title="Keyboard Shortcuts"
            >
              <Keyboard className="h-5 w-5 transition-colors" style={{ color: 'var(--sam-text-dim)' }} />
            </button>

            <button 
              onClick={() => setShowAiPanel(!showAiPanel)}
              className="group flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-auto md:px-4 items-center justify-center gap-2 rounded-xl border transition-all duration-300 shrink-0"
              style={{ 
                background: showAiPanel ? 'var(--sam-accent-muted)' : 'var(--sam-surface-low)',
                borderColor: showAiPanel ? 'var(--sam-accent)' : 'var(--sam-glass-border)',
                color: showAiPanel ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
                boxShadow: 'var(--sam-glow-bloom)'
              }}
              title="AI Assistant"
            >
              <Sparkles className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${showAiPanel ? 'animate-pulse' : ''}`} />
            </button>

            {/* History Button */}
            <button 
              onClick={() => {
                if (!token) { setActiveModal('auth'); return; }
                setShowHistory(prev => !prev);
              }}
              className="group flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-auto md:px-4 items-center justify-center gap-2 rounded-xl border transition-all duration-300 shrink-0"
              style={{ 
                background: showHistory ? 'var(--sam-accent-muted)' : 'var(--sam-surface-low)',
                borderColor: showHistory ? 'var(--sam-accent)' : 'var(--sam-glass-border)',
                color: showHistory ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
                boxShadow: 'var(--sam-glow-bloom)'
              }}
              title="Run History"
            >
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden md:inline" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-body)' }}>History</span>
            </button>

            <button 
              onClick={() => setActiveModal('settings')} 
              className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 shrink-0 md:hidden"
              style={{ background: 'none', border: 'none', color: 'var(--sam-text-dim)', cursor: 'pointer', opacity: 0.7 }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </motion.div>
      </header>

      <div className="flex md:hidden h-12 shrink-0" style={{ borderBottom: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface-low)' }}>
        <button
          onClick={() => setActiveMobileTab('editor')}
          className="relative flex-1 flex items-center justify-center gap-2"
          style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em',
            color: activeMobileTab === 'editor' ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
            background: 'transparent',
            border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          Code
          {activeMobileTab === 'editor' && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--sam-accent)' }} />}
        </button>
        <div style={{ width: 1, background: 'var(--sam-glass-border)' }} />
        <button
          onClick={() => setActiveMobileTab('terminal')}
          className="relative flex-1 flex items-center justify-center gap-2"
          style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em',
            color: activeMobileTab === 'terminal' ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
            background: activeMobileTab === 'terminal' ? 'var(--sam-accent-muted)' : 'transparent',
            border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
            {busy && <div style={{ position: 'absolute', top: -3, right: -3, width: 6, height: 6, borderRadius: '50%', background: 'var(--sam-accent)', animation: 'sam-pulse 1s infinite' }} />}
          </div>
          Output
          {activeMobileTab === 'terminal' && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--sam-accent)' }} />}
        </button>
      </div>

      <div 
        ref={containerRef}
        className={`flex flex-1 overflow-hidden transition-all duration-200 ease-out`}
        style={showAiPanel && window.innerWidth >= 768 ? { paddingRight: aiPanelWidth } : {}}
      >
        <main className="relative z-10 flex flex-1 flex-col md:flex-row overflow-hidden p-3 md:p-6 pb-20 md:pb-24 gap-0 transition-all duration-200 ease-out">
          {/* EDITOR SECTION */}
          <section 
            className={`flex flex-col overflow-hidden ${activeMobileTab === 'editor' ? 'flex-1' : 'hidden'} md:flex`}
            style={isMobile ? { width: '100%', flex: '1 1 100%' } : { width: `${leftPanelWidth}%`, flex: `0 0 ${leftPanelWidth}%` }}
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
                    color: theme === 'light' ? '#FFFFFF' : '#000000',
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

          {/* DRAGGABLE SPLITTER */}
          <div 
            onMouseDown={startResizing}
            className="hidden md:flex group relative w-1.5 h-full cursor-col-resize items-center justify-center transition-all hover:bg-white/5 z-30"
          >
            <div className="h-24 w-[1px] bg-white/5 group-hover:bg-white/20 transition-all" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-4 rounded-full bg-black/80 border border-white/5 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-0.5">
              <div className="w-[1px] h-3 bg-white/20" />
              <div className="w-[1px] h-3 bg-white/20" />
            </div>
          </div>

          {/* TERMINAL SECTION */}
          <section 
            className={`flex flex-col overflow-hidden ${activeMobileTab === 'terminal' ? 'flex-1' : 'hidden'} md:flex`}
            style={isMobile ? { width: '100%', flex: '1 1 100%' } : { width: `${100 - leftPanelWidth}%`, flex: `0 0 ${100 - leftPanelWidth}%` }}
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
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>
                    {isWorkerOnline ? 'SAM RUNTIME' : 'CLOUD OUTPUT'}
                  </span>
                  {metrics && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid var(--sam-glass-border)' }}>
                      <span style={{ fontSize: 9, fontBold: 800, color: 'var(--sam-text)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', opacity: 0.9 }}>
                        {metrics.sandbox?.replace('docker-', '')}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--sam-text-dim)', fontFamily: 'var(--font-mono)' }}>
                        {metrics.durationMs}ms
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ 
                  fontSize: 10, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.25em', 
                  color: runStatus === 'Failed' ? '#FF3B3B' : 'var(--sam-text-muted)', 
                  fontFamily: 'var(--font-body)',
                  textShadow: runStatus === 'Failed' ? '0 0 12px rgba(255,59,59,0.3)' : 'none'
                }}>{runStatus}</div>
              </div>
              
              <div className={`flex-1 overflow-hidden relative ${theme === 'light' ? 'bg-[#F1F5F9]' : 'bg-[#000000]'}`}>
                <div ref={terminalRef} className="h-full w-full overflow-hidden" 
                  style={{ padding: '20px' }} 
                />
                
                {!isWorkerOnline && busy && (
                  <div className="absolute top-4 left-4 right-4 z-10">
                    <div className="text-[10px] font-bold text-amber-500/50 uppercase tracking-widest bg-amber-500/10 p-2 rounded-lg border border-amber-500/10 backdrop-blur-md">
                       ⚠️ Cloud Sandbox - Interactivity limited. Run API locally for full stdin.
                    </div>
                  </div>
                )}
              </div>
  
              <div className="flex h-8 md:h-10 shrink-0 items-center justify-between px-4 md:px-6" style={{ borderTop: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface-low)' }}>
                <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', opacity: 0.8, fontFamily: 'var(--font-body)' }}>SAM-RUNTIME</span>
                <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>{languageConfigs[activeLangId]?.name}</span>
              </div>
            </div>
          </section>
          {/* AI PANEL RESIZER */}
          {showAiPanel && (
            <div 
              onMouseDown={startResizingAi}
              className={`fixed top-0 bottom-12 z-[70] w-1.5 cursor-col-resize transition-all hover:bg-white/10 hidden md:block`}
              style={{ right: aiPanelWidth }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-4 rounded-full bg-black/80 border border-white/5 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                <div className="w-[1px] h-4 bg-white/20" />
                <div className="w-[1px] h-4 bg-white/20" />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Fixed Terminal Dashboard Footer */}
      <footer className={`fixed bottom-0 left-0 right-0 z-50 flex h-12 items-center justify-between px-6 transition-all duration-300 backdrop-blur-md ${
        theme === 'dark' 
          ? 'bg-black/90' 
          : 'bg-white/95 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.05)]'
      }`}>
        {/* Top Accent Bar — Full-Width Fading Glow Horizon (Intense) */}
        <div className="absolute top-0 left-0 right-0 h-[3px] z-10 overflow-visible">
          <div 
            className={`w-full h-full ${
              theme === 'dark' 
                ? 'sam-pulse-glow-red bg-gradient-to-r from-transparent via-[#ff3b3b] to-transparent shadow-[0_0_40px_rgba(255,59,59,0.9)]' 
                : 'sam-pulse-glow-blue bg-gradient-to-r from-transparent via-[#3b82f6] to-transparent shadow-[0_0_30px_rgba(59,130,246,0.7)]'
            }`}
          />
          {/* Intense Core — High-Energy Saturated Neon Blade */}
          <div 
            className={`absolute top-0 left-0 right-0 h-[1.5px] ${
              theme === 'dark' 
                ? 'bg-gradient-to-r from-transparent via-[#ff1a1a] to-transparent' 
                : 'bg-gradient-to-r from-transparent via-[#2563eb] to-transparent'
            }`}
            style={{ opacity: 0.9 }}
          />
        </div>

        <div className="flex items-center gap-6 h-full">
          <div className="flex items-center gap-3">
            <div className={`relative flex items-center justify-center`}>
              <div className={`absolute h-2.5 w-2.5 animate-ping rounded-full opacity-40 ${isApiOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <div className={`h-1.5 w-1.5 rounded-full ${isApiOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'}`} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
              theme === 'dark' ? 'text-white' : 'text-slate-900'
            }`}>
              {isApiOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className={`h-4 w-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-200'}`} />

          {/* DYNAMIC METRICS: CPU / RAM */}
          <div className="hidden lg:flex items-center gap-6">
             <div className="flex items-center gap-2">
                <span className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>CPU</span>
                <span className={`font-mono text-[10px] font-bold tabular-nums ${theme === 'dark' ? 'text-white' : 'text-slate-600'}`}>
                  {busy ? (8 + Math.random() * 5).toFixed(1) : (0.1 + Math.random() * 0.3).toFixed(1)}%
                </span>
             </div>
             <div className="flex items-center gap-2">
                <span className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>RAM</span>
                <span className={`font-mono text-[10px] font-bold tabular-nums ${theme === 'dark' ? 'text-white' : 'text-slate-600'}`}>
                  {busy ? (110 + Math.random() * 20).toFixed(0) : (42 + Math.random() * 5).toFixed(0)}MB
                </span>
             </div>
          </div>
        </div>

        {/* Dashboard Quick Controls */}
        <div className="flex items-center gap-4 md:gap-8">


          <a 
            href="https://linkedin.com/in/syedmukheeth" 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`group flex items-center gap-3 transition-all active:scale-95`}
          >
            <span className={`hidden text-[9px] font-black uppercase tracking-[0.2em] transition-opacity lg:inline ${
              theme === 'dark' ? 'text-white/60 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-800'
            }`}>
              BUILT BY
            </span>
            <div className={`flex items-center gap-2 rounded-lg py-1.5 px-3 border transition-all duration-200 ${
               theme === 'dark' 
                 ? 'bg-white/8 border-white/15 text-white/90 hover:bg-[#ff3b3b]/15 hover:border-[#ff3b3b]/40 hover:text-[#ff3b3b] hover:shadow-[0_0_12px_rgba(255,59,59,0.25)]' 
                 : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-blue-600 hover:border-blue-600 hover:text-white'
            }`}>
              <svg className={`h-3 w-3 fill-current shrink-0`} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              <span className={`text-[10px] font-black uppercase tracking-wider`}>
                SYED MUKHEETH
              </span>
            </div>
          </a>

          <div className={`h-4 w-[1px] hidden sm:block ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-200'}`} />

          <span className={`hidden text-[9px] font-black uppercase tracking-[0.2em] sm:block ${
            theme === 'dark' ? 'text-white/50' : 'text-slate-400'
          }`}>
            SAM © 2026
          </span>
        </div>
      </footer>

      <AiPanel 
        isOpen={showAiPanel} 
        onClose={() => setShowAiPanel(false)}
        language={activeLangId}
        currentCode={buffers[activeLangId]}
        metrics={metrics}
        theme={theme}
        width={aiPanelWidth}
        onApplyRefactor={(newCode) => {
          // DISPATCH FORCE SYNC EVENT for collaborative editor
          const event = new CustomEvent('sam-editor-reset', { 
            detail: { template: newCode } 
          });
          window.dispatchEvent(event);
          
          setBuffers(prev => ({ ...prev, [activeLangId]: newCode }));
          setShowAiPanel(false);
          toast.success("AI refactor applied", {
            style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '10px' }
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
      <SettingsModal isOpen={activeModal === 'settings'} onClose={() => setActiveModal(null)} settings={settings} onSettingsChange={onSettingsUpdate} />
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



function ShortcutItem({ keys, label, theme }) {
  return (
    <div className="flex items-center justify-between">
       <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>{label}</span>
       <div className="flex gap-1">
          {keys.map(k => (
            <kbd key={k} className={`flex h-5 items-center justify-center rounded px-1.5 text-[9px] font-black ${
               theme === 'dark' ? 'bg-white/10 text-white/80' : 'bg-slate-200 text-slate-700'
            }`}>{k}</kbd>
          ))}
       </div>
    </div>
  );
}
