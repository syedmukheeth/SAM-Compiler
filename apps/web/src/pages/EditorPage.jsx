import React, { useRef, useState, useEffect } from "react";
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
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [buffers, setBuffers] = useState(
    Object.fromEntries(Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.template]))
  );
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [runStatus, setRunStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [isOutputVisible, setIsOutputVisible] = useState(true);
  const [activeModal, setActiveModal] = useState(null); // 'auth', 'settings', 'history', 'upgrade'
  
  const { user, loginUser, logoutUser } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      // We don't have the user object yet, but useAuth will fetch it via /me because we set the token
      loginUser(null, token); 
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loginUser]);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("flux_settings");
    return saved ? JSON.parse(saved) : { fontSize: 14, tabSize: 2 };
  });
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("flux_history");
    return saved ? JSON.parse(saved) : [];
  });

  const saveHistory = (code, language, languageId) => {
    const newEntry = { code, language, languageId, timestamp: Date.now() };
    const newHistory = [newEntry, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem("flux_history", JSON.stringify(newHistory));
  };

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

  // PRE-LOAD PYTHON ENGINE (v0.4.4)
  useEffect(() => {
    if (!pyodide && !isPyodideLoading) {
      setIsPyodideLoading(true);
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js";
      script.onload = async () => {
        try {
          // eslint-disable-next-line no-undef
          const py = await loadPyodide();
          setPyodide(py);
        } catch (err) {
          console.error("Pyodide failed to load:", err);
        } finally {
          setIsPyodideLoading(false);
        }
      };
      document.body.appendChild(script);
    }
  }, []); // Run once on mount

  const runRef = useRef({ jobId: null });
  const activeConfig = languageConfigs[activeLangId];

  function onCodeChange(value) {
    setBuffers((b) => ({ ...b, [activeLangId]: value ?? "" }));
  }

  async function runPythonInBrowser(code) {
    if (!pyodide) throw new Error("Python engine is still booting. Please wait a moment...");
    
    // Redirect stdout/stderr
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
      setRunStatus("succeeded");
    } catch (err) {
      setStderr(err.message);
      setRunStatus("failed");
    }
  }

  async function onRun() {
    const code = buffers[activeLangId] ?? "";
    const language = activeConfig.lang;

    setBusy(true);
    setStdout("");
    setStderr("");
    setRunStatus("Running");
    setIsOutputVisible(true);

    // BROWSER-BASED PYTHON (v0.4.4 - No Fallback)
    if (activeLangId === "python") {
      try {
        if (!pyodide) {
           setRunStatus("Initializing");
           setStdout("Booting internal Python engine...\n(This only happens once per session)");
           // Wait loop for pyodide
           let attempts = 0;
           while (!window.loadPyodide && attempts < 20) { await new Promise(r => setTimeout(r, 500)); attempts++; }
           if (!pyodide) throw new Error("Python engine boot timeout. Please check your internet connection and refresh.");
        }
        await runPythonInBrowser(code);
        saveHistory(code, activeConfig.name, activeLangId);
        setBusy(false);
        return;
      } catch (err) {
        setStderr(err.message);
        setRunStatus("Failed");
        setBusy(false);
        return; // DO NOT FALL BACK TO BACKEND FOR PYTHON
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
        if (evt.type === "end") setRunStatus(evt.status ?? "Done");
      };

      socket.on("exec:log", onLog);

      await pollUntilDone(jobId, {
        onUpdate: (s) => {
          setRunStatus(s.status ?? "Running");
          if (typeof s.stdout === "string") setStdout((prev) => (prev.length >= s.stdout.length ? prev : s.stdout));
          if (typeof s.stderr === "string") setStderr((prev) => (prev.length >= s.stderr.length ? prev : s.stderr));
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
    <div className={`relative flex h-screen w-full flex-col font-sans transition-colors duration-1000 ${isDarkMode ? "bg-[#020408] text-white" : "bg-[#f8fafc] text-slate-900"} selection:bg-blue-500/30 overflow-hidden`}>
      {/* Dynamic Background Blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute -left-[10%] top-[10%] h-[500px] w-[500px] rounded-full blur-[120px] animate-blob filter ${isDarkMode ? "bg-blue-600/20" : "bg-blue-400/30"}`} />
        <div className={`absolute -right-[10%] top-[20%] h-[500px] w-[500px] rounded-full blur-[120px] animate-blob animation-delay-2000 filter ${isDarkMode ? "bg-indigo-600/20" : "bg-indigo-400/30"}`} />
        <div className={`absolute bottom-[10%] left-[20%] h-[500px] w-[500px] rounded-full blur-[120px] animate-blob animation-delay-4000 filter ${isDarkMode ? "bg-purple-600/10" : "bg-purple-400/20"}`} />
        <div className="noise-overlay" />
      </div>

      {/* Top Navbar */}
      <header className={`relative z-20 flex h-20 shrink-0 items-center justify-between border-b px-10 backdrop-blur-3xl transition-all duration-500 ${isDarkMode ? "border-white/5 bg-black/40" : "border-slate-200 bg-white/60"}`}>
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-4 group cursor-pointer">
            <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 p-0.5 shadow-2xl shadow-blue-500/30 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 active:scale-95">
              <div className={`flex h-full w-full items-center justify-center rounded-[14px] overflow-hidden backdrop-blur-xl ${isDarkMode ? "bg-[#050505]/40" : "bg-white/40"}`}>
                <img src={logo} alt="LiquidIDE Logo" className="h-full w-full object-cover" />
              </div>
            </div>
            <div className="flex flex-col">
               <span className={`text-base font-black tracking-tight leading-none transition-all group-hover:tracking-wider ${isDarkMode ? "text-white" : "text-slate-900"}`}>Liquid Compiler</span>
               <span className={`text-[10px] font-black tracking-[0.3em] uppercase mt-1 ${isDarkMode ? "text-blue-400/40" : "text-blue-600/50"}`}>Flux Engine Pro</span>
            </div>
          </div>
          <nav className={`flex items-center gap-10 text-[10px] font-black uppercase tracking-[0.2em] ${isDarkMode ? "text-white/30" : "text-slate-400"}`}>
            {['Editor', 'History', 'Settings'].map((tab) => (
              <button 
                key={tab}
                className={`relative py-7 transition-all hover:text-blue-500 ${(!activeModal && tab === 'Editor') || activeModal === tab.toLowerCase() ? "text-blue-500" : ""}`}
                onClick={() => setActiveModal(tab === 'Editor' ? null : tab.toLowerCase())}
              >
                {tab}
                {((!activeModal && tab === 'Editor') || activeModal === tab.toLowerCase()) && (
                  <div className="absolute bottom-0 left-0 h-0.5 w-full bg-blue-600 shadow-[0_0_12px_#2563eb] animate-in fade-in zoom-in duration-500" />
                )}
              </button>
            ))}
          </nav>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`group flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-500 active:scale-90 ${isDarkMode ? "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20" : "border-slate-200 bg-white hover:bg-slate-50 shadow-sm"}`}
          >
            {isDarkMode ? (
              <svg className="h-5 w-5 text-amber-300 transition-all group-hover:rotate-45" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="h-5 w-5 text-indigo-600 transition-all group-hover:-rotate-45" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
            )}
          </button>
          
          <div className={`h-5 w-px ${isDarkMode ? "bg-white/10" : "bg-slate-200"}`} />

          {user ? (
            <div className="flex items-center gap-4 group cursor-pointer" onClick={logoutUser} title="Click to Sign Out">
               <div className="flex flex-col items-end">
                  <span className={`text-[11px] font-black uppercase tracking-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}>{user.name}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${isDarkMode ? "text-blue-400/50" : "text-blue-600/50"}`}>Pro Member</span>
               </div>
               <div className="relative h-11 w-11 p-0.5 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent transition-transform group-hover:scale-105">
                  <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=6366f1&color=fff`} className="h-full w-full rounded-[14px] object-cover border border-white/10 shadow-xl" alt="Avatar" />
               </div>
            </div>
          ) : (
            <button onClick={() => setActiveModal('auth')} className="flux-button-secondary h-11 px-8">Sign In</button>
          )}

          <button onClick={() => setActiveModal('upgrade')} className="flux-button-primary h-11 px-8 animate-glow">Go Pro</button>
        </div>
      </header>

      {/* Main Split Container */}
      <main className="relative z-10 flex flex-1 overflow-hidden p-6 gap-6">
        {/* Editor Side (Left) */}
        <section className="flex flex-[7] flex-col overflow-hidden gap-6">
          <div className="flux-card flex flex-1 flex-col overflow-hidden">
            {/* Editor Toolbar */}
            <div className={`flex h-16 shrink-0 items-center justify-between border-b px-10 transition-colors ${isDarkMode ? "border-white/5 bg-white/[0.02]" : "border-slate-100 bg-slate-50/30"}`}>
              <div className="flex items-center gap-8">
                <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} isDarkMode={isDarkMode} />
                <button className={`group flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${isDarkMode ? "text-white/20 hover:text-white/60" : "text-slate-400 hover:text-slate-600"}`}>
                  <svg className="h-4 w-4 transition-transform group-hover:rotate-180 duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Reset
                </button>
              </div>
              
              <div className="flex items-center gap-6">
                {activeLangId === "python" && (
                  <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-[0.1em] transition-all ${pyodide ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-500" : "border-amber-500/20 bg-amber-500/5 text-amber-500"}`}>
                    <div className={`h-2 w-2 rounded-full ${pyodide ? "bg-emerald-500 shadow-[0_0_12px_#10b981]" : "bg-amber-500 animate-pulse shadow-[0_0_12px_#f59e0b]"}`} />
                    {pyodide ? "Sandbox ready" : "Booting sandbox..."}
                  </div>
                )}
                <button 
                  onClick={onRun}
                  disabled={busy || (activeLangId === "python" && isPyodideLoading)}
                  className="flux-button-primary flex items-center gap-4 h-11 px-8 min-w-[160px] justify-center"
                >
                  {(busy || (activeLangId === "python" && isPyodideLoading)) ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  ) : (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                  )}
                  <span>{(activeLangId === "python" && isPyodideLoading) ? "Booting..." : busy ? "Running..." : "Run Code"}</span>
                </button>
              </div>
            </div>
            
            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
               <CodeEditor
                language={activeLangId === "javascript" ? "nodejs" : activeLangId}
                value={buffers[activeLangId]}
                onChange={onCodeChange}
                theme={isDarkMode ? "vs-dark" : "light"}
                options={{
                  fontSize: settings.fontSize,
                  tabSize: settings.tabSize
                }}
              />
            </div>
          </div>
        </section>

        {/* Console Side (Right) */}
        <section className={`flux-card flex flex-[3] flex-col overflow-hidden transition-all duration-1000 ${isDarkMode ? "bg-black/60 shadow-indigo-900/10" : "bg-white/90 shadow-slate-200/50"}`}>
          <div className={`flex h-16 shrink-0 items-center justify-between border-b px-8 transition-colors ${isDarkMode ? "border-white/5 bg-white/[0.01]" : "border-slate-100 bg-slate-50/50"}`}>
            <div className="flex items-center gap-4">
               <div className={`flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg border transition-all ${isDarkMode ? "border-white/10" : "border-slate-200"}`}>
                  <img src={logo} alt="Flux" className="h-full w-full object-cover" />
               </div>
               <div className={`h-2.5 w-2.5 rounded-full ring-4 transition-all duration-700 ${runStatus === "Done" || runStatus === "succeeded" ? "bg-emerald-400 ring-emerald-400/10" : runStatus === "Failed" || runStatus === "failed" ? "bg-rose-400 ring-rose-400/10" : busy ? "bg-blue-400 ring-blue-400/10 animate-pulse" : "bg-white/10 ring-transparent"}`} />
               <span className={`text-[10px] font-black uppercase tracking-[0.3em] font-mono ${isDarkMode ? "text-white/60" : "text-slate-500"}`}>Terminal Output</span>
            </div>
            <div className={`text-[10px] font-black tracking-widest px-3 py-1 rounded-full border transition-all ${isDarkMode ? "bg-white/5 border-white/5 text-white/40" : "bg-slate-100 border-slate-200 text-slate-400"}`}>{runStatus.toUpperCase()}</div>
          </div>
          
          <div className="flex-1 overflow-auto p-10 font-mono text-[14px] leading-relaxed custom-scrollbar selection:bg-indigo-500/40">
            {busy && !stdout && !stderr && (
              <div className="flex h-full flex-col items-center justify-center gap-8 group">
                <div className="relative">
                   <div className={`h-16 w-16 rounded-full border-2 border-t-white/80 animate-spin ${isDarkMode ? "border-blue-500/10" : "border-blue-500/20"}`} />
                   <div className="absolute inset-2 rounded-full border border-indigo-500/20 animate-pulse" />
                </div>
                <span className={`text-[10px] font-black uppercase tracking-[0.5em] transition-all duration-1000 ${isDarkMode ? "text-blue-400/30 group-hover:text-blue-400/60" : "text-blue-600/40"}`}>Compiling & Executing</span>
              </div>
            )}
            
            {stdout && (
              <div className="mb-10 animate-in fade-in slide-in-from-right-4 duration-700">
                <p className={`uppercase text-[9px] font-black mb-5 tracking-[0.4em] flex items-center gap-5 select-none ${isDarkMode ? "text-white/10" : "text-slate-300"}`}>
                  <span className={`h-[1px] flex-1 ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`}></span>
                  Stdout
                </p>
                <div className={`relative p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-emerald-500/5 border-emerald-500/10" : "bg-emerald-50 border-emerald-100"}`}>
                   <pre className={`whitespace-pre-wrap ${isDarkMode ? "text-emerald-50/90" : "text-emerald-800"}`}>{stdout}</pre>
                   <div className={`absolute top-0 right-0 p-2 rounded-tr-2xl text-[8px] font-black uppercase tracking-widest ${isDarkMode ? "text-emerald-500/20" : "text-emerald-500/40"}`}>Output</div>
                </div>
              </div>
            )}
            
            {stderr && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-700">
                <p className={`uppercase text-[9px] font-black mb-5 tracking-[0.4em] flex items-center gap-5 select-none ${isDarkMode ? "text-rose-500/10" : "text-rose-500/20"}`}>
                  <span className={`h-[1px] flex-1 ${isDarkMode ? "bg-rose-500/5" : "bg-rose-100"}`}></span>
                  Stderr
                </p>
                <div className={`relative p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-rose-500/5 border-rose-500/10 shadow-2xl shadow-rose-900/10" : "bg-rose-50 border-rose-100"}`}>
                   <pre className={`whitespace-pre-wrap ${isDarkMode ? "text-rose-300" : "text-rose-800"}`}>{stderr}</pre>
                   <div className="absolute top-3 right-4 h-2 w-2 rounded-full bg-rose-500/40 animate-pulse" />
                </div>
              </div>
            )}

            {!stdout && !stderr && !busy && (
              <div className="flex h-full flex-col items-center justify-center gap-8 opacity-[0.03] grayscale transition-opacity duration-1000 hover:opacity-[0.06] select-none">
                <svg className="h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span className={`text-[12px] font-black uppercase tracking-[0.8em] transition-all ${isDarkMode ? "text-white" : "text-slate-900"}`}>Standby</span>
              </div>
            )}
          </div>

          <div className={`flex h-12 shrink-0 items-center justify-between border-t px-8 transition-colors ${isDarkMode ? "border-white/5 bg-black/20" : "border-slate-100 bg-slate-50/30"}`}>
             <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>Flux OS</span>
                <span className={`text-[9px] font-bold ${isDarkMode ? "text-blue-500/40" : "text-blue-600/40"}`}>v0.5.0-STABLE</span>
             </div>
             <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>Buffer: <span className="text-blue-500/60 font-black">{activeLangId}</span></span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={`relative z-20 flex h-16 shrink-0 items-center justify-between border-t px-10 border-white/5 backdrop-blur-3xl transition-colors ${isDarkMode ? "bg-black/20" : "bg-white/40 border-slate-200"}`}>
        <div className="flex items-center gap-8">
           <div className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>
              <div className="relative flex items-center justify-center h-2 w-2">
                 <div className="absolute h-full w-full rounded-full bg-emerald-500 animate-ping opacity-75" />
                 <div className="relative h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981]" />
              </div>
              <span className={isDarkMode ? "text-emerald-400/60" : "text-emerald-600"}>System Ready</span>
           </div>
        </div>
        
        <a 
          href="https://www.linkedin.com/in/syedmukheeth/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="group flex items-center gap-3 transition-transform hover:scale-105 active:scale-95"
        >
          <span className={`text-[9px] font-black uppercase tracking-[0.4em] ${isDarkMode ? "text-white/10 group-hover:text-white/30" : "text-slate-300 group-hover:text-slate-500"}`}>Engineered by</span>
          <span className="text-[11px] font-black uppercase tracking-[0.5em] bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 bg-clip-text text-transparent drop-shadow-sm group-hover:brightness-125 transition-all">syed mukheeth</span>
        </a>

        <div className={`flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.3em] ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>
           {['Archive', 'Security', 'Telemetry'].map((link) => (
             <span key={link} className="hover:text-blue-500 transition-all cursor-pointer hover:tracking-widest duration-500">{link}</span>
           ))}
        </div>
      </footer>


      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; }
      `}} />

      {/* Modals */}
      <AuthModal 
        isOpen={activeModal === 'auth'} 
        onClose={() => setActiveModal(null)} 
        isDarkMode={isDarkMode} 
        onLogin={loginUser}
      />
      <SettingsModal 
        isOpen={activeModal === 'settings'} 
        onClose={() => setActiveModal(null)} 
        isDarkMode={isDarkMode} 
        settings={settings}
        onSettingsChange={onSettingsUpdate}
      />
      <HistoryModal 
        isOpen={activeModal === 'history'} 
        onClose={() => setActiveModal(null)} 
        isDarkMode={isDarkMode} 
        history={history}
        onRestore={onRestoreHistory}
      />
      <UpgradeModal 
        isOpen={activeModal === 'upgrade'} 
        onClose={() => setActiveModal(null)} 
        isDarkMode={isDarkMode} 
      />
    </div>
  );
}

