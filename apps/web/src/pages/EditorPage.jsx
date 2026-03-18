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
  const [activeTab, setActiveTab] = useState("description"); // description, solution, etc.
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
      <header className="flex h-12 items-center justify-between border-b border-white/5 bg-[#1a1a1a]/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-[12px]">L</div>
            <span className="text-sm font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">Liquid IDE</span>
          </div>
          <nav className="flex items-center gap-4 text-[12px] font-medium text-white/40">
            <button className="hover:text-white transition-colors">Problems</button>
            <button className="text-blue-500">Editor</button>
            <button className="hover:text-white transition-colors">Contest</button>
            <button className="hover:text-white transition-colors">Discuss</button>
          </nav>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex h-8 items-center gap-1 rounded-lg bg-white/5 p-1">
            <button className="h-full rounded-md px-3 text-[11px] font-bold text-white transition-all hover:bg-white/5">Sign In</button>
            <button className="h-full rounded-md bg-blue-600 px-3 text-[11px] font-bold text-white shadow-lg shadow-blue-500/10">Premium</button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex flex-1 overflow-hidden p-2 gap-2">
        {/* Left Panel - Problem Description */}
        <section className="flex flex-[0.8] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1e1e1e]">
          <div className="flex h-10 items-center gap-4 border-b border-white/5 bg-white/5 px-4">
            <button 
              onClick={() => setActiveTab("description")}
              className={`text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === "description" ? "text-blue-400 border-b-2 border-blue-400 h-full" : "text-white/40 hover:text-white/60"}`}
            >
              Description
            </button>
            <button 
              onClick={() => setActiveTab("submissions")}
              className={`text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === "submissions" ? "text-blue-400 border-b-2 border-blue-400 h-full" : "text-white/40 hover:text-white/60"}`}
            >
              Submissions
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 prose prose-invert max-w-none">
            <h1 className="text-xl font-bold mb-4">1. Two Sum</h1>
            <div className="flex gap-2 mb-6">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-widest">Easy</span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/40 text-[10px] font-bold uppercase tracking-widest">Array</span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/40 text-[10px] font-bold uppercase tracking-widest">Hash Table</span>
            </div>
            
            <p className="text-sm text-white/70 leading-relaxed mb-4">
              Given an array of integers <code>nums</code> and an integer <code>target</code>, return indices of the two numbers such that they add up to <code>target</code>.
            </p>
            <p className="text-sm text-white/70 leading-relaxed mb-6">
              You may assume that each input would have <strong>exactly one solution</strong>, and you may not use the same element twice.
            </p>

            <h3 className="text-sm font-bold mb-3 text-white">Example 1:</h3>
            <div className="bg-black/30 rounded-lg p-4 font-mono text-xs text-white/60 mb-6">
              <p><strong>Input:</strong> nums = [2,7,11,15], target = 9</p>
              <p><strong>Output:</strong> [0,1]</p>
              <p><strong>Explanation:</strong> Because nums[0] + nums[1] == 9, we return [0, 1].</p>
            </div>

            <h3 className="text-sm font-bold mb-3 text-white">Constraints:</h3>
            <ul className="text-sm text-white/60 list-disc ml-4 space-y-1">
              <li><code>2 &lt;= nums.length &lt;= 10⁴</code></li>
              <li><code>-10⁹ &lt;= nums[i] &lt;= 10⁹</code></li>
              <li><code>-10⁹ &lt;= target &lt;= 10⁹</code></li>
            </ul>
          </div>
        </section>

        {/* Right Panel - Editor & Console */}
        <section className="flex flex-[1.2] flex-col overflow-hidden gap-2">
          {/* Editor Area */}
          <div className="flex flex-[2] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1e1e1e]">
            {/* Editor Toolbar */}
            <div className="flex h-10 items-center justify-between border-b border-white/5 bg-white/5 px-4">
              <div className="flex items-center gap-4">
                <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} />
                <button className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 hover:text-white transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Reset
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={onRun}
                  disabled={busy}
                  className="flex h-7 items-center gap-2 rounded-md bg-white/5 px-3 text-[11px] font-bold text-white transition-all hover:bg-white/10 disabled:opacity-50"
                >
                  {busy ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <svg className="h-3.5 w-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>}
                  Run
                </button>
                <button className="flex h-7 items-center gap-2 rounded-md bg-blue-600 px-3 text-[11px] font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500">
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                  Submit
                </button>
              </div>
            </div>
            
            {/* Real Monaco Editor */}
            <div className="flex-1 overflow-hidden">
               <CodeEditor
                language={activeLangId === "javascript" ? "nodejs" : activeLangId}
                value={buffers[activeLangId]}
                onChange={onCodeChange}
              />
            </div>
          </div>

          {/* Console / Output Area */}
          <div className={`flex transition-all duration-300 ${isOutputVisible ? "flex-[0.8]" : "h-10"} flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1e1e1e]`}>
            <div className="flex h-10 items-center justify-between border-b border-white/5 bg-white/5 px-4 shrink-0">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsOutputVisible(true)}
                  className={`text-[11px] font-bold uppercase tracking-wider transition-all ${isOutputVisible ? "text-emerald-400 border-b-2 border-emerald-400 h-10" : "text-white/40"}`}
                >
                  Console
                </button>
                <button className="text-[11px] font-bold uppercase tracking-wider text-white/40 hover:text-white/60">Testcase</button>
              </div>
              <button 
                onClick={() => setIsOutputVisible(!isOutputVisible)}
                className="text-white/20 hover:text-white/60 transition-colors"
              >
                <svg className={`h-4 w-4 transition-transform ${isOutputVisible ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            
            {isOutputVisible && (
              <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                {busy && !stdout && !stderr && (
                  <div className="flex h-full items-center justify-center gap-3 text-blue-400/60 font-medium">
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
                    <span>Executing code...</span>
                  </div>
                )}
                
                {stdout && (
                  <div className="mb-4">
                    <p className="text-white/30 uppercase text-[9px] font-black mb-1 tracking-widest">Standard Output</p>
                    <pre className="whitespace-pre-wrap text-emerald-400/90">{stdout}</pre>
                  </div>
                )}
                
                {stderr && (
                  <div>
                    <p className="text-rose-500/30 uppercase text-[9px] font-black mb-1 tracking-widest">Runtime Error</p>
                    <pre className="whitespace-pre-wrap text-rose-400/90">{stderr}</pre>
                  </div>
                )}

                {!stdout && !stderr && !busy && (
                  <div className="flex h-full flex-col items-center justify-center opacity-20 italic">
                    You must run your code to see results.
                  </div>
                )}
              </div>
            )}
            
            <div className="flex h-8 items-center border-t border-white/5 bg-black/20 px-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full ${runStatus === "Done" ? "bg-emerald-500" : runStatus === "Failed" ? "bg-rose-500" : "bg-white/20"}`} />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{runStatus}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      {/* Footer / Status Bar */}
      <footer className="flex h-8 items-center justify-between border-t border-white/5 bg-[#1a1a1a] px-4">
        <div className="flex items-center gap-4 text-[10px] text-white/30 font-medium">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
            <span>System Online</span>
          </div>
          <span>v0.1.0-alpha</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-white/30 font-medium">
          <span>Row 1, Col 1</span>
          <span>Tab Size: 2</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}

