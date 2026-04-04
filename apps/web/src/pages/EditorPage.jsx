import React, { useRef, useState, useEffect, useCallback } from "react";
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
    <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm transition-transform hover:scale-110">
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Eye Outer Brackets */}
        <path d="M12 18L4 24L12 30" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M36 18L44 24L36 30" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Central Bolt (S/7 Shape) */}
        <path d="M28 14L20 24H28L20 34" stroke="black" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Circuit Accents Top */}
        <circle cx="21" cy="7" r="2" fill="black" />
        <circle cx="31" cy="7" r="2" fill="black" />
        
        {/* Circuit Accents Sides */}
        <circle cx="5" cy="24" r="2" fill="black" />
        <circle cx="43" cy="24" r="2" fill="black" />

        {/* Circuit Accents Bottom */}
        <circle cx="21" cy="41" r="2" fill="black" />
        <circle cx="31" cy="41" r="2" fill="black" />
      </svg>
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
  return (
    <motion.button
      onClick={toggle}
      className="relative flex h-7 w-12 items-center rounded-full px-1 shadow-inner focus:outline-none overflow-hidden"
      style={{ 
        background: theme === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(0,212,255,0.1)',
        border: '1px solid var(--sam-glass-border)',
        backdropFilter: 'blur(10px)'
      }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="absolute left-1 flex h-5 w-5 items-center justify-center rounded-full shadow-lg"
        animate={{ 
          x: theme === 'dark' ? 0 : 20,
          background: theme === 'dark' ? '#FFFFFF' : '#000000',
          boxShadow: theme === 'dark' ? '0 0 10px rgba(255,255,255,0.1)' : '0 0 10px rgba(0,0,0,0.1)'
        }}
        transition={{ 
          type: "spring",
          stiffness: 400,
          damping: 25
        }}
      >
        <AnimatePresence mode="wait">
          {theme === 'dark' ? (
            <motion.div
              key="moon"
              initial={{ opacity: 0, rotate: -45, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 45, scale: 0.5 }}
              transition={{ duration: 0.1 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ opacity: 0, rotate: 45, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -45, scale: 0.5 }}
              transition={{ duration: 0.1 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
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
  
  const [searchParams] = useSearchParams();
  const rawSessionId = searchParams.get("session") || "default";
  
  // FIX: Isolate sessions by language to prevent cross-language code duplication
  const sessionId = `${rawSessionId}_${activeLangId}`;

  const [theme, setTheme] = useState(localStorage.getItem("sam-theme") || "dark");
  
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
  const [activeMobileTab, setActiveMobileTab] = useState('editor');
  
  const { user, loginUser, logoutUser } = useAuth();

  // Layout Resizing Logic (60/40 Split)
  const [leftPanelWidth, setLeftPanelWidth] = useState(60); // Percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

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

  // Sycn Monaco Layout on Resize
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
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
      const highFidelityBlack = `data:image/svg+xml,%3Csvg width='48' height='48' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='21' cy='7' r='2.5' fill='black'/%3E%3Ccircle cx='31' cy='7' r='2.5' fill='black'/%3E%3Ccircle cx='5' cy='24' r='2.5' fill='black'/%3E%3Ccircle cx='43' cy='24' r='2.5' fill='black'/%3E%3Ccircle cx='21' cy='41' r='2.5' fill='black'/%3E%3Ccircle cx='31' cy='41' r='2.5' fill='black'/%3E%3Cpath d='M12 18L4 24L12 30' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M36 18L44 24L36 30' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M28 14L20 24H28L20 34' stroke='black' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M18 12L20 8' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M28 12L30 8' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M10 24H6' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M38 24H42' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M18 36L20 40' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M28 36L30 40' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E`;
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
        red: isDark ? '#F5F5F5' : '#7F1D1D',
        green: isDark ? '#FFFFFF' : '#064E3B',
        yellow: isDark ? '#E5E5E5' : '#713F12',
        blue: isDark ? '#D4D4D4' : '#1E3A8A',
        magenta: isDark ? '#A3A3A3' : '#581C87',
        cyan: isDark ? '#FFFFFF' : '#164E63',
        white: isDark ? '#FFFFFF' : '#FFFFFF',
      },
      fontFamily: 'var(--font-mono)',
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
  }, [theme]);

  const handleCodeReset = () => {
    if (window.confirm("Overwrite current code with original template?")) {
      window.dispatchEvent(new CustomEvent('sam-editor-reset', { 
        detail: { template: languageConfigs[activeLangId].template } 
      }));
    }
  };

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
    <div className="relative flex h-screen h-[100dvh] w-full flex-col overflow-hidden selection:bg-white/10 pb-12" style={{ background: 'var(--sam-bg)' }}>
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      <header className="relative z-20 flex h-14 md:h-16 shrink-0 items-center justify-between px-4 md:px-8 border-b-0 sam-glass" style={{ borderBottom: '1px solid var(--sam-glass-border)', background: 'var(--sam-glass-bg)', backdropFilter: 'blur(30px)' }}>
        <div className="flex items-center gap-4 md:gap-14">
          <div className="flex items-center gap-5 shrink-0">
            <div className="flex items-center gap-3 transition-all hover:scale-105">
              <SamNavLogo />
              <div className="flex flex-col leading-none">
                <span className="font-black tracking-[0.2em] text-[13px] text-white uppercase italic" style={{ fontFamily: 'var(--font-mono)' }}>SAM</span>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-[0.4em] mt-0.5">Compiler</span>
              </div>
            </div>

            <div className="h-8 w-[1px] bg-white/5 hidden lg:block" />

            {/* LinkedIn Style Author Badge */}
            <a 
              href="https://linkedin.com/in/syedmukheeth" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden lg:flex items-center gap-3 group px-4 py-2 rounded-xl transition-all duration-500 border border-transparent hover:border-white/10 hover:bg-white/[0.02]"
            >
              <div className="flex flex-col items-start leading-none gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 group-hover:text-white/60 transition-colors">Built by</span>
                <span className="text-[11px] font-black tracking-tight text-white/70 group-hover:text-white transition-colors">Syed Mukheeth</span>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 group-hover:bg-[#0077b5] group-hover:shadow-[0_0_15px_rgba(0,119,181,0.3)] transition-all duration-500">
                {/* LinkedIn SVG */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-white group-hover:scale-110 transition-transform"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </div>
            </a>
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
        
        <div className="flex items-center gap-3 md:gap-5">
          <ThemeToggle theme={theme} toggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />
          
          {user ? (
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 8px 4px 12px',
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
                  style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--sam-glass-border)', objectFit: 'cover' }}
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
                className="hidden md:flex h-10 items-center gap-2 rounded-xl border px-4 transition-all duration-300"
                style={{ 
                  background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
                  borderColor: theme === 'light' ? '#E2E8F0' : 'rgba(255,255,255,0.05)',
                  boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                <History className={`h-4 w-4 ${theme === 'light' ? 'text-slate-500' : 'text-white/60'}`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-slate-600' : 'text-white/80'}`}>History</span>
              </button>
            )}
            
            <button 
              onClick={() => setShowShortcutsHelp(true)}
              className="group flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300"
              style={{ 
                background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
                borderColor: theme === 'light' ? '#E2E8F0' : 'rgba(255,255,255,0.05)',
                boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
              }}
              title="Keyboard Shortcuts"
            >
              <Keyboard className={`h-5 w-5 transition-colors ${theme === 'light' ? 'text-slate-400 group-hover:text-slate-900' : 'text-white/50 group-hover:text-white'}`} />
            </button>

            <button 
              onClick={() => setShowAiPanel(!showAiPanel)}
              className="group flex h-10 items-center gap-2 rounded-xl border px-4 transition-all duration-300"
              style={{ 
                background: showAiPanel ? (theme === 'light' ? '#F8FAFC' : 'rgba(255,255,255,0.1)') : (theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)'),
                borderColor: showAiPanel ? 'var(--sam-accent)' : (theme === 'light' ? '#E2E8F0' : 'rgba(255,255,255,0.05)'),
                color: showAiPanel ? 'var(--sam-accent)' : (theme === 'light' ? '#475569' : 'rgba(221,226,241,0.6)'),
                boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              <Sparkles className={`h-4 w-4 ${showAiPanel ? 'animate-pulse' : (theme === 'light' ? 'text-slate-400' : 'text-white/60')}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-inherit">Sam AI</span>
            </button>
          </div>

          <div className="flex md:hidden">
            <button onClick={() => setActiveModal('settings')} style={{ padding: 8, background: 'none', border: 'none', color: 'rgba(221,226,241,0.3)', cursor: 'pointer' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex md:hidden h-12 shrink-0" style={{ borderBottom: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface-low)' }}>
        <button
          onClick={() => setActiveMobileTab('editor')}
          className="relative flex-1 flex items-center justify-center gap-2"
          style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em',
            color: activeMobileTab === 'editor' ? 'var(--sam-accent)' : 'var(--sam-text-dim)',
            background: activeMobileTab === 'editor' ? 'var(--sam-accent-muted)' : 'transparent',
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
        className={`flex flex-1 overflow-hidden transition-all duration-500 ease-in-out ${showAiPanel ? 'md:pr-[450px] lg:pr-[500px]' : ''}`}
      >
        <main className="relative z-10 flex flex-1 flex-col md:flex-row overflow-hidden p-3 md:p-6 gap-0 transition-all duration-500">
          {/* EDITOR SECTION */}
          <section 
            className={`flex flex-col overflow-hidden ${activeMobileTab === 'editor' ? 'flex-1' : 'hidden'} md:flex`}
            style={{ width: `${leftPanelWidth}%`, flex: `0 0 ${leftPanelWidth}%` }}
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
                  key={sessionId}
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
            style={{ width: `${100 - leftPanelWidth}%`, flex: `0 0 ${100 - leftPanelWidth}%` }}
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
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: runStatus === 'Succeeded' ? 'var(--sam-text)' : runStatus === 'Failed' ? 'var(--sam-text-dim)' : busy ? 'var(--sam-accent)' : 'var(--sam-glass-border)',
                    boxShadow: runStatus === 'Succeeded' ? '0 0 10px var(--sam-text)' : busy ? '0 0 10px var(--sam-accent)' : 'none',
                    animation: busy ? 'sam-pulse 1s infinite' : 'none',
                    transition: 'all 0.5s',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>
                    {isWorkerOnline ? 'Terminal' : 'Cloud Output'}
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
                <div style={{ fontSize: 9, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.25em', color: runStatus === 'Failed' ? 'var(--sam-text)' : 'var(--sam-text-muted)', fontFamily: 'var(--font-body)' }}>{runStatus}</div>
              </div>
              
              <div className={`flex-1 overflow-hidden p-2 md:p-5 relative ${theme === 'light' ? 'bg-[#F1F5F9]' : 'bg-[#000000]'}`}>
                <div ref={terminalRef} className="h-full w-full overflow-hidden" />
                
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
        </main>
      </div>

      {/* Fixed Terminal Dashboard Footer */}
      <footer className={`fixed bottom-0 left-0 right-0 z-50 flex h-12 items-center justify-between px-6 transition-all duration-300 border-t ${
        theme === 'dark' 
          ? 'bg-black/90 border-[#ff3b3b]/10 backdrop-blur-md' 
          : 'bg-white/95 border-blue-100 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.1)] backdrop-blur-md'
      }`}>
        {/* Top Accent Bar */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${
          theme === 'dark' 
            ? 'bg-gradient-to-r from-transparent via-[#ff3b3b] to-transparent shadow-[0_0_12px_rgba(255,59,59,0.4)]' 
            : 'bg-gradient-to-r from-transparent via-blue-500 to-transparent'
        }`} />

        <div className="flex items-center gap-6 h-full">
          <div className="flex items-center gap-3">
            <div className={`relative flex items-center justify-center`}>
              <div className={`absolute h-2.5 w-2.5 animate-ping rounded-full opacity-40 ${isApiOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <div className={`h-1.5 w-1.5 rounded-full ${isApiOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'}`} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
              theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
            }`}>
              {isApiOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className={`h-4 w-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-200'}`} />

          <div className="hidden items-center gap-3 md:flex">
             <div className={`h-1.5 w-1.5 rounded-full ${
               theme === 'dark' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-amber-600'
             }`} />
             <span className={`text-[10px] font-bold uppercase tracking-widest ${
               theme === 'dark' ? 'text-amber-400/80' : 'text-amber-700'
             }`}>
               {activeLangId}
             </span>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <a 
            href="https://linkedin.com/in/syedmukheeth" 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`group flex items-center gap-3 transition-all active:scale-95`}
          >
            <span className={`hidden text-[9px] font-black uppercase tracking-[0.15em] opacity-40 group-hover:opacity-100 transition-opacity lg:inline ${
              theme === 'dark' ? 'text-white' : 'text-slate-900'
            }`}>
              BUILT BY
            </span>
            <div className={`flex items-center gap-2 rounded-lg py-1.5 px-3 transition-colors ${
               theme === 'dark' 
                 ? 'bg-white/5 border border-white/5 hover:bg-[#ff3b3b]/10 hover:border-[#ff3b3b]/20 hover:text-[#ff3b3b]' 
                 : 'bg-blue-50 border border-blue-100 hover:bg-blue-600 hover:text-white'
            }`}>
              {/* Linkedin SVG Placeholder */}
              <svg className={`h-3 w-3 ${theme === 'dark' ? 'text-[#ff3b3b]' : 'text-blue-500'} fill-current group-hover:text-inherit`} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              <span className={`text-[10px] font-black uppercase tracking-wider`}>
                SYED MUKHEETH
              </span>
            </div>
          </a>

          <div className={`h-4 w-[1px] hidden sm:block ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-200'}`} />

          <span className={`hidden text-[9px] font-black uppercase tracking-[0.2em] opacity-30 sm:block ${
            theme === 'dark' ? 'text-white' : 'text-slate-900'
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
              className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#0e131e] p-8 shadow-2xl"
            >
              <h3 className="mb-6 flex items-center gap-3 text-lg font-black uppercase tracking-[0.2em] text-white">
                 <Keyboard className="h-5 w-5 text-white" />
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
