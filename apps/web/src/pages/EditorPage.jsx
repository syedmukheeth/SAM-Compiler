import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import CodeEditor from "../components/CodeEditor";
import LanguageSelector from "../components/LanguageSelector";
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket } from "../services/socketClient";
import { parseErrors } from "../services/errorParser";

// ⚡ LAZY LOAD PERFORMANCE HYDRATION (Code-Splitting)
const SettingsModal = React.lazy(() => import("../components/SettingsModal"));
const AuthModal     = React.lazy(() => import("../components/AuthModal"));
const UpgradeModal  = React.lazy(() => import("../components/UpgradeModal"));
const HistoryPanel  = React.lazy(() => import("../components/HistoryPanel"));
const AiPanel       = React.lazy(() => import("../components/AiPanel"));
const FeedbackModal = React.lazy(() => import("../components/FeedbackModal"));
const AboutModal    = React.lazy(() => import("../components/AboutModal"));

import StatusBar from "../components/StatusBar";
import { useAuth } from "../hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";

import { 
  Sparkles, Keyboard, Clock, Menu, X, Play, Check, RotateCcw, 
  CircleHelp, Loader2, Code2, Terminal as TerminalIcon 
} from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from "framer-motion";
import ENDPOINTS from "../services/endpoints";
import OfficialLogo, { OFFICIAL_LOGO_WHITE, OFFICIAL_LOGO_BLACK } from "../components/OfficialLogo";
import analytics from "../services/metrics";

