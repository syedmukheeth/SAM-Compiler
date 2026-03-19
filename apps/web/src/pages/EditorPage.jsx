import React, { useRef, useState, useEffect, useCallback } from "react";
import CodeEditor from "../components/CodeEditor";
import logo from "../assets/logo.jpg";
import LanguageSelector from "../components/LanguageSelector";
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
  java: { name: "Solution.java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg", template: `import java.util.*;\n\npublic class Solution {\n  public static void main(String[] args) {\n    // Write your code here\n    System.out.println("Hello from LiquidIDE Java");\n  }\n}\n`, lang: "java" }
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
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
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
        const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
        const res = await fetch(`${API_URL}/runs/health/queue`);
        if (res.ok) {
          const data = await res.json();
          setIsWorkerOnline(data.online);
          setIsOffline(false);
        } else {
           // If health check fails, but we have internet, maybe API is just down
           setIsWorkerOnline(false);
        }
      } catch (err) {
        setIsWorkerOnline(false);
        // If it was a network error, maybe we are actually "offline" from browser's perspective
        if (err.name === "TypeError" || !navigator.onLine) setIsOffline(true);
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
          console.log("🐍 Pyodide v0.26.4 loaded successfully.");
        } catch (err) {
          console.error("❌ Pyodide loading failed:", err);
          setIsPyodideLoading(false);
        }
      };
      document.body.appendChild(script);
    }
  }, [isPyodideLoading, pyodide]);

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
      setStdout(output); 
    } });
    pyodide.setStderr({ batched: (str) => { 
      output += str + "\n"; 
      setStderr(output); 
    } });

    try {
      await pyodide.runPythonAsync(code);
      setRunStatus("Succeeded");
    } catch (err) {
      setStderr(err.message);
      setRunStatus("Failed");
    }
  }

  async function onRun() {
    const code = buffers[activeLangId] ?? "";
    const language = activeConfig.lang;

    setBusy(true);
    setStdout("");
    setStderr("");
    setRunStatus("Running");

    if (activeLangId === "python") {
      try {
        await runPythonInBrowser(code);
        saveHistory(code, activeConfig.name, activeLangId);
        setBusy(false);
        return;
      } catch (err) {
        setStderr(err.message);
        setRunStatus("Failed");
        setBusy(false);
        return;
      }
    }

    try {
      const { jobId } = await submitRun({ language, code });
      runRef.current.jobId = jobId;

      const socket = getSocket();
      socket.emit("subscribe", { jobId });

      const onLog = (evt) => {
        if (!evt || runRef.current.jobId !== jobId) return;
        if (evt.type === "stdout" && typeof evt.chunk === "string") setStdout((s) => s + evt.chunk);
        if (evt.type === "stderr" && typeof evt.chunk === "string") setStderr((s) => s + evt.chunk);
        if (evt.type === "end") setRunStatus(evt.status === "succeeded" ? "Succeeded" : "Failed");
      };

      socket.on("exec:log", onLog);

      await pollUntilDone(jobId, {
        onUpdate: (s) => {
          setRunStatus(s.status.charAt(0).toUpperCase() + s.status.slice(1));
          if (typeof s.stdout === "string") setStdout(s.stdout);
          if (typeof s.stderr === "string") setStderr(s.stderr);
        }
      });

      socket.off("exec:log", onLog);
      socket.emit("unsubscribe", { jobId });
      saveHistory(code, activeConfig.name, activeLangId);
    } catch (e) {
      setRunStatus("Failed");
      setStderr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black selection:bg-blue-500/30">
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      {/* Header */}
      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-black/20 px-8 backdrop-blur-2xl">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3 transition-transform hover:scale-[1.02]">
            <div className="flex h-9 w-9 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-blue-600 to-indigo-700 p-0.5 shadow-2xl">
              <img src={logo} alt="Logo" className="h-full w-full rounded-[10px] object-cover" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[12px] font-black uppercase tracking-widest text-white/90">LiquidIDE</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-blue-400">Pro Cloud Edition</span>
            </div>
          </div>
          
          <nav className="flex items-center gap-8">
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
        
        <div className="flex items-center gap-5">
          {user ? (
            <div className="flex items-center gap-3 rounded-full border border-white/5 bg-white/5 py-1.5 pl-4 pr-1.5">
              <span className="text-[11px] font-bold text-white/80">{user.name}</span>
              <div className="h-7 w-7 rounded-full border border-white/10 overflow-hidden shadow-lg">
                <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=007AFF&color=fff`} className="h-full w-full object-cover" alt="Avatar" />
              </div>
            </div>
          ) : (
            <button onClick={() => setActiveModal('auth')} className="flux-button-secondary py-1.5 px-6">Sign In</button>
          )}
          <button onClick={() => setActiveModal('upgrade')} className="flux-button-primary animate-shimmer py-1.5 px-6">Upgrade</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex flex-1 overflow-hidden p-4 gap-4">
        {/* Editor Side */}
        <section className="flex flex-[7] flex-col overflow-hidden gap-4">
          <div className="glass-card flex flex-1 flex-col overflow-hidden">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-5 bg-white/[0.02]">
              <div className="flex items-center gap-5">
                <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} isDarkMode={true} />
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={onRun}
                  disabled={busy}
                  className="flux-button-primary flex items-center gap-2 h-7 px-4 text-[11px]"
                >
                  {busy ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  ) : (
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
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

        {/* Terminal Side */}
        <section className="flex flex-[3] flex-col overflow-hidden gap-4">
          <div className="glass-card flex flex-1 flex-col overflow-hidden bg-black/40">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-6 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full shadow-[0_0_10px_currentcolor] transition-colors duration-500 ${runStatus === "Succeeded" ? "text-emerald-400 bg-emerald-400" : runStatus === "Failed" ? "text-rose-400 bg-rose-400" : busy ? "text-blue-400 bg-blue-400 animate-pulse" : "text-white/20 bg-white/20"}`} />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50 font-mono">Terminal Output</span>
              </div>
              <div className="text-[9px] font-bold tracking-widest text-white/30 uppercase">{runStatus}</div>
            </div>
            
            <div className="flex-1 overflow-auto p-6 font-mono text-[13px] leading-relaxed custom-scrollbar bg-black/20">
              {busy && !stdout && !stderr && (
                <div className="flex h-full flex-col items-center justify-center gap-4 opacity-50">
                  <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-blue-400">Compiling</span>
                </div>
              )}
              
              {stdout && (
                <div className="mb-6 animate-in fade-in duration-500">
                  <div className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-500/40 mb-3 ml-1">STDOUT</div>
                  <div className="p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 text-emerald-50/90 whitespace-pre-wrap shadow-inner">{stdout}</div>
                </div>
              )}
              
              {stderr && (
                <div className="animate-in fade-in duration-500">
                  <div className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500/40 mb-3 ml-1">STDERR</div>
                  <div className="p-4 rounded-xl border border-rose-500/10 bg-rose-500/5 text-rose-200 whitespace-pre-wrap shadow-inner">{stderr}</div>
                </div>
              )}

              {!stdout && !stderr && !busy && (
                <div className="flex h-full flex-col items-center justify-center gap-4 opacity-[0.05] grayscale select-none">
                  <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-[0.6em]">Standby</span>
                </div>
              )}
            </div>

            <div className="flex h-10 shrink-0 items-center justify-between border-t border-white/5 px-6 bg-black/40">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Flux Engine</span>
                <span className="text-[8px] font-bold text-blue-500/30">v0.5.2-STABLE</span>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Buffer: {activeLangId}</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-20 flex h-12 shrink-0 items-center justify-between border-t border-white/5 bg-black/60 px-8 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentcolor] ${isWorkerOnline ? "text-emerald-500 bg-emerald-500" : "text-rose-500 bg-rose-500"}`} />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isWorkerOnline ? "text-emerald-500/70" : "text-rose-500/70"}`}>
              {isWorkerOnline ? "Engine Online" : "Engine Offline"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">© 2026 LiquidIDE</span>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal isOpen={activeModal === 'auth'} onClose={() => setActiveModal(null)} isDarkMode={true} onLogin={loginUser} />
      <SettingsModal isOpen={activeModal === 'settings'} onClose={() => setActiveModal(null)} isDarkMode={true} settings={settings} onSettingsChange={onSettingsUpdate} />
      <HistoryModal isOpen={activeModal === 'history'} onClose={() => setActiveModal(null)} isDarkMode={true} history={history} onRestore={onRestoreHistory} />
      <UpgradeModal isOpen={activeModal === 'upgrade'} onClose={() => setActiveModal(null)} isDarkMode={true} />
      {/* Offline Overlay */}
      {isOffline && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-3xl animate-in fade-in duration-700">
          <div className="relative group max-w-md overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/5 p-12 text-center shadow-[0_30px_100px_rgba(0,0,0,0.8)] transition-all hover:border-white/20">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 shadow-[0_0_40px_rgba(59,130,246,0.3)] animate-pulse">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.237-3.905 14.141 0M1.343 5.858c5.858-5.858 15.355-5.858 21.213 0" />
                </svg>
              </div>
              <h2 className="mb-4 text-3xl font-black tracking-tighter text-white">Network Offline</h2>
              <p className="mb-8 text-sm leading-relaxed text-white/40">
                It looks like your browser is in offline mode. <br />
                Please check your internet connection or <span className="text-blue-400 font-bold">DevTools Throttling settings</span>.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="liquid-button group relative px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-105 active:scale-95"
              >
                <span className="relative z-10">Retry Connection</span>
                <div className="absolute inset-0 rounded-full bg-blue-600 opacity-20 blur-md transition-opacity group-hover:opacity-40" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

