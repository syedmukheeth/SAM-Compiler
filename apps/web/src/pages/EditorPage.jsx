import React, { useRef, useState, useEffect } from "react";
import CodeEditor from "../components/CodeEditor";
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
    <div className={`relative flex h-screen w-full flex-col transition-colors duration-700 ${isDarkMode ? "bg-[#050505] text-white" : "bg-[#f8fafc] text-slate-900"} selection:bg-blue-500/30 overflow-hidden`}>
      {/* Background Mesh Gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full blur-[120px] transition-colors duration-1000 ${isDarkMode ? "bg-blue-600/10" : "bg-blue-400/20"}`} />
        <div className={`absolute -right-[10%] -bottom-[10%] h-[40%] w-[40%] rounded-full blur-[120px] transition-colors duration-1000 ${isDarkMode ? "bg-indigo-600/10" : "bg-indigo-400/20"}`} />
      </div>

      {/* Top Navbar */}
      <header className={`relative z-10 flex h-16 shrink-0 items-center justify-between border-b px-8 backdrop-blur-3xl transition-colors ${isDarkMode ? "border-white/5 bg-black/20" : "border-slate-200 bg-white/40"}`}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative h-9 w-9 overflow-hidden rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 p-0.5 shadow-2xl shadow-blue-500/20 transition-transform group-hover:scale-105 active:scale-95">
              <div className={`flex h-full w-full items-center justify-center rounded-[10px] backdrop-blur-xl font-black text-white text-lg ${isDarkMode ? "bg-[#050505]/20" : "bg-white/20"}`}>L</div>
            </div>
            <div className="flex flex-col">
               <span className={`text-sm font-black tracking-tight transition-opacity group-hover:opacity-80 ${isDarkMode ? "text-white" : "text-slate-800"}`}>Liquid Compiler</span>
               <span className={`text-[10px] font-bold tracking-widest uppercase ${isDarkMode ? "text-white/30" : "text-slate-400"}`}>Flux Engine Pro</span>
            </div>
          </div>
          <nav className={`flex items-center gap-8 text-[11px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>
            <button className={`${!activeModal ? "text-blue-500 border-b-2 border-blue-500" : "hover:text-blue-400"} py-5 transition-all`} onClick={() => setActiveModal(null)}>Editor</button>
            <button className={`${activeModal === 'history' ? "text-blue-500 border-b-2 border-blue-500" : "hover:text-blue-400"} transition-colors py-5 border-b-2 border-transparent`} onClick={() => setActiveModal('history')}>History</button>
            <button className={`${activeModal === 'settings' ? "text-blue-500 border-b-2 border-blue-500" : "hover:text-blue-400"} transition-colors py-5 border-b-2 border-transparent`} onClick={() => setActiveModal('settings')}>Settings</button>
          </nav>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Theme Toggle */}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`group flex h-10 w-10 items-center justify-center rounded-2xl border transition-all active:scale-90 ${isDarkMode ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-slate-100 hover:bg-slate-200"}`}
          >
            {isDarkMode ? (
              <svg className="h-5 w-5 text-amber-400 transition-transform group-hover:rotate-12" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="h-5 w-5 text-indigo-600 transition-transform group-hover:-rotate-12" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
            )}
          </button>
          
          <div className={`h-4 w-px ${isDarkMode ? "bg-white/10" : "bg-slate-200"}`} />

          {user ? (
            <div className="flex items-center gap-4 group cursor-pointer" onClick={logoutUser} title="Click to Sign Out">
               <div className="flex flex-col items-end">
                  <span className={`text-[11px] font-black uppercase tracking-tight ${isDarkMode ? "text-white" : "text-slate-800"}`}>{user.name}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>Account</span>
               </div>
               <div className="h-10 w-10 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-0.5 shadow-2xl transition-transform group-hover:scale-105 active:scale-95">
                  <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=6366f1&color=fff`} className="h-full w-full rounded-[8px] object-cover" alt="Avatar" />
               </div>
            </div>
          ) : (
            <button onClick={() => setActiveModal('auth')} className={`h-10 rounded-2xl px-6 text-[12px] font-black transition-all active:scale-95 border backdrop-blur-xl ${isDarkMode ? "bg-white/5 text-white/80 hover:bg-white/10 border-white/5" : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60 shadow-sm"}`}>Sign In</button>
          )}

          <button onClick={() => setActiveModal('upgrade')} className="h-10 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-[12px] font-black text-white shadow-2xl shadow-blue-500/20 transition-all hover:brightness-110 active:scale-95">Go Pro</button>
        </div>
      </header>

      {/* Main Split Container */}
      <main className="relative z-10 flex flex-1 overflow-hidden p-4 gap-4">
        {/* Editor Side (Left) */}
        <section className="flex flex-[7] flex-col overflow-hidden gap-4">
          <div className={`flex flex-1 flex-col overflow-hidden rounded-[2rem] border shadow-2xl backdrop-blur-3xl transition-all duration-700 ${isDarkMode ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white/70"}`}>
            {/* Editor Toolbar */}
            <div className={`flex h-14 shrink-0 items-center justify-between border-b px-8 transition-colors ${isDarkMode ? "border-white/5 bg-white/[0.01]" : "border-slate-100 bg-slate-50/50"}`}>
              <div className="flex items-center gap-6">
                <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} />
                <button className={`group flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300 ${isDarkMode ? "text-white/20 hover:text-white/60" : "text-slate-400 hover:text-slate-600"}`}>
                  <svg className="h-4 w-4 transition-transform group-hover:rotate-180 duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Reset
                </button>
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={onRun}
                  disabled={busy || (activeLangId === "python" && isPyodideLoading)}
                  className="group relative flex h-10 items-center gap-3 overflow-hidden rounded-xl bg-emerald-500/10 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50 ring-1 ring-emerald-500/20"
                >
                  {(busy || (activeLangId === "python" && isPyodideLoading)) ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
                  ) : (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                  )}
                  <span>{(activeLangId === "python" && isPyodideLoading) ? "Booting Engine..." : "Run code"}</span>
                </button>
                {activeLangId === "python" && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${pyodide ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-500" : "border-amber-500/20 bg-amber-500/5 text-amber-500"}`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${pyodide ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]"}`} />
                    {pyodide ? "Web Runner Active" : "Initializing Engine..."}
                  </div>
                )}
              </div>
            </div>
            
            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden py-4">
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
        <section className={`flex flex-[3] flex-col overflow-hidden rounded-[2rem] border shadow-2xl backdrop-blur-3xl transition-all duration-700 ${isDarkMode ? "border-white/10 bg-black/40" : "border-slate-200 bg-white/80"}`}>
          <div className={`flex h-14 shrink-0 items-center justify-between border-b px-8 transition-colors ${isDarkMode ? "border-white/5 bg-white/[0.01]" : "border-slate-100 bg-slate-50/50"}`}>
            <div className="flex items-center gap-3">
               <div className={`h-2 w-2 rounded-full transition-all duration-500 ${runStatus === "Done" || runStatus === "succeeded" ? "bg-emerald-400 shadow-[0_0_12px_#34d399]" : runStatus === "Failed" || runStatus === "failed" ? "bg-rose-400 shadow-[0_0_12px_#fb7185]" : "bg-white/10"}`} />
               <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDarkMode ? "text-white/60" : "text-slate-500"}`}>Console Output</span>
            </div>
            <div className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${isDarkMode ? "bg-white/5 text-white/30" : "bg-slate-100 text-slate-400"}`}>{runStatus}</div>
          </div>
          
          <div className="flex-1 overflow-auto p-8 font-mono text-[13px] leading-7 custom-scrollbar">
            {busy && !stdout && !stderr && (
              <div className="flex h-full flex-col items-center justify-center gap-6 animate-pulse">
                <div className={`h-10 w-10 rounded-full border-4 border-t-blue-500 animate-spin ${isDarkMode ? "border-white/5" : "border-slate-100"}`} />
                <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${isDarkMode ? "text-blue-400/30" : "text-blue-500/40"}`}>Executing</span>
              </div>
            )}
            
            {stdout && (
              <div className="mb-8 animate-in fade-in slide-in-from-right-4 duration-700">
                <p className={`uppercase text-[9px] font-black mb-4 tracking-[0.3em] flex items-center gap-4 select-none ${isDarkMode ? "text-white/10" : "text-slate-300"}`}>
                  <span className={`h-px flex-1 ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`}></span>
                  Stdout
                </p>
                <pre className={`whitespace-pre-wrap p-5 rounded-xl border transition-all ${isDarkMode ? "text-emerald-50/90 bg-emerald-500/5 border-emerald-500/10" : "text-emerald-700 bg-emerald-50/50 border-emerald-200"}`}>{stdout}</pre>
              </div>
            )}
            
            {stderr && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-700">
                <p className={`uppercase text-[9px] font-black mb-4 tracking-[0.3em] flex items-center gap-4 select-none ${isDarkMode ? "text-rose-500/20" : "text-rose-400/40"}`}>
                  <span className={`h-px flex-1 ${isDarkMode ? "bg-rose-500/10" : "bg-rose-100"}`}></span>
                  Stderr
                </p>
                <pre className={`whitespace-pre-wrap p-5 rounded-xl border transition-all ${isDarkMode ? "text-rose-300 bg-rose-500/5 border-rose-500/10" : "text-rose-700 bg-rose-50/50 border-rose-200"}`}>{stderr}</pre>
              </div>
            )}

            {!stdout && !stderr && !busy && (
              <div className="flex h-full flex-col items-center justify-center gap-6 opacity-[0.05] grayscale select-none">
                <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span className={`text-[11px] font-black uppercase tracking-[0.5em] transition-colors ${isDarkMode ? "text-white" : "text-slate-900"}`}>Ready</span>
              </div>
            )}
          </div>

          <div className={`flex h-10 shrink-0 items-center justify-between border-t px-8 transition-colors ${isDarkMode ? "border-white/5 bg-black/40" : "border-slate-100 bg-slate-50/50"}`}>
             <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>v0.5.0 Stable (Zero-Friction)</span>
             <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>Buffer: {activeLangId}</span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={`relative z-10 flex h-16 shrink-0 items-center justify-between border-t px-8 backdrop-blur-3xl transition-colors ${isDarkMode ? "border-white/5 bg-black/20" : "border-slate-200 bg-white/40"}`}>
        <div className="flex items-center gap-6">
           <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>
              <span>Status</span>
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className={isDarkMode ? "text-emerald-400/60" : "text-emerald-600"}>All Systems Operational</span>
           </div>
        </div>
        
        <a 
          href="https://www.linkedin.com/in/syedmukheeth/" 
          target="_blank" 
          rel="noopener noreferrer"
          className={`flex items-center gap-2.5 group transition-all duration-500 hover:scale-105 active:scale-95`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-[0.3em] transition-colors ${isDarkMode ? "text-white/20 group-hover:text-white/40" : "text-slate-400 group-hover:text-slate-600"}`}>built by</span>
          <span className={`text-[11px] font-black uppercase tracking-[0.4em] transition-all bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent group-hover:from-blue-500 group-hover:to-indigo-600 drop-shadow-sm`}>syed mukheeth</span>
          <svg className={`h-4 w-4 transition-all duration-500 group-hover:translate-x-1 group-hover:-translate-y-1 ${isDarkMode ? "text-white/20 group-hover:text-white/60" : "text-slate-300 group-hover:text-blue-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>

        <div className={`flex items-center gap-6 text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/10" : "text-slate-300"}`}>
           <span className="hover:text-blue-500 transition-colors cursor-pointer">Terms</span>
           <span className="hover:text-blue-500 transition-colors cursor-pointer">Privacy</span>
           <span className="hover:text-blue-500 transition-colors cursor-pointer">Docs</span>
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