// Standalone components imported for clean scoping
import ThemeToggle from "../components/ThemeToggle";
import SamNavLogo from "../components/SamNavLogo";
import ShortcutItem from "../components/ShortcutItem";
import MobileTabNav from "../components/MobileTabNav";

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
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem('sam_is_guest') === '1');

  // Clear guest flag when a real user logs in
  useEffect(() => {
    if (user) {
      localStorage.removeItem('sam_is_guest');
      setIsGuest(false);
    }
  }, [user]);
  // --- 2. State Hooks ---
  const [activeLangId, setActiveLangId] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem("sam_active_lang") || "cpp";
    }
    return "cpp";
  });

  const [buffers, setBuffers] = useState(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem("sam_code_buffers");
        if (saved) return JSON.parse(saved);
      }
    } catch (e) {}
    return Object.fromEntries(Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.template]));
  });
  const [isColdStarting, setIsColdStarting] = useState(false);
  const [runStatus, setRunStatus] = useState("Ready");
  const [theme, setTheme] = useState(() => localStorage.getItem('sam-theme') || 'dark');
  const [busy, setBusy] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [engineMode, setEngineMode] = useState("preparing");
  const [failSafeActive, setFailSafeActive] = useState(false);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [showStatusBanner, setShowStatusBanner] = useState(true);
  const [activeMobileTab, setActiveMobileTab] = useState('editor');
  const [errorMarkers, setErrorMarkers] = useState([]);
  const stdErrRef = useRef("");
  const [editorWidth, setEditorWidth] = useState(() => Number(localStorage.getItem('sam-editor-width')) || 50);
  const [terminalWidth, setTerminalWidth] = useState(() => Number(localStorage.getItem('sam-terminal-width')) || 33.33);
  const [aiWidth, setAiWidth] = useState(() => Number(localStorage.getItem('sam-ai-width-pct')) || 33.33);
  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const [isResizingAi, setIsResizingAi] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [pyodide, setPyodide] = useState(null);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stdin, setStdin] = useState("");
  const [showInputPanel, setShowInputPanel] = useState(true);
  
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
  const hasReceivedOutputRef = useRef(false);
  const isMounted = useRef(true);

  // --- 4. Logic & Memoization ---

  const writeTypewriter = useCallback(async (term, text, speed = 5) => {
    if (!term) return;
    for (const char of text) {
      term.write(char);
      if (speed > 0) await new Promise(resolve => setTimeout(resolve, speed));
    }
  }, []);

  // --- Helpers & Logic ---

  const sessionId = useMemo(() => {
    const s = searchParams.get("session");
    const raw = (s && s !== "default") ? s : "default";
    return `${raw}::${activeLangId}`;
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

  // 🛰️ DIAGNOSTIC ENGINE: Render line with high-fidelity colorization
  const renderDiagnosticLine = useCallback((line, hasError) => {
    if (!line) return "";
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";
    const bold = "\x1b[1m";
    const red = "\x1b[31m";
    const white = "\x1b[37m";
    const boldRed = "\x1b[1;31m";
    
    // GCC/Clang Error Format: file:line:col: error: message
    const gccRegex = /^([^:\n]+):(\d+):(?:(\d+):)?\s+(error|warning|fatal error):\s+(.*)/i;
    const gccMatch = line.match(gccRegex);
    
    if (gccMatch) {
      const [_, file, lineNum, colNum, type, msg] = gccMatch;
      const isError = type.toLowerCase().includes('error');
      const typeColor = isError ? boldRed : "\x1b[1;33m";
      return `${dim}${file}:${lineNum}${colNum ? `:${colNum}` : ""}:${reset} ${typeColor}${type}:${reset} ${white}${msg}${reset}\r\n`;
    }

    // Caret/Arrow highlighting (GCC style)
    if (line.trim().startsWith('|') || line.includes('^')) {
      return `${white}${line}${reset}\r\n`;
    }

    // Python Traceback styling
    if (line.includes('File "') && line.includes('line')) {
      return `${white}${line}${reset}\r\n`;
    }

    // Default error/standard output
    if (hasError) return `${white}${line}${reset}\r\n`;
    return `${line}\r\n`;
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
    if (busy) return;
    const code = buffers[activeLangId];
    const language = languageConfigs[activeLangId].lang;
    
    // 🛡️ REBOOT DIAGNOSTICS: Clear previous state
    setErrorMarkers([]);
    setPendingAiPrompt(null);
    setRunStatus("Starting...");
    setBusy(true);
    hasReceivedOutputRef.current = false;
    stdErrRef.current = "";
    
    // 🔥 PREMIUM TERMINAL UX: Boot Sequence
    // 🔥 GCC-STYLE TERMINAL BOOT
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.write(`📡 \x1b[1;36m[SAM] REQUESTING CLOUD RUNTIME...\x1b[0m\r\n`);
      xtermRef.current.write(`📦 \x1b[1;36m[SAM] CONFIGURING SANDBOX [DOCKER]...\x1b[0m\r\n`);
      xtermRef.current.write(`🚀 \x1b[1;36m[SAM] EXECUTION START.\x1b[0m\r\n\r\n`);
    }

    if (isMobile) {
      setActiveMobileTab('terminal');
      setShowAiPanel(false);
    }
    
    setBusy(true);
    hasReceivedOutputRef.current = false;
    setErrorMarkers([]);
    stdErrRef.current = "";
    analytics.trackCodeRun(activeLangId, null); 
    
    const socket = getSocket(token);
    if (runRef.current.jobId && socket) {
      socket.emit("unsubscribe", { jobId: runRef.current.jobId });
      socket.off("exec:log");
    }
    
    if (xtermRef.current) {
      xtermRef.current.reset();
      xtermRef.current.write("\x1b[2J\x1b[0;0H");
    }
    setRunStatus("Running");

    if (socket && !socket.connected && activeLangId !== "python") {
      try {
        await new Promise((resolve) => {
          // 🕒 AGGRESSIVE WAKEUP: Increase timeout to 10s for cold starts
          const timeout = setTimeout(() => {
            if (socket) socket.off("connect", onConnect);
            console.warn("[SAM] Socket connection timed out during cold start, falling back to polling.");
            resolve(); 
          }, 10000);
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
      const { jobId } = await submitRun({ language, code, stdin });
      runRef.current.jobId = jobId;
      
      const sendSubscription = () => socket && socket.emit("subscribe", { jobId });
      if (socket) {
        if (!socket.connected) {
          socket.once("connect", sendSubscription);
          socket.connect();
        } else {
          sendSubscription();
        }
      }

      const onLog = (evt) => {
        if (!evt || runRef.current.jobId !== jobId) return;
        
        if (evt.type === "stdout" || evt.type === "stderr") {
           const content = evt.chunk || "";
           if (content.trim()) {
             hasReceivedOutputRef.current = true;
           }
           if (xtermRef.current) {
             if (evt.type === "stdout") xtermRef.current.write(content.replace(/\n/g, "\r\n"));
             else {
               // Apply high-fidelity diagnostic rendering line by line
               const lines = content.split('\n');
               lines.forEach((l, idx) => {
                  if (idx === 0 && !stdErrRef.current) {
                    xtermRef.current.write(`\x1b[1;31mERROR!\x1b[0m\r\n\r\n`);
                  }
                  xtermRef.current.write(renderDiagnosticLine(l, true));
               });
               stdErrRef.current += content;
             }
           }
        }

        if (evt.type === "end") {
          const { status: jobStatus, metrics } = evt.chunk || {};
          const success = jobStatus === "succeeded";
          
          if (!hasReceivedOutputRef.current && xtermRef.current && success) {
             xtermRef.current.write("\r\n\x1b[1;33m[SYSTEM] Program finished with no output.\x1b[0m\r\n");
          }

          if (xtermRef.current) {
            const reset = '\x1b[0m';
            const boldRed = '\x1b[1;31m';
            const boldGreen = '\x1b[1;32m';
            
            if (success) {
              xtermRef.current.write(`\r\n\x1b[1;32m=== Program Finished Successfully ===\x1b[0m\r\n`);
            } else {
              xtermRef.current.write(`\r\n\x1b[1;31m=== Code Exited With Errors ===\x1b[0m\r\n`);
            }
          }

          setRunStatus(jobStatus === 'succeeded' ? 'Succeeded' : (jobStatus ? jobStatus.toUpperCase() : 'Failed'));
          
          // 🛰️ DIAGNOSTIC ENGINE: Surface errors and warnings
          const { markers: diags, primaryLine, summary } = parseErrors(stdErrRef.current || "", activeLangId);
          if (diags.length > 0) {
            setErrorMarkers(diags);
            if (window.samEditor && primaryLine) {
              window.samEditor.revealLineInCenter(primaryLine);
            }
            if (!success && summary) {
              setPendingAiPrompt(`Explain and fix this error in my ${activeLangId} code:\n\n\`\`\`\n${summary}\n\`\`\``);
            }
          }

          analytics.trackCodeRun(activeLangId, success);
          setBusy(false);
        }
      };

      if (socket) socket.on("exec:log", onLog);

      const finalState = await pollUntilDone(jobId, {
        onUpdate: (s) => {
          if (runRef.current.jobId !== jobId) return;
          const statusMap = {
            'queued': 'QUEUED',
            'processing': 'COMPILING',
            'executing': 'EXECUTING',
            'succeeded': 'SUCCESS',
            'failed': 'RETRY'
          };
          setRunStatus(statusMap[s.status.toLowerCase()] || s.status.toUpperCase());
        }
      });

      // 🛡️ FALLBACK: If socket was silent (no output received), render from poll result
      if (!hasReceivedOutputRef.current && finalState && xtermRef.current) {
        const stdout = finalState.stdout || "";
        const stderr = finalState.stderr || "";
        if (stdout.trim()) {
          hasReceivedOutputRef.current = true;
          xtermRef.current.write(stdout.replace(/\n/g, "\r\n"));
        }
        if (stderr.trim()) {
          hasReceivedOutputRef.current = true;
          xtermRef.current.write(`\x1b[1;31mERROR!\x1b[0m\r\n\r\n`);
          const lines = stderr.split('\n');
          lines.forEach(l => {
            xtermRef.current.write(renderDiagnosticLine(l, true));
          });
          stdErrRef.current += stderr;
        }
        // If truly empty
        if (!hasReceivedOutputRef.current && finalState.status === 'succeeded') {
          xtermRef.current.write("\r\n\x1b[1;33m[SYSTEM] Program finished with no output.\x1b[0m\r\n");
        }
        // Write summary
        const success = finalState.status === 'succeeded';
        const reset = '\x1b[0m';
        
        if (success) {
          xtermRef.current.write(`\r\n\x1b[1;32m=== Program Finished Successfully ===\x1b[0m\r\n`);
        } else {
          xtermRef.current.write(`\r\n\x1b[1;31m=== Code Exited With Errors ===\x1b[0m\r\n`);
        }
        setRunStatus(finalState.status === 'succeeded' ? 'Succeeded' : (finalState.status.toUpperCase()));

        // 🛰️ FALLBACK DIAGNOSTIC ENGINE
        const { markers: diags, primaryLine, summary } = parseErrors(stdErrRef.current || "", activeLangId);
        if (diags.length > 0) {
          setErrorMarkers(diags);
          if (window.samEditor && primaryLine) {
            window.samEditor.revealLineInCenter(primaryLine);
          }
          if (finalState.status !== 'succeeded' && summary) {
            setPendingAiPrompt(`Explain and fix this error in my ${activeLangId} code:\n\n\`\`\`\n${summary}\n\`\`\``);
          }
        }
        setBusy(false);
      }

      if (socket) {
        socket.off("exec:log", onLog);
        socket.emit("unsubscribe", { jobId });
      }

      // 🕒 PERSISTENT GUEST HISTORY ENGINE
      if (!user && finalState) {
        try {
          const guestHistoryRaw = localStorage.getItem("sam_guest_history");
          const guestHistory = guestHistoryRaw ? JSON.parse(guestHistoryRaw) : [];
          const newRun = {
            _id: jobId,
            runtime: language,
            status: finalState.status,
            createdAt: new Date().toISOString(),
            files: [{ content: code }],
            stdout: finalState.stdout,
            stderr: finalState.stderr,
            metrics: { duration: finalState.duration || 0 }
          };
          // Preserve last 20 sessions for guests
          const updatedHistory = [newRun, ...guestHistory].slice(0, 20);
          localStorage.setItem("sam_guest_history", JSON.stringify(updatedHistory));
        } catch (e) {
          console.warn("Failed to save guest history", e);
        }
      }
    } catch (e) {
      setRunStatus("Failed");
      const rawMsg = e?.message || String(e);
      const isHtml = /<[a-z][\s\S]*>/i.test(rawMsg);
      const cleanMsg = isHtml 
        ? "Server returned an invalid response (HTML). The engine might be under maintenance." 
        : rawMsg.substring(0, 200);
        
      if (xtermRef.current) xtermRef.current.write(`\x1b[1;31mError: ${cleanMsg}\x1b[0m\r\n`);
      setPendingAiPrompt(`Explain this error I'm getting from the SAM Compiler engine:\n\n${cleanMsg}\n\nIs this an issue with my code or the server?`);
    } finally {
      setBusy(false);
    }
  }, [activeLangId, buffers, busy, token, isMobile, runPythonInBrowser, stdin]);

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
    
    // Performance: Use requestAnimationFrame for layout updates
    requestAnimationFrame(() => {
      const containerRect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const pct = (x / containerRect.width) * 100;
      
      if (pct > 15 && pct < (showAiPanel ? 100 - aiWidth - 15 : 85)) {
        setEditorWidth(pct);
        localStorage.setItem('sam-editor-width', pct.toString());
      }
    });
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
    
    requestAnimationFrame(() => {
      const containerRect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const pct = 100 - ((x / containerRect.width) * 100);
      
      if (pct > 15 && pct < 100 - editorWidth - 15) {
        setAiWidth(pct);
        localStorage.setItem('sam-ai-width-pct', pct.toString());
      }
    });
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
  
  // Persistence for Active Language
  useEffect(() => {
    localStorage.setItem("sam_active_lang", activeLangId);
  }, [activeLangId]);

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

  useEffect(() => {
    // Proactive Socket Initialization (Zero-Lag Handshake)
    // Note: The listener in the second useEffect handles the actual status state management
    getSocket(token);
  }, [token]);

  // Health check for worker availability (Backend sanity) & ADAPTIVE HEARTBEAT
  useEffect(() => {
    let failSafeTimer = null;
    
    const checkStatus = async () => {
      if (!navigator.onLine) { 
        setIsEngineReady(false);
        setEngineMode("offline");
        return; 
      }
      try {
        // 🔥 WAKE UP PING: Proactively trigger Render cold-start wakeup
        // We ping the root and the health check as early as possible
        const API_BASE = ENDPOINTS.WS_ENDPOINT;
        fetch(API_BASE).catch(() => {}); // Fire and forget root ping

        const res = await fetch(`${API_BASE}/api/runs/health/queue`);
        const data = await res.json();
        
        setIsEngineReady(data.canExecute || data.workerOnline);
        setIsWorkerOnline(data.workerOnline);
        setEngineMode(data.workerOnline ? "primary" : data.canExecute ? "sandbox" : "preparing");
        
        if (data.canExecute || data.workerOnline) {
          if (failSafeTimer) clearTimeout(failSafeTimer);
          setFailSafeActive(false);
        }
      } catch (err) {
        // Transient network failure? Don't panic immediately unless navigator.onLine is false
        if (!navigator.onLine) {
          setIsEngineReady(false);
          setEngineMode("offline");
        } else if (!failSafeActive) {
          // If we are online but the check fails, it might be a server-side waking state
          setIsEngineReady(false);
          setEngineMode("preparing");
        }
      }
    };

    // 🛡️ FAIL-SAFE: If engine isn't ready in 12s, allow sandbox anyway
    failSafeTimer = setTimeout(() => {
      if (!isEngineReady) {
        console.warn("⚠️ [SAM-SYSTEM] Fail-safe triggered: Engine took >12s. Defaulting to Sandbox.");
        setIsEngineReady(true);
        setEngineMode("sandbox");
        setFailSafeActive(true);
      }
    }, 12000);

    checkStatus();
    const interval = setInterval(checkStatus, isEngineReady ? 180000 : 5000);
    
    return () => {
      clearInterval(interval);
      if (failSafeTimer) clearTimeout(failSafeTimer);
    };
  }, [isEngineReady, token]);

  // Persist buffers to localStorage
  useEffect(() => {
    localStorage.setItem("sam_code_buffers", JSON.stringify(buffers));
  }, [buffers]);

  // Theme synchronization
  useEffect(() => {
    if (theme === "light") document.documentElement.classList.add("light");
    else document.documentElement.classList.remove("light");
    localStorage.setItem("sam-theme", theme);
  }, [theme]);

  // Debounced Responsive logic
  useEffect(() => {
    let timeoutId = null;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth < 1024);
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Lifecycle safety
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Socket status monitoring with Stability Timer
  useEffect(() => {
    getSocket(token);
    
    let stabilityTimer = null;
    let flickerTimer = null;

    const handleStatusUpdate = (e) => {
      const newStatus = e.detail.status;
      
      // Flickering prevention for disconnects
      if (newStatus === "reconnecting" || newStatus === "failed") {
        if (flickerTimer) clearTimeout(flickerTimer);
        flickerTimer = setTimeout(() => {
          setSocketStatus(newStatus);
          setShowStatusBanner(true);
        }, 1200); // Wait 1.2s before showing "Reconnecting" UI
        return;
      }

      // If we are now healthy
      if (newStatus === "connected") {
        if (flickerTimer) clearTimeout(flickerTimer);
        setSocketStatus(newStatus);
        
        // Auto-hide banner after 5 seconds of stability
        if (stabilityTimer) clearTimeout(stabilityTimer);
        stabilityTimer = setTimeout(() => {
          setShowStatusBanner(false);
        }, 5000);
      } else {
        // Any other state (connecting, waking)
        if (flickerTimer) clearTimeout(flickerTimer);
        setSocketStatus(newStatus);
        setShowStatusBanner(true);
      }
    };

    window.addEventListener("sam:socket:status", handleStatusUpdate);
    
    // 🔥 VIEWPORT & ORIENTATION SYNC: Force Monaco resize on orientation/tab changes
    const handleViewportSync = () => {
      window.dispatchEvent(new Event('resize'));
    };
    window.addEventListener("orientationchange", handleViewportSync);
    
    return () => {
      if (stabilityTimer) clearTimeout(stabilityTimer);
      if (flickerTimer) clearTimeout(flickerTimer);
      window.removeEventListener("sam:socket:status", handleStatusUpdate);
      window.removeEventListener("orientationchange", handleViewportSync);
    };
  }, [token, activeMobileTab]); // Sync on tab switch too

  // Resubscribe Guardian: Pick up lost streams after reconnection
  useEffect(() => {
    if (socketStatus === "connected" && busy && runRef.current.jobId) {
      try {
        const socket = getSocket(token);
        if (socket) {
          console.log(`🛡️ [SAM] Connection recovered. Resubscribing to active job: ${runRef.current.jobId}`);
          socket.emit("subscribe", { jobId: runRef.current.jobId });
        }
      } catch (err) {
        console.warn("⚠️ [SAM] Resubscribe failed:", err);
      }
    }
  }, [socketStatus, busy]);

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

  // Safe Terminal Refit: Defense against dimension errors during layout shifts
  const safeFit = useCallback(() => {
    if (xtermRef.current && fitAddonRef.current) {
      try {
        // Only fit if terminal is attached to DOM and container is visible
        const termElement = terminalRef.current;
        if (termElement && termElement.offsetParent !== null) {
          fitAddonRef.current.fit();
          xtermRef.current.refresh(0, xtermRef.current.rows - 1); // 🔥 FORCE RENDER
        }
      } catch (err) {
        // Silent catch for transient dimension errors during layout transitions
      }
    }
  }, []);

  // Terminal (XTerm.js) initialization
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;
    const isDark = theme === "dark";
    const term = new XTerm({
      allowTransparency: true,
      theme: {
        background: isDark ? '#0A0A0A' : '#FAFAFA',
        foreground: isDark ? '#FFFFFF' : '#0F172A',
        cursor: isDark ? '#FFFFFF' : '#0F172A',
        selectionBackground: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(15, 23, 42, 0.15)',
        black: isDark ? '#1A1A1A' : '#000000',
        red: isDark ? '#FF3B3B' : '#DC2626',
        green: isDark ? '#10B981' : '#059669',
        yellow: isDark ? '#FBBF24' : '#D97706',
        blue: isDark ? '#60A5FA' : '#2563EB',
        magenta: isDark ? '#F472B6' : '#DB2777',
        cyan: isDark ? '#22D3EE' : '#0891B2',
        white: isDark ? '#FFFFFF' : '#0F172A',
      },
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      lineHeight: 1.5,
      letterSpacing: 0.4,
      fontWeight: 500,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    // 🛠️ DEFENSE: Delayed fit to allow browser layout calculation
    setTimeout(() => {
      try {
        if (terminalRef.current && terminalRef.current.offsetParent !== null) {
          fitAddon.fit();
        }
      } catch (e) {
        console.warn("Terminal initial fit failed, will retry on resize.");
      }
    }, 100);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      if (runRef.current.jobId) getSocket().emit("exec:input", { jobId: runRef.current.jobId, input: data });
    });

    // ⚡ ELITE RESIZE WATCHER: Ensure terminal reflows perfectly when panels shift
    const resizeObserver = new ResizeObserver(() => {
      if (term && fitAddon) {
        try {
          if (terminalRef.current && terminalRef.current.offsetParent !== null) {
            fitAddon.fit();
          }
        } catch (e) {}
      }
    });
    if (terminalRef.current) resizeObserver.observe(terminalRef.current);

    window.addEventListener('resize', safeFit);
    return () => {
      window.removeEventListener('resize', safeFit);
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, [theme, safeFit]);

  // Consolidate layout fit on change
  useEffect(() => {
    const delay = isMobile ? 300 : 100; // 🕒 LONGER DELAY for mobile tab transitions
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      // ⚡ EXPLICIT MONACO LAYOUT: Force editor to re-calculate dimensions
      if (window.samEditor && (!isMobile || activeMobileTab === 'editor')) {
        window.samEditor.layout();
      }
      safeFit();
    }, delay);
    return () => clearTimeout(timer);
  }, [editorWidth, aiWidth, showAiPanel, activeMobileTab, isMobile, safeFit]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onRun(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "l") { e.preventDefault(); onClear(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowAiPanel(prev => {
          const opening = !prev;
          if (opening) {
            if (isMobile) setActiveMobileTab('ai');
            else setEditorWidth(33.33);
          } else {
            if (!isMobile) setEditorWidth(50);
          }
          return opening;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRun]);

  // Settings management moved to top to satisfy hook ordering rules



  return (
    <div className={`relative flex h-screen h-[100dvh] w-full flex-col overflow-hidden selection:bg-white/10 ${isMobile ? 'pb-[88px]' : ''}`} style={{ background: 'var(--sam-bg)' }}>
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      {/* MOBILE COMPACT HEADER */}
      <header
        className="flex lg:hidden h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl z-[80] safe-top"
        style={{
          background: theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)',
          borderBottomColor: 'var(--sam-glass-border)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <OfficialLogo theme={theme} size={28} />
          <div className="flex flex-col leading-none">
            <span className="font-black tracking-tight text-[15px] uppercase italic" style={{ fontFamily: 'var(--font-display)', color: 'var(--sam-text)' }}>SAM</span>
            <span className="text-[8px] font-black uppercase tracking-[0.35em] opacity-40 -mt-0.5" style={{ color: 'var(--sam-text)' }}>Compiler</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} toggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />
           <button 
             onClick={() => setActiveModal('about')}
             className="p-2 active:scale-95 transition-transform"
             style={{ color: 'var(--sam-text-dim)' }}
           >
             <CircleHelp className="h-5 w-5" />
           </button>
           <button 
             onClick={() => setMobileMenuOpen(true)}
             className="p-2 active:scale-95 transition-transform"
             style={{ color: 'var(--sam-text-dim)' }}
           >
             <Menu className="h-5 w-5" />
           </button>
        </div>
      </header>

      {/* MOBILE SLIDE-DOWN MENU (Universal) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute left-0 right-0 top-14 mt-2 mx-4 p-4 sam-glass dark:bg-black/95 bg-white/95 border-white/5 shadow-2xl z-[150] lg:hidden overflow-hidden"
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
                  onClick={() => { setShowHistory(true); setMobileMenuOpen(false); }}
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

              {!user && !isGuest && (
                 <div className="flex flex-col gap-2">
                   <button 
                    onClick={() => { setActiveModal('auth'); setMobileMenuOpen(false); }}
                    className="w-full sam-button-primary p-4 rounded-xl text-xs font-black uppercase tracking-widest"
                  >
                    Sign In to SAM
                  </button>
                  <button 
                    onClick={() => {
                      localStorage.setItem('sam_is_guest', '1');
                      setIsGuest(true);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full p-4 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 border border-white/5 bg-white/5"
                  >
                    Continue as Guest
                  </button>
                 </div>
              )}
              {!user && isGuest && (
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
            {/* Close Button for mobile menu */}
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-2 text-white/40 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DESKTOP HEADER */}
      <header className="hidden lg:flex relative z-[80] h-14 md:h-16 shrink-0 items-center justify-between px-4 md:px-8 sam-glass !rounded-none !border-x-0 !border-t-0">
        {/* Connection Resilience Banner */}
        {/* Connection banner removed as per user request - StatusBar handles status now */}

        <div className="flex items-center gap-2 md:gap-14 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 transition-all hover:scale-105 sam-nav-header-logo">
              <div className="scale-[0.7] sm:scale-100 origin-left">
                <SamNavLogo theme={theme} />
              </div>
              <div className={`flex flex-col leading-[0.9] mt-1 relative scale-[0.75] sm:scale-100 origin-left -ml-1 sm:ml-0 ${isMobile ? 'hidden sm:flex' : 'flex'}`}>
                <span className="font-black tracking-tight text-[16px] sm:text-[18px] uppercase italic" style={{ fontFamily: 'var(--font-display)', color: 'var(--sam-text)' }}>SAM</span>
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.35em] opacity-40 ml-0.5" style={{ color: 'var(--sam-text)' }}>Compiler</span>
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
                  className={`relative px-0 py-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:text-[var(--sam-accent)] ${
                    isActive ? 'text-[var(--sam-accent)]' : 'text-[var(--sam-text-dim)]'
                  }`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
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
            ) : isGuest ? (
              <div 
                className="flex items-center p-1 pl-4 rounded-full border transition-all shadow-sm"
                style={{ 
                  borderColor: 'var(--sam-glass-border)',
                  background: 'var(--sam-surface-low)'
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full shadow-sm" style={{ background: 'var(--sam-text-dim)' }}></div>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--sam-text-dim)' }}>Guest</span>
                </div>
                <div className="h-3 w-[1px] mx-3" style={{ background: 'var(--sam-glass-border)' }}></div>
                <button
                  id="signin-btn"
                  onClick={() => setActiveModal('auth')}
                  className="flex items-center justify-center rounded-full px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] transition-all hover:scale-[1.03] active:scale-[0.97] shadow-sm"
                  style={{ 
                    background: 'var(--sam-accent)',
                    color: 'var(--sam-bg)'
                  }}
                >
                  Sign In
                </button>
              </div>
            ) : (
              <button
                id="signin-btn"
                onClick={() => setActiveModal('auth')}
                className="sam-button-primary h-8 px-4 text-[9px] font-black uppercase tracking-wider rounded-md"
              >
                Sign In
              </button>
            )}
            
            <div className={`sam-engine-indicator ${engineMode === 'primary' ? 'is-live' : engineMode === 'sandbox' ? 'is-fallback' : 'is-preparing'}`}>
                <div className="indicator-dot"></div>
                <span className="indicator-text">
                  {engineMode === 'primary' ? 'ENGINE LIVE' : 
                   engineMode === 'sandbox' ? 'CLOUD SANDBOX' : 
                   'PREPARING ENGINE'}
                </span>
              </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3">
            <button 
              onClick={() => {
                const next = !showAiPanel;
                setShowAiPanel(next);
                if (isMobile) {
                  if (next) setActiveMobileTab('ai');
                } else {
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
              <Sparkles className={`h-4 w-4 pointer-events-none ${showAiPanel ? 'animate-pulse' : ''}`} />
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
                id="history-btn"
                onClick={() => setShowHistory(!showHistory)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sam-glass-border)] bg-[var(--sam-surface-low)] text-[var(--sam-text-dim)] transition-all hover:text-white"
              >
                <Clock className="h-5 w-5" />
              </button>
            </div>

            {/* No mobile menu toggle here, use mobile header */}
          </div>
        </div>

      </header>

      {/* MOBILE TAB NAVIGATOR */}
      {isMobile && (
        <MobileTabNav 
          activeTab={activeMobileTab} 
          onTabChange={(tab) => {
            setActiveMobileTab(tab);
            if (tab === 'ai') setShowAiPanel(true);
            else if (!isMobile) setShowAiPanel(false); // Should not happen but for safety
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
          }} 
          theme={theme} 
        />
      )}

      {/* ═══════════════════════════════════════════
          CONTEXTUAL AI TRIGGER — Relocated to Root
          Floats opposite to the Run button
      ══════════════════════════════════════════════ */}
      {/* Floating AI Button Removed - Relocated to Terminal Header */}
      {isMobile && (
        <motion.button
          id="mobile-run-fab"
          onClick={onRun}
          disabled={busy}
          whileTap={{ scale: 0.94, y: 2 }}
          animate={{
            backgroundColor:
              runStatus === 'Succeeded' || runStatus === 'SUCCESS'
                ? 'rgba(16,185,129,1)'
                : runStatus?.toLowerCase().includes('error') ||
                  runStatus?.toLowerCase().includes('fail') ||
                  runStatus === 'Timeout' || runStatus === 'Memory_Limit'
                ? 'rgba(239,68,68,1)'
                : '#FFFFFF',
            color:
              runStatus === 'Succeeded' || runStatus === 'SUCCESS' ||
              runStatus?.toLowerCase().includes('error') ||
              runStatus?.toLowerCase().includes('fail') ||
              runStatus === 'Timeout' || runStatus === 'Memory_Limit'
                ? '#FFFFFF'
                : '#000000',
          }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            bottom: 160, // Increased to clear MobileTabNav (88px) + StatusBar (44px) + Gap
            right: 20,
            zIndex: 200, // Higher than footer and everything else
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 20px',
            height: 44,
            borderRadius: 99,
            border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer',
            boxShadow: '0 12px 40px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.3)',
            minWidth: 100,
            justifyContent: 'center',
            fontFamily: 'var(--font-body)',
            fontWeight: 900,
            fontSize: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <AnimatePresence mode="wait">
            {busy ? (
              <motion.div key="running" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 style={{ width: 13, height: 13, animation: 'spin 0.8s linear infinite' }} />
                <span>Running...</span>
              </motion.div>
            ) : runStatus === 'Succeeded' || runStatus === 'SUCCESS' ? (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check style={{ width: 13, height: 13, strokeWidth: 3 }} />
                <span>Done</span>
              </motion.div>
            ) : runStatus?.toLowerCase().includes('error') || runStatus?.toLowerCase().includes('fail') || runStatus === 'Timeout' || runStatus === 'Memory_Limit' ? (
              <motion.div key="error" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>Error</span>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Play style={{ width: 13, height: 13, fill: 'currentColor' }} />
                <span>Run</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      )}



      <div 
        ref={containerRef}
        className="flex flex-1 overflow-hidden transition-all duration-200 ease-out"
      >
        <main className="relative z-10 flex flex-1 flex-col lg:flex-row overflow-y-auto overflow-x-hidden lg:overflow-hidden p-0 lg:p-6 lg:pb-6 gap-2 lg:gap-0 transition-all duration-200 ease-out">
          {/* EDITOR SECTION */}
          <section 
            className={`flex flex-col overflow-hidden w-full lg:w-auto ${isMobile && activeMobileTab !== 'editor' ? 'hidden' : ''}`}
            style={isMobile ? { flex: '1 1 100%', height: '100%' } : { flexBasis: `${editorWidth}%`, flexGrow: 0, flexShrink: 0 }}
          >
              <div className={`sam-glass flex flex-1 flex-col overflow-hidden ${isMobile ? 'rounded-none border-0' : 'rounded-2xl border'}`}>
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
                {!isMobile && (
                  <motion.button
                    id="editor-run-btn"
                    onClick={onRun}
                    disabled={busy}
                    whileTap={{ scale: 0.95 }}
                    className="sam-button-run transition-all duration-300 flex items-center justify-center min-w-[100px] h-8 rounded-lg border shadow-sm px-4"
                    style={{
                      background: 'var(--sam-accent)',
                      borderColor: theme === 'dark' ? 'transparent' : 'var(--sam-glass-border)',
                      color: 'var(--sam-bg)',
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {runStatus === 'Ready' && (
                        <motion.div key="ready" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                          <Play width={12} height={12} fill="currentColor" />
                          <span className="font-black uppercase tracking-widest text-[10px]">Run</span>
                        </motion.div>
                      )}
                      {(busy || runStatus === 'Running' || runStatus === 'QUEUED' || runStatus === 'COMPILING' || runStatus === 'EXECUTING') && (
                        <motion.div key="busy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                          <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'currentColor', animation: 'spin 0.8s linear infinite' }} />
                          <span className="font-black uppercase tracking-[0.15em] text-[9px]">{runStatus === 'Ready' || runStatus === 'Running' ? 'RUNNING' : runStatus}</span>
                        </motion.div>
                      )}
                      {(runStatus === 'Succeeded' || runStatus === 'SUCCESS') && (
                        <motion.div key="success" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="flex items-center gap-2">
                          <Check width={12} height={12} strokeWidth={4} />
                          <span className="font-black uppercase tracking-widest text-[10px]">Success</span>
                        </motion.div>
                      )}
                      {(!busy && runStatus !== 'Ready' && runStatus !== 'Running' && runStatus !== 'QUEUED' && runStatus !== 'COMPILING' && runStatus !== 'EXECUTING' && runStatus !== 'Succeeded' && runStatus !== 'SUCCESS') && (
                        <motion.div key="retry" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                          <RotateCcw width={12} height={12} strokeWidth={3} />
                          <span className="font-black uppercase tracking-widest text-[10px]">RETRY</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )}
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
                   markers={errorMarkers}
                   options={{
                     fontSize: settings.fontSize,
                     tabSize: settings.tabSize,
                   }}
                />
              </div>
            </div>
          </section>


          {/* SPLITTER 1 (Editor | Terminal) */}

          {!isMobile && (
            <div 
               onMouseDown={startResizingEditor}
               className="hidden lg:flex group relative w-1.5 h-full cursor-col-resize items-center justify-center transition-all hover:bg-white/5 z-30"
            >
              <div className={`h-24 w-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-black/5'} group-hover:bg-white/30 transition-all`} />
            </div>
          )}

          {/* TERMINAL SECTION */}
          <section 
            className={`flex flex-col overflow-hidden sam-terminal-container ${busy ? 'is-active' : ''} w-full lg:w-auto ${isMobile && activeMobileTab !== 'terminal' ? 'hidden' : ''}`}
            style={isMobile ? { flex: '1 1 100%', height: '100%' } : { flex: 1, minWidth: 0 }}
          >
              <div className={`sam-glass flex flex-1 flex-col overflow-hidden ${isMobile ? 'rounded-none border-0' : 'rounded-2xl border'}`} style={{ background: 'var(--sam-surface)' }}>
                <div className="flex h-11 shrink-0 items-center justify-between px-4 md:px-6" style={{ background: 'var(--sam-surface-low)', borderBottom: '1px solid var(--sam-glass-border)' }}>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={() => {
                       const logs = stdErrRef.current || "";
                       navigator.clipboard.writeText(logs);
                       toast.success("Logs copied to clipboard", {
                         style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '10px', fontWeight: 900 }
                       });
                    }}
                    title="Copy Logs"
                    style={{ padding: '5px', background: 'none', border: 'none', color: 'rgba(221,226,241,0.25)', cursor: 'pointer', borderRadius: 6, transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sam-text)'; e.currentTarget.style.background = 'var(--sam-glass-border)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sam-text-dim)'; e.currentTarget.style.background = 'none'; }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  </button>
                  <button
                    onClick={onClear}
                    title="Clear Output"
                    style={{ padding: '5px', background: 'none', border: 'none', color: 'rgba(221,226,241,0.25)', cursor: 'pointer', borderRadius: 6, transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sam-text)'; e.currentTarget.style.background = 'var(--sam-glass-border)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sam-text-dim)'; e.currentTarget.style.background = 'none'; }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <div 
                    className={runStatus?.toLowerCase().includes('error') || runStatus?.toLowerCase().includes('fail') || runStatus?.toLowerCase().includes('timeout') ? 'sam-pulse-glow-red' : ''} 
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: runStatus === 'Succeeded' ? '#10B981' : (runStatus?.toLowerCase().includes('error') || runStatus?.toLowerCase().includes('fail') || runStatus?.toLowerCase().includes('timeout') || runStatus === 'Memory_limit') ? '#FF3B3B' : busy ? 'var(--sam-accent)' : 'var(--sam-glass-border)',
                      boxShadow: runStatus === 'Succeeded' ? '0 0 10px rgba(16,185,129,0.4)' : (runStatus?.toLowerCase().includes('error') || runStatus?.toLowerCase().includes('fail') || runStatus?.toLowerCase().includes('timeout') || runStatus === 'Memory_limit') ? '0 0 20px rgba(255,59,59,0.8)' : busy ? '0 0 10px var(--sam-accent)' : 'none',
                      animation: busy ? 'sam-pulse 1s infinite' : 'none',
                      transition: 'all 0.5s',
                    }} 
                  />
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>
                    CLOUD ENGINE
                  </span>

                  {/* 🤖 INTEGRATED AI DIAGNOSTIC TRIGGER */}
                  <AnimatePresence>
                    {pendingAiPrompt && !showAiPanel && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8, x: -10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: -10 }}
                        onClick={() => {
                          setShowAiPanel(true);
                          if (isMobile) {
                            setActiveMobileTab('ai');
                          } else {
                            setEditorWidth(33.33);
                            setAiWidth(33.33);
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all shadow-[0_0_15px_rgba(59,130,246,0.1)] ml-2"
                      >
                        <Sparkles className="h-3 w-3 animate-pulse pointer-events-none" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Explain Error</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
                <div style={{ fontSize: 10, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.25em', color: runStatus === 'Failed' ? '#FF3B3B' : 'var(--sam-text-muted)', fontFamily: 'var(--font-body)' }}>{runStatus}</div>
              </div>
              
              {/* ─── STDIN INPUT PANEL ─── */}
            <div
              style={{
                borderBottom: '1px solid var(--sam-glass-border)',
                background: 'var(--sam-surface-low)',
                flexShrink: 0,
              }}
            >
              {/* Input panel header/toggle */}
              <button
                onClick={() => setShowInputPanel(prev => !prev)}
                title={showInputPanel ? 'Collapse Input' : 'Expand Input'}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: showInputPanel ? '1px solid var(--sam-glass-border)' : 'none',
                  cursor: 'pointer',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--sam-text-dim)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 7 4 4 20 4 20 7" />
                    <line x1="9" y1="20" x2="15" y2="20" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                  <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text-dim)', fontFamily: 'var(--font-mono)' }}>STDIN / Input</span>
                </div>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="var(--sam-text-dim)" strokeWidth="3"
                  style={{ transform: showInputPanel ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Input textarea */}
              {showInputPanel && (
                <textarea
                  id="stdin-input"
                  value={stdin}
                  onChange={e => setStdin(e.target.value)}
                  placeholder={`Enter program input here...\nEach value on a new line`}
                  spellCheck={false}
                  rows={4}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    minHeight: 76,
                    maxHeight: 180,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--sam-text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.6,
                    padding: '8px 16px',
                    boxSizing: 'border-box',
                    opacity: busy ? 0.45 : 1,
                    cursor: busy ? 'not-allowed' : 'text',
                    transition: 'opacity 0.2s',
                  }}
                  disabled={busy}
                />
              )}
            </div>
            {/* ─── / STDIN INPUT PANEL ─── */}

              {/* Terminal Body */}
              <div className="flex-1 overflow-hidden relative" style={{ background: 'var(--sam-surface)' }}>
                {/* 1. Engine Cold Start Overlay */}
                <AnimatePresence>
                  {isColdStarting && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
                    >
                      <div className="relative mb-6">
                        <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                      </div>
                      <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white">Engine Warming Up</h3>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/40">Spinning up isolated sandbox...</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 2. Actual XTerm Instance Mount Point */}
                <div className="h-full w-full p-3 overflow-hidden">
                  <div ref={terminalRef} id="terminal-container" className="h-full w-full" />
                </div>


                {/* 4. Mobile Execution Overlay */}
                <AnimatePresence>
                  {isMobile && busy && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-[2px] bg-black/5"
                    >
                      <div className="flex items-center gap-3 px-6 py-3 rounded-full border border-white/10 bg-black/80 shadow-2xl">
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Executing...</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
  
              <div className="flex h-8 md:h-10 shrink-0 items-center justify-between px-4 md:px-6" style={{ borderTop: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface-low)' }}>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', opacity: 0.8, fontFamily: 'var(--font-body)' }}>SAM-RUNTIME</span>
                  {!user && (
                    <span className="px-1.5 py-0.5 rounded-sm bg-white/5 border border-white/5 text-[7px] font-black uppercase tracking-widest text-white/30">Guest</span>
                  )}
                </div>
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
            <section 
              className={`flex-col h-full overflow-hidden ${isMobile && activeMobileTab !== 'ai' ? 'hidden' : 'flex'} w-full lg:w-auto`}
              style={isMobile ? { flex: '1 1 100%', height: '100%' } : { flexBasis: `${aiWidth}%`, flexGrow: 0, flexShrink: 0 }}
            >
              <React.Suspense fallback={
                <div className="flex h-full w-full items-center justify-center bg-black/50 backdrop-blur-md rounded-2xl">
                  <div className="sam-spinner w-8 h-8" />
                </div>
              }>
                <AiPanel 
                  isOpen={showAiPanel}
                  onClose={() => {
                    setShowAiPanel(false);
                    if (isMobile) setActiveMobileTab('editor');
                    else {
                      setEditorWidth(50);
                      setAiWidth(33.33);
                    }
                  }}
                  currentCode={buffers[activeLangId]}
                  language={activeLangId}
                  onApplyRefactor={(refactoredCode) => {
                    setBuffers(prev => ({ ...prev, [activeLangId]: refactoredCode }));
                    window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template: refactoredCode } }));
                    if (isMobile) {
                      setActiveMobileTab('editor');
                      toast.success("Refactor Applied!", {
                        style: {
                          background: theme === 'dark' ? '#0A0A0A' : '#FFFFFF',
                          color: theme === 'dark' ? '#FFFFFF' : '#000000',
                          border: '1px solid var(--sam-glass-border)',
                          fontSize: '9px',
                          fontWeight: '900',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em'
                        }
                      });
                    }
                  }}
                  theme={theme}
                  isMobile={isMobile}
                  activeMobileTab={activeMobileTab}
                  initialPrompt={pendingAiPrompt}
                />
              </React.Suspense>
            </section>
          )}
        </main>
      </div>


      <footer 
        className="relative z-[100] flex flex-col shrink-0"
        style={{
          boxShadow: theme === 'dark' 
            ? '0 -8px 30px rgba(255, 0, 0, 0.15)' 
            : '0 -8px 30px rgba(0, 119, 181, 0.15)',
        }}
      >
        {/* Neon Gradient Line at the top of the footer */}
        <div 
          className="absolute top-0 left-0 right-0 h-[2px]" 
          style={{ 
            background: theme === 'dark' 
              ? 'linear-gradient(90deg, transparent, rgba(255,0,0,1), transparent)' 
              : 'linear-gradient(90deg, transparent, rgba(0,119,181,1), transparent)' 
          }} 
        />
        {/* Mobile Tab Navigator (Bottom Integrated) */}

        <StatusBar 
          language={activeLangId.toUpperCase()}
          socketStatus={socketStatus}
          showBanner={showStatusBanner}
          onReportBug={() => setIsFeedbackModalOpen(true)}
          onShowAbout={() => setActiveModal('about')}
          theme={theme}
          busy={busy}
        />
      </footer>

      <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />


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
              className={`relative w-full max-w-sm rounded-[32px] border p-8 shadow-2xl backdrop-blur-2xl sam-modal-mobile-center ${
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

      {/* PERSISTENT MODALS (LAZY LOADED) */}
      <React.Suspense fallback={null}>
        <AuthModal 
          isOpen={activeModal === 'auth'} 
          onClose={() => setActiveModal(null)} 
          onLogin={loginUser} 
          theme={theme} 
        />
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
        <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />
        <AboutModal isOpen={activeModal === 'about'} onClose={() => setActiveModal(null)} theme={theme} />
      </React.Suspense>
      
      <Toaster position="bottom-right" reverseOrder={false} />
    </div>
  );
}
