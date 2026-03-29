import React, { useRef, useState, useEffect, useCallback } from "react";
import CodeEditor from "../components/CodeEditor";
import logo from "../assets/logo.jpg";
import LanguageSelector from "../components/LanguageSelector";
import { GithubModal } from '../components/GithubModal';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import UpgradeModal from "../components/UpgradeModal";
import AiPanel from "../components/AiPanel";
import HistoryPanel from "../components/HistoryPanel";
import { useAuth } from "../hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";
import { Copy, Check, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ActivityBar from "../components/ActivityBar";
import { pollUntilDone, submitRun, fetchHistory } from "../services/codeExecutionApi";

const languageConfigs = {
  cpp: {
    name: "solution.cpp",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg",
    template: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello, LiquidIDE!\" << std::endl;\n    return 0;\n}",
    lang: "cpp"
  },
  c: {
    name: "solution.c",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg",
    template: "#include <stdio.h>\n\nint main() {\n    printf(\"Hello, LiquidIDE!\\n\");\n    return 0;\n}",
    lang: "c"
  },
  python: {
    name: "solution.py",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
    template: "print(\"Hello, LiquidIDE!\")",
    lang: "python"
  },
  javascript: {
    name: "solution.js",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
    template: "console.log(\"Hello, LiquidIDE!\");",
    lang: "javascript"
  },
  java: {
    name: "Solution.java",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
    template: "public class Solution {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, LiquidIDE!\");\n    }\n}",
    lang: "java"
  }
};

export default function EditorPage() {
  const [activeLangId, setActiveLangId] = useState("cpp");
  const [buffers, setBuffers] = useState(
    Object.fromEntries(Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.template]))
  );
  const [fileNames, setFileNames] = useState(
    Object.fromEntries(Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.name]))
  );
  const [runStatus, setRunStatus] = useState("Ready");
  const [metrics, setMetrics] = useState(null);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("session") || "default";
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);

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
  const [apiVersion, setApiVersion] = useState(null);
  
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [activeMobileTab, setActiveMobileTab] = useState("editor"); // "editor" or "terminal"
  
  const { user, token: authToken, loginUser, logoutUser } = useAuth();


  // Poll worker status
  useEffect(() => {
    const checkStatus = async () => {
      if (!navigator.onLine) {
        setIsApiOnline(false);
        setIsWorkerOnline(false);
        return;
      }
      try {
        const res = await fetch("/api/runs/health/queue");
        if (res.ok) {
          const data = await res.json();
          setIsApiOnline(true);
          setIsWorkerOnline(data.workerOnline);
          setApiVersion(data.version);
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
    const timer = setInterval(checkStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch History
  const loadHistory = useCallback(async () => {
    if (user) {
      try {
        const data = await fetchHistory();
        setHistory(data);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
    } else {
      setHistory([]);
    }
  }, [user]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("liquid_settings");
    return saved ? JSON.parse(saved) : { fontSize: 14, tabSize: 2 };
  });
  
  const onSettingsUpdate = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem("liquid_settings", JSON.stringify(newSettings));
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
        foreground: '#e2f3f5',
        cursor: '#3b82f6',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#1e1e1e',
        red: '#ff5f56',
        green: '#27c93f',
        yellow: '#ffbd2e',
        blue: '#007aff',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
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

  // Ensure terminal fits when switching tabs on mobile
  useEffect(() => {
    if (activeMobileTab === 'terminal' && fitAddonRef.current) {
      // Larger delay to ensure the DOM is visible and transition finished before fitting
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current.fit();
        } catch (e) {
          console.warn("Terminal fit failed (DOM not ready)");
        }
      }, 250); 
      return () => clearTimeout(timer);
    }
  }, [activeMobileTab]);

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

    setBusy(true);
    xtermRef.current.clear();
    setRunStatus("Running");
    setMetrics(null);

    if (activeLangId === "python") {
      try {
        await runPythonInBrowser(code);
        setBusy(false);
        return;
      } catch (err) {
        xtermRef.current.write(err.message + "\r\n");
        setRunStatus("Failed");
        setBusy(false);
        return;
      }
    }

    try {
      if (xtermRef.current) xtermRef.current.reset();
      const { jobId } = await submitRun({ language, code });
      runRef.current.jobId = jobId;

      // Ensure socket is connected before subscribing
      const socket = getSocket();
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
           if (evt.type === "stdout" || evt.type === "stderr") {
             xtermRef.current.write(evt.chunk);
           }
        }
        if (evt.type === "end") {
          setRunStatus(evt.status === "succeeded" ? "Succeeded" : "Failed");
          if (evt.chunk?.metrics) {
            setMetrics(evt.chunk.metrics);
          }
          setBusy(false);
          loadHistory(); // Refresh history after run
        }
      };

      socket.on("exec:log", onLog);

      let lastSeenStdout = 0;
      let lastSeenStderr = 0;

      await pollUntilDone(jobId, {
        onUpdate: (s) => {
          setRunStatus(s.status.charAt(0).toUpperCase() + s.status.slice(1));
          
          const sock = getSocket();
          if (!sock.connected && xtermRef.current) {
            if (s.stdout && s.stdout.length > lastSeenStdout) {
              const newPart = s.stdout.slice(lastSeenStdout);
              xtermRef.current.write(newPart);
              lastSeenStdout = s.stdout.length;
            }
            if (s.stderr && s.stderr.length > lastSeenStderr) {
              const newPart = s.stderr.slice(lastSeenStderr);
              xtermRef.current.write(newPart);
              lastSeenStderr = s.stderr.length;
            }
          }
        }
      });

      socket.off("exec:log", onLog);
      socket.emit("unsubscribe", { jobId });
    } catch (e) {
      setRunStatus("Failed");
      xtermRef.current.write((e?.message || String(e)) + "\r\n");
    } finally {
      setBusy(false);
    }
  }

  const onClear = () => {
    xtermRef.current.clear();
    setRunStatus("Ready");
  };

  const onNewFile = () => {
    if (confirm("Create new file? This will reset the code for this language.")) {
      setBuffers(prev => ({ ...prev, [activeLangId]: languageConfigs[activeLangId].template }));
      setFileNames(prev => ({ ...prev, [activeLangId]: languageConfigs[activeLangId].name }));
    }
  };

  return (
    <div className="relative flex h-screen h-[100dvh] w-full flex-col overflow-hidden bg-black selection:bg-blue-500/30">
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      <header className="relative z-20 flex h-14 md:h-16 shrink-0 items-center justify-between border-b border-white/5 bg-black md:bg-black/20 px-4 md:px-8 md:backdrop-blur-2xl">
        <div className="flex items-center gap-4 md:gap-10">
          <div className="flex items-center gap-2 md:gap-3 transition-transform hover:scale-[1.02] shrink-0">
            <div className="flex h-7 w-7 md:h-9 md:w-9 overflow-hidden rounded-lg md:rounded-xl border border-white/10 bg-gradient-to-br from-blue-600 to-indigo-700 p-0.5 shadow-2xl">
              <img src={logo} alt="Logo" className="h-full w-full rounded-[6px] md:rounded-[10px] object-cover" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] md:text-[14px] font-black uppercase tracking-widest text-white/90">LiquidIDE</span>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            {['Editor', 'Files', 'Settings', 'Stats'].map((tab) => {
              if (tab === 'Stats') {
                return (
                  <Link 
                    key={tab}
                    to="/dashboard"
                    className="group relative flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 transition-all hover:bg-white/10 hover:text-white"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500/50 group-hover:bg-blue-500 group-hover:shadow-[0_0_8px_#3b82f6]" />
                    Dashboard
                  </Link>
                );
              }
              return (
                <button 
                  key={tab}
                  onClick={() => setActiveModal(tab === 'Editor' ? null : tab.toLowerCase())}
                  className={`text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:text-white ${(!activeModal && tab === 'Editor') || activeModal === tab.toLowerCase() ? "text-white" : "text-white/40"}`}
                >
                  {tab}
                </button>
              );
            })}
          </nav>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-5">
          {user ? (
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <div className="flex items-center gap-1.5 md:gap-3 rounded-full border border-white/5 bg-white/5 py-1 md:py-1.5 pl-2 md:pl-4 pr-1 md:pr-1.5">
                <span className="hidden lg:block text-[10px] md:text-[11px] font-bold text-white/80 max-w-[100px] xl:max-w-[150px] truncate">{user.name}</span>
              <div className="h-6 w-6 md:h-7 md:w-7 rounded-full border border-white/10 overflow-hidden shadow-lg shrink-0">
                <img 
                  src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=007AFF&color=fff`} 
                  className="h-full w-full object-cover" 
                  style={{ width: '100%', height: '100%' }} // Inline safety
                  alt="Avatar" 
                />
              </div>
              </div>
              <button 
                onClick={() => confirm("Are you sure you want to log out?") && logoutUser()}
                className="ml-2 rounded-full border border-rose-500/20 bg-rose-500/5 px-4 py-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-rose-500/60 transition-all hover:bg-rose-500/20 hover:text-rose-400 active:scale-95"
              >
                Log Out
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setActiveModal('auth')} 
              className="group flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/5 p-1 pr-3 md:pr-5 transition-all hover:bg-blue-500/10 active:scale-95 shrink-0"
              title="Sign In"
            >
              <div className="h-6 w-6 md:h-8 md:w-8 overflow-hidden rounded-full border border-blue-500/30 bg-blue-600/20 shrink-0">
                <img src={logo} alt="Login" className="h-full w-full object-cover" style={{ width: '100%', height: '100%' }} />
              </div>
              <span className="text-[9px] md:text-[12px] font-black uppercase tracking-widest text-blue-400">Sign In</span>
            </button>
          )}
          <button 
            onClick={onRun}
            disabled={busy}
            className="liquid-button-primary flex items-center gap-1.5 h-8 px-2 md:px-5 text-[10px] md:text-[11px]"
          >
            {busy ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <svg className="h-3 w-3 md:h-4 md:w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
            )}
            <span className="hidden md:inline">{busy ? "Executing" : "Run Code"}</span>
            <span className="md:hidden truncate">{busy ? "..." : "Run"}</span>
          </button>
          
          <div className="flex md:hidden items-center gap-2">
             <button onClick={() => setActiveModal('files')} className="p-2 text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
             </button>
             <button onClick={() => setActiveModal('settings')} className="p-2 text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </button>
          </div>
        </div>
      </header>

      <div className="flex md:hidden h-12 shrink-0 border-b border-white/5 bg-[#0a0a0c]">
        <button 
          onClick={() => setActiveMobileTab('editor')}
          className={`relative flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeMobileTab === 'editor' ? "text-blue-400 bg-white/5" : "text-white/30"}`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          Code
          {activeMobileTab === 'editor' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_#3b82f6]" />}
        </button>
        <div className="w-px h-full bg-white/5" />
        <button 
          onClick={() => setActiveMobileTab('terminal')}
          className={`relative flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeMobileTab === 'terminal' ? "text-blue-400 bg-white/5" : "text-white/30"}`}
        >
          <div className="relative">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
            {busy && <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 animate-pulse border border-black" />}
          </div>
          Output
          {activeMobileTab === 'terminal' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_#3b82f6]" />}
        </button>
      </div>

      <main className="relative z-10 flex flex-1 flex-col md:flex-row overflow-hidden p-2 md:p-4 gap-2 md:gap-4">
        <ActivityBar 
          activeLanguage={activeLangId} 
          onLanguageChange={setActiveLangId}
          onOpenAI={() => setShowAiPanel(true)}
          aiActive={showAiPanel}
          onOpenCollaborate={() => {
            if (!searchParams.get("session")) {
              const newSession = Math.random().toString(36).substring(7);
              setSearchParams({ session: newSession });
            }
            setShowShareModal(true);
          }}
          onOpenHistory={() => setShowHistory(!showHistory)}
          historyActive={showHistory}
          onOpenSettings={() => setActiveModal('settings')}
        />
        <section className={`flex flex-col overflow-hidden gap-4 ${activeMobileTab === 'editor' ? 'flex-1' : 'hidden'} md:flex md:flex-[7]`}>
          <div className="glass-card flex flex-1 flex-col overflow-hidden">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-3 md:px-5 bg-[#0a0a0c] md:bg-white/[0.02]">
              <div className="flex items-center gap-2 md:gap-5">
                <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} isDarkMode={true} />
              </div>
              <div className="flex items-center gap-1.5 md:gap-3">
                <div className="flex items-center bg-white/5 rounded-lg border border-white/10 px-1.5 md:px-2 gap-1 md:gap-2 mr-1 md:mr-2">
                   <input 
                    type="text"
                    value={fileNames[activeLangId]}
                    onChange={(e) => setFileNames(prev => ({ ...prev, [activeLangId]: e.target.value }))}
                    className="bg-white/5 border border-white/10 rounded px-2 py-0.5 outline-none text-[8px] md:text-[11px] font-mono text-blue-400 w-24 md:w-40 focus:border-blue-500/50 transition-all"
                    placeholder="name..."
                  />
                  <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                    <button 
                      onClick={onNewFile}
                      title="New File"
                      className="p-1 text-white/40 hover:text-white transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <button 
                      onClick={() => setBuffers(prev => ({ ...prev, [activeLangId]: "" }))}
                      title="Clear Content"
                      className="p-1 text-white/40 hover:text-red-400 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden relative">
              <CodeEditor
                key={`${sessionId}-${activeLangId}`}
                language={activeLangId}
                value={buffers[activeLangId]}
                onChange={onCodeChange}
                sessionId={`${sessionId}-${activeLangId}`}
                userName={user?.name}
                theme="vs-dark"
                options={{
                  fontSize: settings.fontSize,
                  tabSize: settings.tabSize,
                }}
              />
            </div>
          </div>
        </section>

        <section className={`flex flex-col overflow-hidden gap-4 ${activeMobileTab === 'terminal' ? 'flex-1' : 'hidden'} md:flex md:flex-[3]`}>
          <div className="glass-card flex flex-1 flex-col overflow-hidden bg-black/40">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-4 md:px-6 bg-white/[0.02]">
              <div className="flex items-center gap-2 md:gap-3">
                <button 
                  onClick={onClear}
                  className="p-1.5 text-white/30 hover:text-white transition-colors rounded-md hover:bg-white/5"
                  title="Clear Terminal"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <div className={`h-1.5 w-1.5 md:h-2 md:w-2 rounded-full shadow-[0_0_10px_currentcolor] transition-colors duration-500 ${runStatus === "Succeeded" ? "text-emerald-400 bg-emerald-400" : runStatus === "Failed" ? "text-rose-400 bg-rose-400" : busy ? "text-blue-400 bg-blue-400 animate-pulse" : "text-white/20 bg-white/20"}`} />
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.25em] text-white/50 font-mono">
                  {isWorkerOnline ? "Terminal" : "Cloud Sandbox"}
                </span>
                {metrics && (
                  <div className="flex items-center gap-2 ml-2 pl-2 border-l border-white/10">
                    <span className="text-[9px] font-bold text-blue-400/80 tracking-widest uppercase">
                      {metrics.sandbox?.replace("docker-", "")}
                    </span>
                    <span className="text-[9px] font-bold text-white/30 tracking-widest uppercase">
                      {metrics.durationMs}ms
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[8px] md:text-[9px] font-bold tracking-widest text-white/30 uppercase">{runStatus}</div>
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

            <div className="flex h-8 md:h-10 shrink-0 items-center justify-between border-t border-white/5 px-4 md:px-6 bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">STABLE-RUNTIME</span>
              </div>
              <div className="flex items-center gap-3">
                 <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.2em] text-white/20 truncate">{activeLangId}</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-20 flex h-11 md:h-12 shrink-0 items-center justify-between border-t border-white/5 bg-black md:bg-black/80 px-4 md:px-8 md:backdrop-blur-3xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentcolor] ${isApiOnline ? "text-emerald-500 bg-emerald-500" : "text-rose-500 bg-rose-500"}`} />
            <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${isApiOnline ? "text-emerald-500/70" : "text-rose-500/70"}`}>
              {isApiOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
           <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest text-white/30">
             Built by <a href="https://linkedin.com/in/syedmukheeth" target="_blank" rel="noopener noreferrer" className="text-blue-400/60 hover:text-blue-400 transition-colors">Syed Mukheeth</a>
           </span>
           <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">© 2026</span>
        </div>
      </footer>

      <AuthModal isOpen={activeModal === 'auth'} onClose={() => setActiveModal(null)} isDarkMode={true} onLogin={loginUser} />
      <SettingsModal isOpen={activeModal === 'settings'} onClose={() => setActiveModal(null)} isDarkMode={true} settings={settings} onSettingsChange={onSettingsUpdate} />
      <FilesModal 
        isOpen={activeModal === 'files'} 
        onClose={() => setActiveModal(null)} 
        isDarkMode={true} 
        buffers={buffers} 
        activeLangId={activeLangId}
        onSwitch={(id) => setActiveLangId(id)}
        onPushFile={(id) => { setActiveLangId(id); setActiveModal('github'); }}
      />
      <GithubModal 
        key={fileNames[activeLangId]}
        isOpen={activeModal === 'github'} 
        onClose={() => setActiveModal(null)} 
        code={buffers[activeLangId]} 
        isDarkMode={true} 
        filename={fileNames[activeLangId]} 
        user={user} 
        authToken={authToken}
      />
      <UpgradeModal isOpen={activeModal === 'upgrade'} onClose={() => setActiveModal(null)} isDarkMode={true} />
      <AiPanel 
        isOpen={showAiPanel} 
        onClose={() => setShowAiPanel(false)}
        currentCode={buffers[activeLangId]}
        language={activeLangId}
        metrics={metrics}
        onApplyRefactor={(newCode) => {
          setBuffers(prev => ({ ...prev, [activeLangId]: newCode }));
          setShowAiPanel(false);
        }}
      />

      <AnimatePresence>
        {showHistory && (
          <HistoryPanel 
            history={history} 
            onClose={() => setShowHistory(false)}
            onSelect={(item) => {
              const lang = Object.entries(languageConfigs).find(([_, cfg]) => cfg.lang === item.runtime)?.[0] || item.runtime;
              setActiveLangId(lang);
              setBuffers(prev => ({ ...prev, [lang]: item.files[0].content }));
              setShowHistory(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-[#0a0a0c] shadow-2xl"
            >
              <div className="relative p-6 md:p-8">
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.2)]">
                    <Share2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-widest text-white">Collaborative Session</h3>
                  <p className="mt-2 text-[11px] font-medium leading-relaxed text-white/40">
                    Share this link with your pair-programming partner. 
                    They will see your cursors and code edits in real-time.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="group relative flex h-12 w-full items-center gap-3 overflow-hidden rounded-xl border border-white/5 bg-white/5 px-4 transition-all hover:bg-white/8">
                    <div className="flex-1 truncate text-[10px] font-mono text-white/60">
                      {window.location.href}
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-500 transition-all hover:bg-blue-600/20 active:scale-90"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => setShowShareModal(false)}
                  className="mt-8 flex h-12 w-full items-center justify-center rounded-xl bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/60 transition-all hover:bg-white/10 active:scale-95"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
