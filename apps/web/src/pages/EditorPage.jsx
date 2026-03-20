import React, { useRef, useState, useEffect, useCallback } from "react";
import CodeEditor from "../components/CodeEditor";
import logo from "../assets/logo.jpg";
import LanguageSelector from "../components/LanguageSelector";
import { GithubLogo, GithubModal } from '../components/GithubModal';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket } from "../services/socketClient";
import AuthModal from "../components/AuthModal";
import SettingsModal from "../components/SettingsModal";
import HistoryModal from "../components/HistoryModal";
import UpgradeModal from "../components/UpgradeModal";
import { useAuth } from "../hooks/useAuth";

const languageConfigs = {
  cpp: { name: "solution.cpp", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", template: `#include <iostream>\n\nint main() {\n  // Write your code here\n  std::cout << "Hello from LiquidIDE C++" << std::endl;\n  return 0;\n}\n`, lang: "cpp" },
  c: { name: "solution.c", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg", template: `#include <stdio.h>\n\nint main() {\n  // Write your code here\n  printf("Hello from LiquidIDE C\\n");\n  return 0;\n}\n`, lang: "c" },
  python: { name: "solution.py", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg", template: `print("Hello from LiquidIDE Python")\n`, lang: "python" },
  javascript: { name: "solution.js", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg", template: `// Write your code here\nconsole.log("Hello from LiquidIDE JS");\n`, lang: "nodejs" },
  java: { name: "Solution.java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg", template: `import java.util.*;\n\npublic class Solution {\n  public static void main(String[] args) {\n    // Write your code here\n    System.out.println("Hello from LiquidIDE Java");\n  }\n}\n`, lang: "java" },
  go: { name: "main.go", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg", template: `package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your code here\n    fmt.Println("Hello from LiquidIDE Go")\n}\n`, lang: "go" },
  rust: { name: "main.rs", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-original.svg", template: `fn main() {\n    // Write your code here\n    println!("Hello from LiquidIDE Rust");\n}\n`, lang: "rust" }
};

export default function EditorPage() {
  const [activeLangId, setActiveLangId] = useState("cpp");
  const [buffers, setBuffers] = useState(
    Object.fromEntries(Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.template]))
  );
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [runStatus, setRunStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);
  const [apiVersion, setApiVersion] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [activeMobileTab, setActiveMobileTab] = useState("editor"); // "editor" or "terminal"
  
  const { user, loginUser, logoutUser } = useAuth();

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Poll worker status
  useEffect(() => {
    const checkStatus = async () => {
      if (!navigator.onLine) {
        setIsOffline(true);
        setIsWorkerOnline(false);
        return;
      }
      try {
        const res = await fetch("/api/runs/health/queue");
        if (res.ok) {
          const data = await res.json();
          setIsWorkerOnline(data.online);
          setApiVersion(data.version);
          setIsOffline(false);
        } else {
           // If health check fails, but we have internet, maybe API is just down
           setIsWorkerOnline(false);
        }
      } catch (err) {
        setIsWorkerOnline(false);
        // If it was a network error, maybe we are actually "offline" from browser's perspective
        if (!navigator.onLine) setIsOffline(true);
      }
    };
    checkStatus();
    const timer = setInterval(checkStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("flux_settings");
    return saved ? JSON.parse(saved) : { fontSize: 14, tabSize: 2 };
  });
  
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("flux_history");
    return saved ? JSON.parse(saved) : [];
  });

  const saveHistory = useCallback((code, language, languageId) => {
    const newEntry = { code, language, languageId, timestamp: Date.now() };
    const newHistory = [newEntry, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem("flux_history", JSON.stringify(newHistory));
  }, [history]);

  const onRestoreHistory = (code, languageId) => {
    setActiveLangId(languageId);
    setBuffers(prev => ({ ...prev, [languageId]: code }));
  };

  const onSettingsUpdate = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem("flux_settings", JSON.stringify(newSettings));
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
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
      },
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'underline',
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      // Handle data (typing)
      if (runRef.current.jobId) {
        const socket = getSocket();
        socket.emit("exec:input", { jobId: runRef.current.jobId, input: data });
      }
    });

    // Resize handler
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  const runRef = useRef({ jobId: null });
  const activeConfig = languageConfigs[activeLangId];

  function onCodeChange(value) {
    setBuffers((b) => ({ ...b, [activeLangId]: value ?? "" }));
  }

  async function runPythonInBrowser(code) {
    if (!pyodide) throw new Error("Python engine is still booting...");
    
    let output = "";
    pyodide.setStdout({ batched: (str) => { 
      output += str + "\n"; 
      xtermRef.current.write(str + "\n");
    } });
    pyodide.setStderr({ batched: (str) => { 
      output += str + "\n"; 
      xtermRef.current.write(str + "\n");
    } });

    try {
      await pyodide.runPythonAsync(code);
      setRunStatus("Succeeded");
    } catch (err) {
      xtermRef.current.write(err.message + "\n");
      setRunStatus("Failed");
    }
  }

  async function onRun() {
    const code = buffers[activeLangId] ?? "";
    const language = activeConfig.lang;

    setBusy(true);
    xtermRef.current.clear();
    setRunStatus("Running");

    if (activeLangId === "python") {
      try {
        await runPythonInBrowser(code);
        saveHistory(code, activeConfig.name, activeLangId);
        setBusy(false);
        return;
      } catch (err) {
        xtermRef.current.write(err.message + "\n");
        setRunStatus("Failed");
        setBusy(false);
        return;
      }
    }

    try {
      if (xtermRef.current) xtermRef.current.reset();
      const { jobId } = await submitRun({ language, code });
      runRef.current.jobId = jobId;

      const socket = getSocket();
      socket.emit("subscribe", { jobId });

      const onLog = (evt) => {
        if (!evt || runRef.current.jobId !== jobId) return;
        if (xtermRef.current) {
           if (evt.type === "stdout" || evt.type === "stderr") {
             xtermRef.current.write(evt.chunk);
           }
        }
        if (evt.type === "end") {
          setRunStatus(evt.status === "succeeded" ? "Succeeded" : "Failed");
          setBusy(false);
          if (xtermRef.current) {
            xtermRef.current.write(`\r\n\r\n\x1b[1;36m🏁 Program finished with status: ${evt.status}\x1b[0m\r\n`);
          }
        }
      };

      socket.on("exec:log", onLog);

      let lastSeenStdout = "";
      let lastSeenStderr = "";

      await pollUntilDone(jobId, {
        onUpdate: (s) => {
          setRunStatus(s.status.charAt(0).toUpperCase() + s.status.slice(1));
          
          // Fallback: If socket is not connected, use polling data for terminal
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
      saveHistory(code, activeConfig.name, activeLangId);
    } catch (e) {
      setRunStatus("Failed");
      xtermRef.current.write((e?.message || String(e)) + "\n");
    } finally {
      setBusy(false);
    }
  }

  const onClear = () => {
    xtermRef.current.clear();
    setRunStatus("Ready");
  };

  const onNewFile = () => {
    if (confirm("Are you sure? This will clear the current code.")) {
      setBuffers(prev => ({ ...prev, [activeLangId]: languageConfigs[activeLangId].template }));
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black selection:bg-blue-500/30">
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      {/* Header */}
      <header className="relative z-20 flex h-14 md:h-16 shrink-0 items-center justify-between border-b border-white/5 bg-black/20 px-4 md:px-8 backdrop-blur-2xl">
        <div className="flex items-center gap-4 md:gap-10">
          <div className="flex items-center gap-2 md:gap-3 transition-transform hover:scale-[1.02]">
            <div className="flex h-7 w-7 md:h-9 md:w-9 overflow-hidden rounded-lg md:rounded-xl border border-white/10 bg-gradient-to-br from-blue-600 to-indigo-700 p-0.5 shadow-2xl">
              <img src={logo} alt="Logo" className="h-full w-full rounded-[6px] md:rounded-[10px] object-cover" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-white/90">LiquidIDE</span>
              <span className="hidden md:block text-[8px] font-bold uppercase tracking-[0.2em] text-blue-400">Pro Cloud Edition</span>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            {['Editor', 'History', 'Settings'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveModal(tab === 'Editor' ? null : tab.toLowerCase())}
                className={`text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:text-white ${(!activeModal && tab === 'Editor') || activeModal === tab.toLowerCase() ? "text-white" : "text-white/40"}`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
        
        <div className="flex items-center gap-2 md:gap-5">
          {user ? (
            <div className="flex items-center gap-2 md:gap-3 rounded-full border border-white/5 bg-white/5 py-1 md:py-1.5 pl-3 md:pl-4 pr-1 md:pr-1.5">
              <span className="hidden sm:block text-[10px] md:text-[11px] font-bold text-white/80">{user.name}</span>
              <div className="h-6 w-6 md:h-7 md:w-7 rounded-full border border-white/10 overflow-hidden shadow-lg">
                <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=007AFF&color=fff`} className="h-full w-full object-cover" alt="Avatar" />
              </div>
            </div>
          ) : (
            <button onClick={() => setActiveModal('auth')} className="flux-button-secondary py-1 md:py-1.5 px-3 md:px-6 text-[10px] md:text-[13px]">Sign In</button>
          )}
          <button onClick={() => setActiveModal('upgrade')} className="flux-button-primary animate-shimmer py-1 md:py-1.5 px-3 md:px-6 text-[10px] md:text-[13px]">Upgrade</button>
          
          {/* Mobile Menu Trigger (History/Settings) */}
          <div className="flex md:hidden items-center gap-2">
             <button onClick={() => setActiveModal('history')} className="p-2 text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </button>
             <button onClick={() => setActiveModal('settings')} className="p-2 text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </button>
          </div>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="flex md:hidden h-12 shrink-0 border-b border-white/5 bg-black/40 backdrop-blur-xl">
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
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {busy && <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 animate-pulse border border-black" />}
          </div>
          Output
          {activeMobileTab === 'terminal' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_#3b82f6]" />}
        </button>
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex flex-1 flex-col md:flex-row overflow-hidden p-2 md:p-4 gap-2 md:gap-4">
        {/* Editor Side */}
        <section className={`flex flex-col overflow-hidden gap-4 ${activeMobileTab === 'editor' ? 'flex-1' : 'hidden'} md:flex md:flex-[7]`}>
          <div className="glass-card flex flex-1 flex-col overflow-hidden">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-3 md:px-5 bg-white/[0.02]">
              <div className="flex items-center gap-2 md:gap-5">
                <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} isDarkMode={true} />
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                <button 
                  onClick={onNewFile}
                  className="flux-button-secondary h-7 px-3 md:px-4 text-[10px] md:text-[11px] flex items-center gap-2"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  <span>New File</span>
                </button>
                <button 
                  onClick={() => setActiveModal('github')}
                  className="flux-button-secondary h-7 px-3 md:px-4 text-[10px] md:text-[11px] flex items-center gap-2 border-emerald-500/20 text-emerald-400/80 hover:text-emerald-300 transition-all shadow-[0_0_15px_rgba(16,185,129,0.05)] hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                >
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                  <span>Push to GitHub</span>
                </button>
                <button 
                  onClick={onRun}
                  disabled={busy}
                  className="flux-button-primary flex items-center gap-2 h-7 px-3 md:px-4 text-[10px] md:text-[11px]"
                >
                  {busy ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  ) : (
                    <svg className="h-2.5 w-2.5 md:h-3 md:w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
                  )}
                  <span>{busy ? "Executing" : "Run Code"}</span>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden relative">
              <CodeEditor
                language={activeLangId}
                value={buffers[activeLangId]}
                onChange={onCodeChange}
                theme="vs-dark"
                options={{
                  fontSize: settings.fontSize,
                  tabSize: settings.tabSize,
                }}
              />
            </div>
          </div>
        </section>

        {/* Terminal Section */}
        <section className={`flex flex-col overflow-hidden gap-4 ${activeMobileTab === 'terminal' ? 'flex-1' : 'hidden'} md:flex md:flex-[3]`}>
          <div className="glass-card flex flex-1 flex-col overflow-hidden bg-black/40">
            {/* Terminal Header */}
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
                  {isWorkerOnline ? (apiVersion === "0.5.2" ? "Local Terminal" : "Local Terminal (Outdated)") : "Cloud Sandbox"}
                </span>
              </div>
              <div className="text-[8px] md:text-[9px] font-bold tracking-widest text-white/30 uppercase">{runStatus}</div>
            </div>
            
            {/* Terminal Body */}
            <div className="flex-1 overflow-hidden p-0 bg-black/20 relative">
              <div ref={terminalRef} className="h-full w-full" />
              
              {!isWorkerOnline && busy && (
                <div className="absolute top-4 left-4 right-4 z-10">
                  <div className="text-[10px] font-bold text-amber-500/50 uppercase tracking-widest bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 backdrop-blur-md">
                     ⚠️ Cloud Sandbox - Interactivity limited. Run API locally for full stdin.
                  </div>
                </div>
              )}
            </div>

            {/* Terminal Footer */}
            <div className="flex h-8 md:h-10 shrink-0 items-center justify-between border-t border-white/5 px-4 md:px-6 bg-black/40">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Flux Engine</span>
                <span className="hidden sm:inline text-[8px] font-bold text-blue-500/30">v0.5.2-STABLE</span>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/20 truncate ml-2">Buffer: {activeLangId}</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-20 flex flex-col md:flex-row h-auto md:h-12 shrink-0 items-center justify-between border-t border-white/5 bg-black/60 px-4 md:px-8 py-3 md:py-0 backdrop-blur-xl gap-3 md:gap-0">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentcolor] ${isWorkerOnline ? "text-emerald-500 bg-emerald-500" : "text-rose-500 bg-rose-500"}`} />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isWorkerOnline ? "text-emerald-500/70" : "text-rose-500/70"}`}>
              <span className="hidden md:inline">Engine </span>{isWorkerOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
           <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
             Built by 
             <a href="https://linkedin.com/in/syedmukheeth" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors hover:underline underline-offset-4">
               Syed Mukheeth
             </a>
           </span>
           <div className="hidden md:block h-3 w-px bg-white/10" />
           <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">© 2026 LiquidIDE</span>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal isOpen={activeModal === 'auth'} onClose={() => setActiveModal(null)} isDarkMode={true} onLogin={loginUser} />
      <SettingsModal isOpen={activeModal === 'settings'} onClose={() => setActiveModal(null)} isDarkMode={true} settings={settings} onSettingsChange={onSettingsUpdate} />
      <HistoryModal isOpen={activeModal === 'history'} onClose={() => setActiveModal(null)} isDarkMode={true} history={history} onRestore={onRestoreHistory} />
      <GithubModal isOpen={activeModal === 'github'} onClose={() => setActiveModal(null)} code={buffers[activeLangId]} language={activeLangId} isDarkMode={true} />
      <UpgradeModal isOpen={activeModal === 'upgrade'} onClose={() => setActiveModal(null)} isDarkMode={true} />
      {/* Offline Overlay */}
    </div>
  );
}

