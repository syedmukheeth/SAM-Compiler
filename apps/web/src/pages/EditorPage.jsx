import React, { useMemo, useRef, useState } from "react";
import ActivityBar from "../components/ActivityBar";
import Sidebar from "../components/Sidebar";
import EditorTabs from "../components/EditorTabs";
import TerminalPanel from "../components/TerminalPanel";
import StatusBar from "../components/StatusBar";
import CodeEditor from "../components/CodeEditor";
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket } from "../services/socketClient";

const defaultFiles = [
  { path: "src", name: "src", icon: "▸", depth: 0, type: "folder" },
  { path: "src/index.js", name: "index.js", icon: "🟨", depth: 1, type: "file" },
  { path: "src/app.js", name: "app.js", icon: "🟨", depth: 1, type: "file" },
  { path: "main.py", name: "main.py", icon: "🐍", depth: 0, type: "file" },
  { path: "main.cpp", name: "main.cpp", icon: "⬡", depth: 0, type: "file" },
  { path: "README.md", name: "README.md", icon: "📝", depth: 0, type: "file" }
];

const initialContent = {
  "src/index.js": `function main() {\n  console.log("Hello from LiquidIDE");\n}\n\nmain();\n`,
  "src/app.js": `export const add = (a, b) => a + b;\n`,
  "main.py": `print("Hello from LiquidIDE (python)")\n`,
  "main.cpp": `#include <iostream>\n\nint main() {\n  std::cout << "Hello from LiquidIDE (cpp)" << std::endl;\n  return 0;\n}\n`,
  "README.md": `# LiquidIDE\n\nA modern browser IDE UI scaffold.\n`
};

export default function EditorPage() {
  const [activity, setActivity] = useState("explorer");
  const [files] = useState(defaultFiles);
  const [openTabs, setOpenTabs] = useState([
    { id: "src/index.js", title: "index.js", icon: "🟨", dirty: false },
    { id: "README.md", title: "README.md", icon: "📝", dirty: false }
  ]);
  const [activeTabId, setActiveTabId] = useState("src/index.js");
  const [buffers, setBuffers] = useState(initialContent);
  const [terminalTab, setTerminalTab] = useState("Terminal");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [runStatus, setRunStatus] = useState("Ready");
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 });
  const [runLanguage, setRunLanguage] = useState("nodejs"); // nodejs|python|cpp
  const [busy, setBusy] = useState(false);
  const runRef = useRef({ jobId: null });

  const editorLanguage = useMemo(() => {
    if (activeTabId.endsWith(".py")) return "python";
    if (activeTabId.endsWith(".cpp")) return "cpp";
    return "nodejs";
  }, [activeTabId]);

  function openFile(path) {
    setActivity("explorer");
    setActiveTabId(path);
    setOpenTabs((tabs) => {
      if (tabs.some((t) => t.id === path)) return tabs;
      const title = path.split("/").pop();
      const icon = title?.endsWith(".md") ? "📝" : title?.endsWith(".py") ? "🐍" : title?.endsWith(".cpp") ? "⬡" : "🟨";
      return [...tabs, { id: path, title, icon, dirty: false }];
    });
  }

  function closeTab(id) {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t.id !== id);
      if (activeTabId === id) setActiveTabId(next[0]?.id ?? "");
      return next;
    });
  }

  function onChange(value) {
    setBuffers((b) => ({ ...b, [activeTabId]: value ?? "" }));
    setOpenTabs((tabs) => tabs.map((t) => (t.id === activeTabId ? { ...t, dirty: true } : t)));
  }

  async function onRun() {
    const code = buffers[activeTabId] ?? "";
    const language = activeTabId.endsWith(".py") ? "python" : activeTabId.endsWith(".cpp") ? "cpp" : runLanguage;

    setBusy(true);
    setTerminalTab("Output");
    setStdout("");
    setStderr("");
    setRunStatus("Running");

    try {
      const { jobId } = await submitRun({ language, code });
      runRef.current.jobId = jobId;

      // Subscribe to realtime logs
      const socket = getSocket();
      socket.emit("subscribe", { jobId });

      const onLog = (evt) => {
        if (!evt || runRef.current.jobId !== jobId) return;
        if (evt.type === "stdout" && typeof evt.chunk === "string") setStdout((s) => s + evt.chunk);
        if (evt.type === "stderr" && typeof evt.chunk === "string") setStderr((s) => s + evt.chunk);
        if (evt.type === "end") {
          setRunStatus(evt.status ?? "Done");
        }
      };

      socket.on("exec:log", onLog);

      // Poll for final status/result (authoritative, and fallback if socket drops)
      await pollUntilDone(jobId, {
        onUpdate: (s) => {
          setRunStatus(s.status ?? "Running");
          // don't clobber streamed output unless backend has more
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
    <div className="h-full text-white">
      <div className="flex h-[calc(100%-32px)] gap-3 p-3">
        <ActivityBar activeId={activity} onChange={setActivity} />
        <Sidebar files={files} activePath={activeTabId} onOpen={openFile} />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white/80">Workspace</div>
            <div className="flex items-center gap-2">
              <div className="glass-panel flex items-center gap-2 rounded-xl px-2 py-1.5">
                <span className="text-[11px] text-white/55">Run as</span>
                <select
                  value={runLanguage}
                  onChange={(e) => setRunLanguage(e.target.value)}
                  className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/80 outline-none ring-1 ring-white/10 transition focus:ring-sky-400/40"
                  disabled={busy || editorLanguage !== "nodejs"}
                  title={editorLanguage !== "nodejs" ? "Language is determined by the file extension" : "Select runtime"}
                >
                  <option value="nodejs">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="cpp">C++</option>
                </select>
              </div>
              <button
                type="button"
                onClick={onRun}
                disabled={busy || !buffers[activeTabId]}
                className="glass-panel rounded-xl px-3 py-2 text-xs font-semibold text-white/85 transition duration-200 ease-out hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Running…" : "▶ Run"}
              </button>
              <button
                type="button"
                className="glass-panel rounded-xl px-3 py-2 text-xs text-white/70 transition duration-200 ease-out hover:bg-white/10"
              >
                Share
              </button>
            </div>
          </div>

          <EditorTabs tabs={openTabs} activeId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />

          <div className="editor-container relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-0">
              <CodeEditor
                language={editorLanguage === "nodejs" ? runLanguage : editorLanguage}
                value={buffers[activeTabId] ?? ""}
                onChange={onChange}
                onCursorChange={setCursor}
              />
            </div>
          </div>

          <TerminalPanel
            activeTab={terminalTab}
            onTabChange={setTerminalTab}
            stdout={stdout}
            stderr={stderr}
            height={220}
          />
        </div>
      </div>

      <StatusBar
        language={(editorLanguage === "nodejs" ? runLanguage : editorLanguage).toUpperCase()}
        position={`Ln ${cursor.lineNumber}, Col ${cursor.column}`}
        status={runStatus}
      />
    </div>
  );
}

