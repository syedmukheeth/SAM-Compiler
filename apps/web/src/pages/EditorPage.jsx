import React, { useRef, useState } from "react";
import CodeEditor from "../components/CodeEditor";
import LanguageSelector from "../components/LanguageSelector";
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket } from "../services/socketClient";

const languageConfigs = {
  cpp: { name: "solution.cpp", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", template: `#include <iostream>\n\nint main() {\n  // Write your code here\n  std::cout << "Hello from LiquidIDE C++" << std::endl;\n  return 0;\n}\n`, lang: "cpp" },
  python: { name: "solution.py", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg", template: `import sys\n\ndef main():\n    # Write your code here\n    print("Hello from LiquidIDE Python")\n\nif __name__ == "__main__":\n    main()\n`, lang: "python" },
  javascript: { name: "solution.js", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg", template: `// Write your code here\nconsole.log("Hello from LiquidIDE JS");\n`, lang: "nodejs" },
  java: { name: "Solution.java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg", template: `import java.util.*;\n\npublic class Solution {\n  public static void main(String[] args) {\n    // Write your code here\n    System.out.println("Hello from LiquidIDE Java");\n  }\n}\n`, lang: "java" },
  go: { name: "solution.go", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg", template: `package main\n\nimport "fmt"\n\nfunc main() {\n  // Write your code here\n  fmt.Println("Hello from LiquidIDE Go")\n}\n`, lang: "go" }
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
  const [isOutputVisible, setIsOutputVisible] = useState(true);
  
  const runRef = useRef({ jobId: null });
  const activeConfig = languageConfigs[activeLangId];

  function onCodeChange(value) {
    setBuffers((b) => ({ ...b, [activeLangId]: value ?? "" }));
  }

  async function onRun() {
    const code = buffers[activeLangId] ?? "";
    const language = activeConfig.lang;

    setBusy(true);
    setStdout("");
    setStderr("");
    setRunStatus("Running");
    setIsOutputVisible(true);

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
    } catch (e) {
      setRunStatus("Failed");
      setStderr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#0a0a0a] text-white">
      {/* Top Navbar */}
      <header className="flex h-14 items-center justify-between border-b border-white/5 bg-[#161616] px-6">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-[14px] shadow-lg shadow-blue-500/20">L</div>
            <span className="text-base font-black tracking-tight text-white/90">Liquid Compiler</span>
          </div>
          <nav className="flex items-center gap-6 text-[12px] font-bold text-white/30">
            <button className="text-blue-500">Editor</button>
            <button className="hover:text-white transition-colors">History</button>
            <button className="hover:text-white transition-colors">Settings</button>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="text-[11px] font-bold text-white/40 hover:text-white transition-colors">Docs</button>
          <div className="h-4 w-px bg-white/10" />
          <button className="h-9 rounded-xl bg-white/5 px-5 text-[12px] font-black text-white/80 transition-all hover:bg-white/10 border border-white/5">Sign In</button>
          <button className="h-9 rounded-xl bg-blue-600 px-5 text-[12px] font-black text-white shadow-xl shadow-blue-500/20 transition-all hover:bg-blue-500">Go Pro</button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Full Width Compiler Container */}
        <section className="flex flex-1 flex-col overflow-hidden gap-4">
          {/* Editor Area */}
          <div className="flex flex-[2] flex-col overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#151515] shadow-3xl">
            {/* Editor Toolbar */}
            <div className="flex h-14 items-center justify-between border-b border-white/5 bg-white/[0.02] px-8">
              <div className="flex items-center gap-6">
                <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} />
                <button className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Reset
                </button>
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={onRun}
                  disabled={busy}
                  className="flex h-10 items-center gap-3 rounded-2xl bg-white/5 px-6 text-[12px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/10 hover:border-white/10 border border-white/5 disabled:opacity-50"
                >
                  {busy ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>}
                  Flux Run
                </button>
              </div>
            </div>
            
            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden py-4">
               <CodeEditor
                language={activeLangId === "javascript" ? "nodejs" : activeLangId}
                value={buffers[activeLangId]}
                onChange={onCodeChange}
              />
            </div>
          </div>

          {/* Console Output area Area */}
          <div className={`flex transition-all duration-500 ease-in-out ${isOutputVisible ? "flex-[0.7]" : "h-14"} flex-col overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#151515] shadow-3xl`}>
            <div className="flex h-14 items-center justify-between border-b border-white/5 bg-white/[0.02] px-8 shrink-0">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                   <div className={`h-2 w-2 rounded-full ${runStatus === "Done" ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : runStatus === "Failed" ? "bg-rose-500 shadow-[0_0_10px_#f43f5e]" : "bg-white/20"}`} />
                   <button 
                    onClick={() => setIsOutputVisible(true)}
                    className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${isOutputVisible ? "text-white" : "text-white/20 hover:text-white/40"}`}
                  >
                    Output Console
                  </button>
                </div>
              </div>
              <button 
                onClick={() => setIsOutputVisible(!isOutputVisible)}
                className="text-white/20 hover:text-white/60 transition-colors"
              >
                <svg className={`h-5 w-5 transition-transform duration-500 ${isOutputVisible ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            
            {isOutputVisible && (
              <div className="flex-1 overflow-auto p-8 font-mono text-[13px] leading-relaxed">
                {busy && !stdout && !stderr && (
                  <div className="flex h-full items-center justify-center gap-4 text-blue-400/40 font-black uppercase tracking-[0.3em]">
                    <div className="flex gap-1">
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500/40" style={{animationDelay: "-0.3s"}} />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500/40" style={{animationDelay: "-0.15s"}} />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500/40" />
                    </div>
                    <span>Processing</span>
                  </div>
                )}
                
                {stdout && (
                  <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <p className="text-white/20 uppercase text-[9px] font-black mb-3 tracking-[0.3em] flex items-center gap-3">
                      <span className="h-px flex-1 bg-white/5"></span>
                      Standard Out
                      <span className="h-px flex-1 bg-white/5"></span>
                    </p>
                    <pre className="whitespace-pre-wrap text-emerald-400/90 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">{stdout}</pre>
                  </div>
                )}
                
                {stderr && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <p className="text-rose-500/30 uppercase text-[9px] font-black mb-3 tracking-[0.3em] flex items-center gap-3">
                      <span className="h-px flex-1 bg-rose-500/10"></span>
                      Execution Error
                      <span className="h-px flex-1 bg-rose-500/10"></span>
                    </p>
                    <pre className="whitespace-pre-wrap text-rose-400/90 drop-shadow-[0_0_15px_rgba(251,113,113,0.3)]">{stderr}</pre>
                  </div>
                )}

                {!stdout && !stderr && !busy && (
                  <div className="flex h-full flex-col items-center justify-center opacity-10">
                    <svg className="h-12 w-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span className="text-[10px] font-black uppercase tracking-[0.5em]">Ready for Flux</span>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex h-10 items-center justify-between border-t border-white/5 bg-white/[0.01] px-8 shrink-0">
               <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Liquid Runtime Engine v0.1</span>
               <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-white/10">
                 <span>Status: {runStatus}</span>
                 <span>Buffer: {activeLangId}</span>
               </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

