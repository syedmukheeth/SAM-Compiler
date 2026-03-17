import React, { useRef, useState } from "react";
import ActivityBar from "../components/ActivityBar";
import CodeEditor from "../components/CodeEditor";
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket } from "../services/socketClient";

const languageConfigs = {
  cpp: { name: "main.cpp", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", template: `#include <iostream>\n\nint main() {\n  std::cout << "Hello from LiquidIDE C++" << std::endl;\n  return 0;\n}\n`, lang: "cpp" },
  python: { name: "main.py", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg", template: `print("Hello from LiquidIDE Python")\n`, lang: "python" },
  javascript: { name: "main.js", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg", template: `console.log("Hello from LiquidIDE JS");\n`, lang: "nodejs" },
  java: { name: "Main.java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg", template: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from LiquidIDE Java");\n  }\n}\n`, lang: "java" },
  go: { name: "main.go", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg", template: `package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello from LiquidIDE Go")\n}\n`, lang: "go" }
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
  const [showGithubModal, setShowGithubModal] = useState(false);
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

  async function onSaveToGithub(githubData) {
    const code = buffers[activeLangId] ?? "";
    const path = activeConfig.name;

    setBusy(true);
    setRunStatus("Saving to GitHub...");

    try {
      const response = await fetch("http://localhost:8080/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: githubData.token,
          repo: githubData.repo,
          path: path,
          content: code,
          message: githubData.message || `Saved via LiquidIDE`
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Push failed");

      alert(`Successfully saved to GitHub! Check it out: ${result.url}`);
      setShowGithubModal(false);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setBusy(false);
      setRunStatus("Ready");
    }
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden p-4">
      {/* Background Decorative Glows */}
      <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-purple-600/10 blur-[120px]" />

      {/* Sidebar */}
      <ActivityBar activeLanguage={activeLangId} onLanguageChange={setActiveLangId} />

      {/* Main Workspace */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden py-4 pr-4">
        {/* Top Floating Glass Header */}
        <div className="flux-glass flex h-16 w-full items-center justify-between rounded-3xl px-8 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
              <img src={activeConfig.icon} alt={activeConfig.lang} className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white/90">{activeConfig.name}</h1>
              <p className="text-[10px] uppercase tracking-widest text-white/30">{activeConfig.lang}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGithubModal(true)}
              className="flux-button-secondary flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              <span>Save</span>
            </button>
            <button
              onClick={onRun}
              disabled={busy}
              className="flux-button-primary flex items-center gap-2 px-8"
            >
              {busy ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
              <span>{busy ? "Running" : "Flux Run"}</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* Editor Container */}
          <div className="flux-glass relative flex-[3] overflow-hidden rounded-[2rem] shadow-2xl transition-all duration-500 hover:shadow-blue-500/5">
            <div className="absolute left-6 top-6 z-10 hidden rounded-full bg-blue-500/20 px-3 py-1 text-[10px] font-bold text-blue-400 backdrop-blur-md lg:block">
              WORKSPACE
            </div>
            <div className="h-full w-full pt-4">
              <CodeEditor
                language={activeLangId === "javascript" ? "javascript" : activeLangId}
                value={buffers[activeLangId]}
                onChange={onCodeChange}
              />
            </div>
          </div>

          {/* Output Container */}
          <div className="flux-glass flex flex-[1.2] flex-col overflow-hidden rounded-[2rem] shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-white/5 px-6">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Terminal Output</span>
              <button 
                onClick={() => { setStdout(""); setStderr(""); }}
                className="text-[10px] font-bold text-white/20 transition-colors hover:text-white/60"
              >
                CLEAR
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed">
              {stdout && <pre className="whitespace-pre-wrap text-emerald-400/90 [text-shadow:0_0_20px_rgba(52,211,153,0.3)]">{stdout}</pre>}
              {stderr && <pre className="whitespace-pre-wrap text-rose-400/90 [text-shadow:0_0_20px_rgba(251,113,113,0.3)]">{stderr}</pre>}
              
              {!stdout && !stderr && !busy && (
                <div className="flex h-full flex-col items-center justify-center gap-3 opacity-20">
                  <div className="h-1 w-12 rounded-full bg-white/50" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Awaiting Flux</span>
                </div>
              )}
              
              {busy && !stdout && !stderr && (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <div className="flex gap-1">
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-400/60">Processing Liquid Code</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-white/5 bg-white/[0.02] px-6 py-3 text-[10px]">
              <div className={["h-2 w-2 rounded-full", runStatus === "failed" ? "bg-rose-500 shadow-[0_0_10px_#f43f5e]" : "bg-emerald-500 shadow-[0_0_10px_#10b981]"].join(" ")} />
              <span className="font-bold uppercase tracking-widest text-white/30">{runStatus}</span>
            </div>
          </div>
        </div>
      </div>

      {showGithubModal && (
        <GithubSaveModal 
          onClose={() => setShowGithubModal(false)}
          onSave={onSaveToGithub}
          activeFile={activeConfig.name}
        />
      )}
    </div>
  );
}

function GithubSaveModal({ onClose, onSave, activeFile }) {
  const [data, setData] = useState({ token: "", repo: "", message: "" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="flux-glass w-full max-w-md rounded-[2.5rem] p-10 shadow-3xl">
        <h2 className="mb-2 text-3xl font-black tracking-tight">Save Push</h2>
        <p className="mb-8 text-xs font-bold uppercase tracking-widest text-white/30">Liquid to GitHub Sync</p>
        
        <div className="mb-8 flex flex-col gap-4">
          <div className="space-y-1">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-white/20">Security Token</label>
            <input 
              placeholder="PA Token"
              type="password"
              className="w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-sm outline-none transition-all focus:border-blue-500/50 focus:bg-white/[0.08]"
              value={data.token}
              onChange={(e) => setData({ ...data, token: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-white/20">Target Repository</label>
            <input 
              placeholder="Repo Name"
              className="w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-sm outline-none transition-all focus:border-blue-500/50 focus:bg-white/[0.08]"
              value={data.repo}
              onChange={(e) => setData({ ...data, repo: e.target.value })}
            />
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <button 
            className="flux-button-primary h-14 w-full rounded-2xl text-base font-black uppercase tracking-widest"
            onClick={() => onSave(data)}
          >
            Initiate Push
          </button>
          <button 
            onClick={onClose}
            className="h-10 text-[11px] font-black uppercase tracking-[0.3em] text-white/20 transition-colors hover:text-white/60"
          >
            DISCARD
          </button>
        </div>
      </div>
    </div>
  );
}

