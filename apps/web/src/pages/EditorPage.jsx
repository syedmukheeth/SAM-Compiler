import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import CodeEditor from "../components/CodeEditor";
import LanguageSelector from "../components/LanguageSelector";
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { pollUntilDone, submitRun } from "../services/codeExecutionApi";
import { getSocket, getSocketStatus } from "../services/socketClient";
import { parseErrors } from "../services/errorParser";

// LAZY LOAD PERFORMANCE HYDRATION (Code-Splitting)
const SettingsModal = React.lazy(() => import("../components/SettingsModal"));
const AuthModal     = React.lazy(() => import("../components/AuthModal"));
const HistoryPanel  = React.lazy(() => import("../components/HistoryPanel"));
const AiPanel       = React.lazy(() => import("../components/AiPanel"));
const AboutModal    = React.lazy(() => import("../components/AboutModal"));

import StatusBar from "../components/StatusBar";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAuth } from "../hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";

import { 
  Sparkles, Keyboard, Clock, Menu, X, Play, Check, RotateCcw, 
  CircleHelp, Loader2 
} from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from "framer-motion";
import ENDPOINTS from "../services/endpoints";
import OfficialLogo, { OFFICIAL_LOGO_WHITE, OFFICIAL_LOGO_BLACK } from "../components/OfficialLogo";

// Standalone components imported for clean scoping
import ThemeToggle from "../components/ThemeToggle";
import SamNavLogo from "../components/SamNavLogo";
import ShortcutItem from "../components/ShortcutItem";
import MobileTabNav from "../components/MobileTabNav";
import { useIsCompactLayout } from "../hooks/useMediaQuery";

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

const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

/** How each runtime reports "I asked for input and there was none left". */
const STDIN_EXHAUSTED =
  /EOFError|NoSuchElementException|InputMismatchException|Could not read|unexpected end of (?:file|input)|std::bad_alloc: basic_ios/i;

/**
 * Loads Pyodide exactly once per page, no matter how many times the component
 * mounts. Kept at module scope so React StrictMode's double-invoked effects
 * share a single in-flight promise instead of racing or cancelling each other.
 */
let pyodidePromise = null;
function loadPyodideOnce() {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = new Promise((resolve, reject) => {
    const start = () =>
      window
        .loadPyodide({ indexURL: PYODIDE_BASE })
        .then(resolve)
        .catch((err) => {
          pyodidePromise = null; // allow a later retry
          reject(err);
        });

    if (window.loadPyodide) return start();

    const script = document.createElement("script");
    script.src = `${PYODIDE_BASE}pyodide.js`;
    script.onload = start;
    script.onerror = () => {
      pyodidePromise = null;
      script.remove();
      reject(new Error("Could not download the Python engine. Check your connection."));
    };
    document.head.appendChild(script);
  });

  return pyodidePromise;
}

/** xterm colour scheme, applied on mount and updated in place on theme change. */
function buildTerminalTheme(theme) {
  const isDark = theme === "dark";
  return {
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
  };
}

export default function EditorPage() {
  // --- 1. Framework Hooks (High Priority) ---
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, loginUser, logoutUser, loading: authLoading } = useAuth();
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const [guestFlag, setGuestFlag] = useState(() => localStorage.getItem('sam_is_guest') === '1');

  // Derived, not synced. Previously an effect called setIsGuest(false) in its
  // body whenever `user` changed, which triggers a cascading re-render; a
  // signed-in user is simply never a guest.
  const isGuest = !user && guestFlag;

  const setIsGuest = useCallback((value) => {
    setGuestFlag(value);
    if (value) localStorage.setItem('sam_is_guest', '1');
    else localStorage.removeItem('sam_is_guest');
  }, []);

  useEffect(() => {
    if (user) localStorage.removeItem('sam_is_guest');
  }, [user]);
  // --- 2. State Hooks ---
  const [activeLangId, setActiveLangId] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem("sam_active_lang") || "cpp";
    }
    return "cpp";
  });

  const [buffers, setBuffers] = useState(() => {
    const defaults = Object.fromEntries(
      Object.entries(languageConfigs).map(([id, cfg]) => [id, cfg.template])
    );
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem("sam_code_buffers");
        if (saved) {
          const parsed = JSON.parse(saved);
          // SANITIZE: Detect and clear Code Soup from localStorage.
          // If a buffer contains duplicate template phrases from a past race condition,
          // reset it to the canonical template rather than poisoning new Yjs rooms.
          const SOUP_MARKER = "Welcome to SAM Compiler!";
          const sanitized = {};
          for (const [id, cfg] of Object.entries(languageConfigs)) {
            const buf = parsed[id] ?? cfg.template;
            const occurrences = (buf.match(new RegExp(SOUP_MARKER, "g")) || []).length;
            sanitized[id] = occurrences > 1 ? cfg.template : buf;
          }
          return sanitized;
        }
      }
    } catch {
      // Corrupt localStorage payload - fall through to defaults.
    }
    return defaults;
  });
  const [runStatus, setRunStatus] = useState("Ready");
  const [theme, setTheme] = useState(() => localStorage.getItem('sam-theme') || 'dark');
  // Lets the mount-once terminal effect read the current theme without taking
  // it as a dependency (which is what caused the terminal to be rebuilt).
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  // One "input is not interactive" notice per run, not per keystroke.
  const inputHintShownRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // "preparing" | "primary" | "sandbox" | "offline". This subsumes the separate
  // isEngineReady flag, which nothing rendered.
  const [engineMode, setEngineMode] = useState("preparing");
  // The "Engine Warming Up" overlay was wired to a state that was hardcoded
  // false, so a user waiting on a cold backend saw an idle, silent terminal and
  // no indication anything was happening.
  const isColdStarting = engineMode === "preparing" && !busy && runStatus === "Ready";
  const [failSafeActive, setFailSafeActive] = useState(false);
  // The health-poll effect reads this but cannot depend on it without
  // restarting the interval every time it flips; it previously closed over a
  // stale value instead.
  const failSafeActiveRef = useRef(failSafeActive);
  useEffect(() => { failSafeActiveRef.current = failSafeActive; }, [failSafeActive]);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [showStatusBanner, setShowStatusBanner] = useState(true);
  const [activeMobileTab, setActiveMobileTab] = useState('editor');
  const [errorMarkers, setErrorMarkers] = useState([]);
  const stdErrRef = useRef("");
  const [editorWidth, setEditorWidth] = useState(() => Number(localStorage.getItem('sam-editor-width')) || 50);
  const [aiWidth, setAiWidth] = useState(() => Number(localStorage.getItem('sam-ai-width-pct')) || 33.33);

  /**
   * Row layout: editor (fixed %) | terminal (flex:1) | AI (fixed %).
   * The terminal takes the remainder, so editor + AI must stay under 100 or it
   * collapses to zero width. Every setter goes through here to keep that true.
   */
  const applyLayout = useCallback((nextEditor, nextAi, aiVisible) => {
    const MIN_PANEL = 15;
    const MIN_TERMINAL = 15;
    const maxSingle = 100 - MIN_TERMINAL;

    let editor = Math.min(Math.max(nextEditor, MIN_PANEL), maxSingle);
    let ai = aiVisible ? Math.min(Math.max(nextAi, MIN_PANEL), maxSingle) : nextAi;

    if (aiVisible && editor + ai > maxSingle) {
      ai = Math.max(MIN_PANEL, maxSingle - editor);
      if (editor + ai > maxSingle) editor = Math.max(MIN_PANEL, maxSingle - ai);
    }

    setEditorWidth(editor);
    setAiWidth(ai);
    localStorage.setItem('sam-editor-width', String(editor));
    localStorage.setItem('sam-ai-width-pct', String(ai));
    return { editor, ai };
  }, []);
  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const [isResizingAi, setIsResizingAi] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  // Was `useState(window.innerWidth < 768)` fed by a debounced resize listener.
  // 768 disagreed with the `lg:` (1024px) utilities on the very elements it
  // controls, so 768-1023px rendered neither layout properly.
  const isCompact = useIsCompactLayout();

  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [pyodideError, setPyodideError] = useState(null);
  const [pendingAiPrompt, setPendingAiPrompt] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stdin, setStdin] = useState("");
  const [showInputPanel, setShowInputPanel] = useState(true);
  
  const [settings, setSettings] = useState(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem("sam_settings") : null;
      return saved ? JSON.parse(saved) : { fontSize: 14, tabSize: 2 };
    } catch { return { fontSize: 14, tabSize: 2 }; }
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
  // Read by finishRun, which is memoized with no deps so it cannot close over
  // the `stdin` state directly.
  const stdinRef = useRef("");
  const isMounted = useRef(true);

  // --- 4. Logic & Memoization ---



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
    window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template: code, notify: false } }));
    setBuffers(prev => ({ ...prev, [langId]: code }));
    toast.success('Code loaded from history', {
      style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '11px', fontWeight: 700 }
    });
  }, []);

  // DIAGNOSTIC ENGINE: Render line with high-fidelity colorization
  const renderDiagnosticLine = useCallback((line, hasError) => {
    if (!line) return "";
    const dim = "\x1b[2m";
    const white = "\x1b[37m";
    const boldRed = "\x1b[1;31m";
    const reset = "\x1b[0m";
    
    // GCC/Clang Error Format: file:line:col: error: message
    const gccRegex = /^([^:\n]+):(\d+):(?:(\d+):)?\s+(error|warning|fatal error):\s+(.*)/i;
    const gccMatch = line.match(gccRegex);
    
    if (gccMatch) {
      const [, file, lineNum, colNum, type, msg] = gccMatch;
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

  /**
   * Offline fallback: runs Python in the browser via Pyodide when the server
   * cannot be reached. Python used to take this path ALWAYS, which made it the
   * one language that behaved unlike the other four - no threading, no
   * subprocess, no real sys.stdin, and an infinite loop froze the tab. It now
   * goes to the cloud runtime like everything else and only lands here when
   * that fails.
   *
   * Pyodide is downloaded lazily on first use rather than on page load, because
   * a ~10MB CDN fetch is not worth paying for a fallback most sessions never
   * hit.
   */
  const runPythonInBrowser = useCallback(async (code, stdinText) => {
    let py;
    setPyodideError(null);
    setIsPyodideLoading(true);
    try {
      py = await loadPyodideOnce();
    } catch (err) {
      const message = err?.message || "Could not load the Python engine.";
      setPyodideError(message);
      throw new Error(message);
    } finally {
      setIsPyodideLoading(false);
    }

    let captured = "";
    const write = (str) => {
      captured += str;
      if (xtermRef.current) xtermRef.current.write(str.replace(/\n/g, "\r\n"));
    };
    py.setStdout({ batched: write });
    py.setStderr({ batched: write });

    // Pyodide ships numpy, pandas, matplotlib and friends, but only
    // materializes them on request. Without this call `import numpy` raised
    // ModuleNotFoundError even though the wheel was in the CDN bundle already.
    try {
      await py.loadPackagesFromImports(code);
    } catch (err) {
      write(`[SAM] Could not preload imported packages: ${err?.message || err}\n`);
    }

    // An empty STDIN panel has to behave like an empty pipe: `"".split("\n")`
    // yields [""], so the first input() returned "" instead of raising EOFError.
    py.globals.set("__sam_stdin_lines", stdinText ? stdinText.split("\n") : []);
    await py.runPythonAsync(`
import builtins, io, sys
_sam_text = "\\n".join(list(__sam_stdin_lines))
if _sam_text:
    _sam_text += "\\n"

# Patching only builtins.input left sys.stdin.read(), sys.stdin.readline() and
# everything that iterates sys.stdin (fileinput, csv.reader, pandas.read_csv)
# reading from nothing at all.
sys.stdin = io.StringIO(_sam_text)

def _sam_input(prompt=""):
    if prompt:
        print(prompt, end="")
    line = sys.stdin.readline()
    if not line:
        raise EOFError("EOF when reading a line")
    return line.rstrip("\\n")

builtins.input = _sam_input
    `);

    try {
      await py.runPythonAsync(code);
      return { status: "succeeded", stdout: captured, stderr: "" };
    } catch (err) {
      const message = err?.message || String(err);
      if (xtermRef.current) xtermRef.current.write(`\x1b[1;31m${message}\x1b[0m\r\n`);
      return { status: "failed", stdout: captured, stderr: message };
    }
  }, []);

  /**
   * Everything that must happen once a run reaches a terminal state, no matter
   * which executor produced it: Monaco squiggles, revealing the offending line,
   * arming Explain Error, and persisting guest history.
   *
   * This was inlined separately in the socket path and the polling path, and
   * omitted altogether from the Python path.
   */
  const finishRun = useCallback(({ success, stderr, stdout, language, code, jobId }) => {
    const { markers: diags, primaryLine, summary } = parseErrors(stderr || "", language);
    if (diags.length > 0) {
      setErrorMarkers(diags);
      if (window.samEditor && primaryLine) window.samEditor.revealLineInCenter(primaryLine);
    }
    if (!success && summary) {
      setPendingAiPrompt(`Explain and fix this error in my ${language} code:\n\n\`\`\`\n${summary}\n\`\`\``);
    }

    // Both executors are batch-only, so a program that asks for more input than
    // the STDIN panel holds dies on EOF. That reads as "the compiler is broken"
    // unless we name the cause.
    if (!success && !stdinRef.current.trim() && STDIN_EXHAUSTED.test(stderr || "") && xtermRef.current) {
      xtermRef.current.write(
        "\r\n\x1b[1;33m[SAM]\x1b[0m \x1b[2mYour program read past the end of its input. " +
        "Fill the STDIN panel before pressing Run.\x1b[0m\r\n"
      );
    }

    // PERSISTENT GUEST HISTORY ENGINE
    if (!userRef.current) {
      try {
        const raw = localStorage.getItem("sam_guest_history");
        const history = raw ? JSON.parse(raw) : [];
        const entry = {
          _id: jobId,
          runtime: language,
          status: success ? "succeeded" : "failed",
          createdAt: new Date().toISOString(),
          files: [{ content: code }],
          stdout: stdout || "",
          stderr: stderr || "",
          metrics: {}
        };
        localStorage.setItem("sam_guest_history", JSON.stringify([entry, ...history].slice(0, 20)));
      } catch {
        // A corrupt or full localStorage must not fail the run.
      }
    }
  }, []);

  const onRun = useCallback(async () => {
    if (busy) return;
    const code = window.samEditor ? window.samEditor.getValue() : buffers[activeLangId];
    const language = languageConfigs[activeLangId].lang;

    // REBOOT DIAGNOSTICS: Clear previous state.
    // These four assignments used to appear twice, straddling the boot banner.
    setErrorMarkers([]);
    setPendingAiPrompt(null);
    setRunStatus("Starting...");
    setBusy(true);
    hasReceivedOutputRef.current = false;
    stdErrRef.current = "";
    inputHintShownRef.current = false;
    stdinRef.current = stdin;

    if (isCompact) {
      setActiveMobileTab('terminal');
      setShowAiPanel(false);
    }

    const socket = getSocket(token);
    if (runRef.current.jobId && socket) {
      socket.emit("unsubscribe", { jobId: runRef.current.jobId });
      socket.off("exec:log");
    }

    // The terminal opens empty. The three-line "requesting cloud runtime /
    // configuring sandbox / execution start" banner that used to print here
    // described infrastructure the user did not ask about and pushed their
    // actual output down the panel; the status chip already says a run is in
    // flight.
    if (xtermRef.current) {
      xtermRef.current.reset();
      xtermRef.current.write("\x1b[2J\x1b[0;0H");
    }
    setRunStatus("Running");

    if (socket && !socket.connected) {
      // Kick the socket awake but do NOT wait for it. This used to block the
      // submission for up to 10 seconds on every run where the socket was not
      // already up - and it is not up on a cold start, which is exactly when
      // the run already feels slow. The HTTP submit plus polling below produces
      // the same output without the stall; the socket just streams it sooner
      // when it does connect.
      try { socket.connect(); } catch { /* polling covers this */ }
    }

    // Declared outside the try so the finally block can always detach the
    // listener and unsubscribe, even if the run throws part-way through.
    let jobId;
    // The listener attaches before submission, but the job id only exists once
    // submission resolves, and the server can stream before that. Frames in
    // that window are held rather than dropped.
    const pendingLogFrames = [];
    let jobIdAssigned = false;

    const handleLogFrame = (evt) => {
        if (evt.type === "stdout" || evt.type === "stderr") {
           const content = evt.chunk || "";
           if (content.trim()) {
             hasReceivedOutputRef.current = true;
           }
           if (xtermRef.current) {
             if (evt.type === "stdout") xtermRef.current.write(content.replace(/\n/g, "\r\n"));
             else {
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
          const { status: jobStatus } = evt.chunk || {};
          const success = jobStatus === "succeeded";
          
          if (!hasReceivedOutputRef.current && xtermRef.current && success) {
             xtermRef.current.write("\r\n\x1b[1;33m[SYSTEM] Program finished with no output.\x1b[0m\r\n");
          }

          if (xtermRef.current) {
            if (success) {
              xtermRef.current.write(`\r\n\x1b[1;32m=== Program Finished Successfully ===\x1b[0m\r\n`);
            } else {
              xtermRef.current.write(`\r\n\x1b[1;31m=== Code Exited With Errors ===\x1b[0m\r\n`);
            }
          }

          setRunStatus(jobStatus === 'succeeded' ? 'Succeeded' : (jobStatus ? jobStatus.toUpperCase() : 'Failed'));
          
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

          setBusy(false);
        }
    };

    // Buffers until the job id lands, then replays in order.
    const onLog = (evt) => {
      if (!evt) return;
      if (!jobIdAssigned) {
        pendingLogFrames.push(evt);
        return;
      }
      handleLogFrame(evt);
    };

    const flushPendingLogFrames = () => {
      jobIdAssigned = true;
      while (pendingLogFrames.length) handleLogFrame(pendingLogFrames.shift());
    };

    try {
      if (socket) {
        socket.off("exec:log"); // Clear any stale listeners
        socket.on("exec:log", onLog);
      }


      // NITRO: Direct Socket Submission (Bypasses HTTP overhead)
      let runToken;
      if (socket && socket.connected) {
        try {
          const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Socket submission timeout")), 5000);
            socket.emit("exec:start", { language, code, stdin }, (res) => {
              clearTimeout(timeout);
              if (res.error) reject(new Error(res.error));
              else resolve(res);
            });
          });
          jobId = response.jobId;
          runToken = response.runToken;
          setRunStatus("QUEUED"); // Instant feedback
        } catch {
          // Socket submission failed - fall back to HTTP.
          const result = await submitRun({ language, code, stdin });
          jobId = result.jobId;
          runToken = result.runToken;
        }
      } else {
        const result = await submitRun({ language, code, stdin });
        jobId = result.jobId;
        runToken = result.runToken;
        if (socket) {
          socket.emit("subscribe", { jobId });
        }
      }

      runRef.current.jobId = jobId;
      // Replay anything the server streamed between attaching the listener and
      // the submission resolving.
      flushPendingLogFrames();

      const finalState = await pollUntilDone(jobId, {
        runToken,
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

      // FALLBACK: If socket was silent (no output received), render from poll result
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

        if (success) {
          xtermRef.current.write(`\r\n\x1b[1;32m=== Program Finished Successfully ===\x1b[0m\r\n`);
        } else {
          xtermRef.current.write(`\r\n\x1b[1;31m=== Code Exited With Errors ===\x1b[0m\r\n`);
        }
        setRunStatus(finalState.status === 'succeeded' ? 'Succeeded' : (finalState.status.toUpperCase()));
        setBusy(false);
      }

      // Listener teardown also happens in `finally` - if anything between here
      // and there throws, the handler must still come off.

      if (finalState) {
        finishRun({
          success: finalState.status === 'succeeded',
          stderr: stdErrRef.current || finalState.stderr || "",
          stdout: finalState.stdout || "",
          language: activeLangId,
          code,
          jobId
        });
      }
    } catch (e) {
      const rawMsg = e?.message || String(e);
      const isHtml = /<[a-z][\s\S]*>/i.test(rawMsg);
      const cleanMsg = isHtml
        ? "Server returned an invalid response (HTML). The engine might be under maintenance."
        : rawMsg.substring(0, 200);

      // Python has a second engine available. When the cloud runtime is
      // unreachable (cold start, offline, rate limit) fall back to Pyodide in
      // the browser rather than showing the user an infrastructure error.
      if (activeLangId === "python") {
        try {
          if (xtermRef.current) {
            xtermRef.current.write("\x1b[1;33m[SAM]\x1b[0m \x1b[2mCloud runtime unavailable - running locally.\x1b[0m\r\n");
          }
          const result = await runPythonInBrowser(code, stdin);
          const success = result.status === "succeeded";

          if (xtermRef.current) {
            if (!result.stdout.trim() && success) {
              xtermRef.current.write("\r\n\x1b[1;33m[SYSTEM] Program finished with no output.\x1b[0m\r\n");
            }
            xtermRef.current.write(
              success
                ? "\r\n\x1b[1;32m=== Program Finished Successfully ===\x1b[0m\r\n"
                : "\r\n\x1b[1;31m=== Code Exited With Errors ===\x1b[0m\r\n"
            );
          }

          setRunStatus(success ? "Succeeded" : "Failed");
          finishRun({
            success,
            stderr: result.stderr,
            stdout: result.stdout,
            language: activeLangId,
            code,
            jobId: `local-${Date.now()}`
          });
          return;
        } catch (localErr) {
          const localMsg = localErr?.message || String(localErr);
          if (xtermRef.current) xtermRef.current.write(`\x1b[1;31mError: ${localMsg}\x1b[0m\r\n`);
          setRunStatus("Failed");
          setPendingAiPrompt(`Explain this error I'm getting from the SAM Compiler engine:\n\n${localMsg}\n\nIs this an issue with my code or the server?`);
          return;
        }
      }

      setRunStatus("Failed");
      if (xtermRef.current) xtermRef.current.write(`\x1b[1;31mError: ${cleanMsg}\x1b[0m\r\n`);
      setPendingAiPrompt(`Explain this error I'm getting from the SAM Compiler engine:\n\n${cleanMsg}\n\nIs this an issue with my code or the server?`);
    } finally {
      // This used to sit inside the `try`, so any throw on the way there
      // (including a failed poll) left a permanent exec:log handler behind,
      // holding a closure over the run's state. One leak per failed run.
      if (socket) {
        socket.off("exec:log", onLog);
        if (jobId) socket.emit("unsubscribe", { jobId });
      }
      setBusy(false);
    }
  }, [activeLangId, buffers, busy, token, isCompact, runPythonInBrowser, stdin, renderDiagnosticLine, finishRun]);

  const onClear = useCallback(() => {
    if (xtermRef.current) xtermRef.current.clear();
    setRunStatus("Ready");
  }, []);

  // Confirmations go through ConfirmDialog rather than window.confirm, which
  // ignores the theme, cannot be styled and is suppressible by the browser.
  const [confirmState, setConfirmState] = useState(null);

  const handleCodeReset = useCallback(() => {
    setConfirmState({
      title: "Reset workspace",
      message: `This replaces your ${activeLangId.toUpperCase()} code with the starter template. Unsaved changes cannot be recovered.`,
      confirmLabel: "Reset",
      destructive: true,
      onConfirm: () => {
        const template = languageConfigs[activeLangId]?.template || "";
        window.dispatchEvent(new CustomEvent('sam-editor-reset', { detail: { template, message: "Workspace reset to template" } }));
        setBuffers(prev => ({ ...prev, [activeLangId]: template }));
        setConfirmState(null);
      }
    });
  }, [activeLangId]);

  const startResizingEditor = useCallback((e) => {
    // startResizingAi called preventDefault but this one did not, so dragging
    // the editor splitter also began a native text/image selection.
    e?.preventDefault();
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
      
      applyLayout(pct, aiWidth, showAiPanel);
    });
  }, [isResizingEditor, showAiPanel, aiWidth, applyLayout]);

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
      
      applyLayout(editorWidth, pct, true);
    });
  }, [isResizingAi, editorWidth, applyLayout]);

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

  // Socket Initialization is handled in the status monitoring effect below to prevent duplicate mounts

  // Health check for worker availability (Backend sanity) & ADAPTIVE HEARTBEAT.
  //
  // Mounts once. It used to depend on `isEngineReady` purely to pick the poll
  // interval, which meant every flip of that flag tore down the interval, fired
  // an immediate extra check and started a new one - several requests inside the
  // same second, against an endpoint rate-limited to 100/minute. Tripping that
  // limiter made the health check fail, which flipped the flag again.
  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;
    let failSafeTimer = null;
    let ready = false;

    const applyReady = (value, mode) => {
      ready = value;
      setEngineMode(mode);
    };

    const checkStatus = async () => {
      if (!navigator.onLine) {
        applyReady(false, "offline");
        return;
      }
      try {
        // One request, not two: this endpoint wakes a sleeping Render instance
        // just as well as a root ping did, at half the rate-limit cost.
        const res = await fetch(`${ENDPOINTS.WS_ENDPOINT}/api/runs/health/queue`);
        if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        const canRun = Boolean(data.canExecute || data.workerOnline);
        applyReady(canRun, data.workerOnline ? "primary" : data.canExecute ? "sandbox" : "preparing");

        if (canRun) {
          if (failSafeTimer) { clearTimeout(failSafeTimer); failSafeTimer = null; }
          setFailSafeActive(false);
        }
      } catch {
        if (cancelled) return;
        // Transient network failure? Don't panic immediately unless navigator.onLine is false
        if (!navigator.onLine) {
          applyReady(false, "offline");
        } else if (!failSafeActiveRef.current) {
          // If we are online but the check fails, it might be a server-side waking state
          applyReady(false, "preparing");
        }
      }
    };

    // FAIL-SAFE: If engine isn't ready in 45s, allow sandbox anyway
    failSafeTimer = setTimeout(() => {
      failSafeTimer = null;
      if (cancelled || ready) return;
      applyReady(true, "sandbox");
      setFailSafeActive(true);
    }, 45000);

    const tick = async () => {
      await checkStatus();
      if (cancelled) return;
      // Slow cadence once the engine answers; while it is waking, 5s is often
      // enough for a Render cold start without hammering the limiter.
      pollTimer = setTimeout(tick, ready ? 180000 : 5000);
    };
    tick();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (failSafeTimer) clearTimeout(failSafeTimer);
    };
  }, []);

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

  // Responsive layout now comes from useIsCompactLayout() (matchMedia), which
  // fires only when the breakpoint is actually crossed. The debounced resize
  // listener that used to live here ran on every resize frame and left the
  // layout 150ms behind the viewport.

  // Lifecycle safety
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Socket status monitoring with Stability Timer
  useEffect(() => {
    // No wake ping here: the health-check effect above already polls this
    // endpoint, and this effect re-ran on every mobile tab switch, which turned
    // tab switching into extra requests against a rate-limited endpoint.
    const existing = getSocket(token);

    // The socket is a module-level singleton, so arriving here from another
    // route (or a remount) means the "connected" event has already fired and
    // will not fire again - the status bar then said SYNCING forever. Adopt the
    // status the client already has before listening for changes.
    const currentStatus = existing?.connected ? "connected" : getSocketStatus();
    // Adopting an existing external state on mount is exactly what an effect is
    // for; there is no render-time source for it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocketStatus(currentStatus);
    if (currentStatus === "connected") setShowStatusBanner(false);

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
    
    // VIEWPORT & ORIENTATION SYNC: Force Monaco resize on orientation/tab changes
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
    // `activeMobileTab` used to be a dependency ("sync on tab switch"), but this
    // effect only registers listeners - re-running it on every tab switch just
    // reset the banner timers and re-pinged the API.
  }, [token]);

  // Resubscribe Guardian: Pick up lost streams after reconnection
  const prevSocketStatusRef = useRef(socketStatus);
  useEffect(() => {
    if (socketStatus === "connected" && prevSocketStatusRef.current !== "connected" && busy && runRef.current.jobId) {
      try {
        const socket = getSocket(token);
        if (socket) {
          socket.emit("subscribe", { jobId: runRef.current.jobId });
        }
      } catch {
        // Resubscribe is best-effort; the polling fallback still resolves the run.
      }
    }
    prevSocketStatusRef.current = socketStatus;
    // `token` was read in the body but missing from the deps, so a resubscribe
    // after reconnecting could authenticate with a stale token.
  }, [socketStatus, busy, token]);

  // Pyodide is no longer preloaded here. Python runs on the cloud runtime like
  // every other language, so the ~10MB engine is fetched lazily by
  // runPythonInBrowser only if that runtime is unreachable - and Run is never
  // gated on a download most sessions never need.

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
          xtermRef.current.refresh(0, xtermRef.current.rows - 1); // FORCE RENDER
        }
      } catch {
        // Silent catch for transient dimension errors during layout transitions
      }
    }
  }, []);

  // Mounts once. Keep `theme` out of the deps: it would dispose and rebuild the
  // terminal on every toggle, losing the whole scrollback. Theme is applied to
  // the live instance below.
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;
    const term = new XTerm({
      allowTransparency: true,
      theme: buildTerminalTheme(themeRef.current),
      // xterm draws to canvas and cannot resolve CSS variables, so this must be
      // a real font stack.
      fontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
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
    
    // DEFENSE: Delayed fit to allow browser layout calculation
    setTimeout(() => {
      try {
        if (terminalRef.current && terminalRef.current.offsetParent !== null) {
          fitAddon.fit();
        }
      } catch {
        // Initial fit can fail while the panel has zero size; the ResizeObserver retries.
      }
    }, 100);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Typing into the terminal used to emit exec:input, which the server
    // buffered and nothing ever consumed - neither executor accepts input once
    // a run has started. Keystrokes silently disappeared and the terminal
    // looked frozen. Say so once per run instead.
    term.onData(() => {
      if (!runRef.current.jobId || inputHintShownRef.current) return;
      inputHintShownRef.current = true;
      term.write(
        "\r\n\x1b[1;33m[SAM]\x1b[0m \x1b[2mThis run does not read input while running. " +
        "Put your input in the STDIN panel before pressing Run.\x1b[0m\r\n"
      );
    });

    // ELITE RESIZE WATCHER: Ensure terminal reflows perfectly when panels shift
    const resizeObserver = new ResizeObserver(() => {
      if (term && fitAddon) {
        try {
          if (terminalRef.current && terminalRef.current.offsetParent !== null) {
            fitAddon.fit();
          }
        } catch { /* terminal already disposed */ }
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
  }, [safeFit]);

  // Recolour the existing terminal in place - no dispose, no lost scrollback.
  useEffect(() => {
    if (xtermRef.current) xtermRef.current.options.theme = buildTerminalTheme(theme);
  }, [theme]);

  // Consolidate layout fit on change
  useEffect(() => {
    const delay = isCompact ? 300 : 100; // LONGER DELAY for mobile tab transitions
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      // EXPLICIT MONACO LAYOUT: Force editor to re-calculate dimensions
      if (window.samEditor && (!isCompact || activeMobileTab === 'editor')) {
        window.samEditor.layout();
      }
      safeFit();
    }, delay);
    return () => clearTimeout(timer);
  }, [editorWidth, aiWidth, showAiPanel, activeMobileTab, isCompact, safeFit]);

  // Keyboard Shortcuts
  useEffect(() => {
    const isEditorFocused = () =>
      !!document.activeElement?.closest?.('.monaco-editor');

    const handleKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "Enter") { e.preventDefault(); onRun(); return; }

      // Ctrl+S was advertised in the shortcuts modal but never implemented, so
      // pressing it opened the browser's "Save Page" dialog. Buffers already
      // persist on every edit; this makes that explicit and confirms it.
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        try {
          localStorage.setItem("sam_code_buffers", JSON.stringify(buffers));
          toast.success("Saved locally", { id: "sam-save" });
        } catch {
          toast.error("Could not save locally (storage full?)", { id: "sam-save" });
        }
        return;
      }

      // Ctrl+L clears the terminal, a strong convention - but Monaco binds it to
      // Expand Line Selection, so defer to the editor when it has focus.
      if (e.key.toLowerCase() === "l") {
        if (isEditorFocused()) return;
        e.preventDefault();
        onClear();
        return;
      }

      // The AI panel used to be bound to Ctrl+/ on a window listener that called
      // preventDefault unconditionally, which meant Monaco's Toggle Line Comment
      // - the single most-used editor shortcut there is - could never fire.
      // Moved to Ctrl+Shift+A, leaving Ctrl+/ to the editor.
      if (e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setShowAiPanel(prev => {
          const opening = !prev;
          if (opening) {
            if (isCompact) setActiveMobileTab('ai');
            else applyLayout(33.33, aiWidth, true);
          } else {
            if (!isCompact) applyLayout(50, aiWidth, false);
          }
          return opening;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRun, onClear, isCompact, aiWidth, applyLayout, buffers]);

  // Settings management moved to top to satisfy hook ordering rules



  return (
    <div className={`relative flex h-[100dvh] w-full flex-col overflow-hidden selection:bg-sam-text/10 ${isCompact ? 'pb-[calc(var(--sam-mobile-nav-height)+8px)]' : ''}`} style={{ background: 'var(--sam-bg)' }}>
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      {/* MOBILE COMPACT HEADER */}
      <header
        className="sam-mobile-header flex lg:hidden h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl z-[80] safe-top"
        style={{
          background: theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)',
          borderBottomColor: 'var(--sam-glass-border)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <OfficialLogo theme={theme} size={28} />
          <div className="flex flex-col leading-none">
            <span className="font-black tracking-tight text-[15px] uppercase italic" style={{ fontFamily: 'var(--font-display)', color: 'var(--sam-text)' }}>SAM</span>
            <span className="text-[8px] font-black uppercase tracking-[0.35em] opacity-60 -mt-0.5" style={{ color: 'var(--sam-text)' }}>Compiler</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} toggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />
           <button 
             onClick={() => setActiveModal('about')}
             className="sam-tap p-2 active:scale-95 transition-transform"
             style={{ color: 'var(--sam-text-dim)' }}
           >
             <CircleHelp className="h-5 w-5" />
           </button>
           <button 
             onClick={() => setMobileMenuOpen(true)}
             className="sam-tap p-2 active:scale-95 transition-transform"
             style={{ color: 'var(--sam-text-dim)' }}
           >
             <Menu className="h-5 w-5" />
           </button>
        </div>
      </header>

      {/* MOBILE SLIDE-DOWN MENU (Universal) */}
      {/* Plain conditional, not AnimatePresence - see the shortcuts modal below:
          exited children are never removed here, and a menu stuck at opacity 0
          over the header would block the controls underneath it. */}
      {mobileMenuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            /* Was `md:hidden` (<768) while the header that opens it is
               `lg:hidden` (<1024). Between 768-1023px the hamburger rendered
               but the menu it toggled did not - the button did nothing. */
            className="absolute left-0 right-0 top-14 mt-2 mx-4 p-4 sam-glass border-sam-glass-border shadow-2xl z-[150] lg:hidden overflow-hidden"
            style={{
              borderRadius: 20,
              // Was `dark:bg-sam-bg/95 bg-sam-text/95`. Tailwind's `dark:`
              // variant follows the OS, not this app's `.light` class on
              // <html>, so the menu inverted whenever the two disagreed.
              background: theme === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)',
            }}
          >
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { setShowShortcutsHelp(true); setMobileMenuOpen(false); }}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl bg-sam-text/5 border border-sam-glass-border hover:bg-sam-text/10 transition-colors gap-2"
                >
                  <Keyboard className="h-5 w-5 text-sam-text-dim" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-sam-text-muted">Shortcuts</span>
                </button>
                <button 
                  onClick={() => { setShowHistory(true); setMobileMenuOpen(false); }}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl bg-sam-text/5 border border-sam-glass-border hover:bg-sam-text/10 transition-colors gap-2"
                >
                  <Clock className="h-5 w-5 text-sam-text-dim" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-sam-text-muted">History</span>
                </button>
              </div>
              
              <div className="h-[1px] bg-sam-text/5 w-full" />

              <div className="flex flex-col gap-1">
                 {['Editor', 'Dashboard', 'Settings'].map((tab) => {
                    if (tab === 'Dashboard' && user?.role !== 'admin') return null;
                    const isActive = (!activeModal && tab === 'Editor') || activeModal === tab.toLowerCase();
                    return (
                      <button
                        key={tab}
                        onClick={() => { setActiveModal(tab === 'Editor' ? null : tab.toLowerCase()); setMobileMenuOpen(false); }}
                        className={`flex items-center justify-between p-3 rounded-xl transition-all ${isActive ? 'bg-sam-text/10 text-sam-text' : 'text-sam-text-muted'}`}
                      >
                        <span className="text-xs font-bold uppercase tracking-[0.2em]">{tab}</span>
                        {isActive && <div className="h-1.5 w-1.5 rounded-full bg-sam-text" />}
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
                    className="w-full p-4 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-sam-text-muted border border-sam-glass-border bg-sam-text/5"
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
                <div className="mt-2 flex items-center justify-between p-3 bg-sam-text/5 rounded-2xl border border-sam-glass-border">
                  <div className="flex items-center gap-3">
                    <img src={user.avatar} className="h-8 w-8 rounded-full border border-sam-glass-border" />
                    <span className="text-xs font-bold" style={{ color: 'var(--sam-text)' }}>{user.name}</span>
                  </div>
                  <button onClick={logoutUser} className="text-[9px] font-black uppercase tracking-widest text-rose-500 px-3 py-1.5 rounded-lg bg-rose-500/10">Sign Out</button>
                </div>
              )}
            </div>
            {/* Close Button for mobile menu */}
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-2 text-sam-text-muted hover:text-sam-text"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
      )}

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
              <div className={`flex flex-col leading-[0.9] mt-1 relative scale-[0.75] sm:scale-100 origin-left -ml-1 sm:ml-0 ${isCompact ? 'hidden sm:flex' : 'flex'}`}>
                <span className="font-black tracking-tight text-[16px] sm:text-[18px] uppercase italic" style={{ fontFamily: 'var(--font-display)', color: 'var(--sam-text)' }}>SAM</span>
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.35em] opacity-60 ml-0.5" style={{ color: 'var(--sam-text)' }}>Compiler</span>
              </div>
            </div>
          </div>
          
          {/* Was `xl:flex` (>=1280) inside a header that appears at `lg`
              (>=1024). Combined with the menu bug above, Settings had no
              trigger at all anywhere in the 768-1279px range. */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
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
            ) : authLoading ? (
              /* useAuth exposes `loading`, which this page never read - so an
                 authenticated user saw the "Sign In" button flash on every load
                 until fetchUser resolved. */
              <div
                className="flex items-center gap-2 rounded-full border px-4 py-1.5 shadow-sm"
                style={{ borderColor: 'var(--sam-glass-border)', background: 'var(--sam-surface-low)' }}
                aria-busy="true"
              >
                <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--sam-text-dim)' }} />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--sam-text-dim)' }}>
                  Signing in
                </span>
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
                if (isCompact) {
                  if (next) setActiveMobileTab('ai');
                } else {
                  if (next) {
                    applyLayout(33.33, 33.33, true);
                  } else {
                    applyLayout(50, 33.33, false);
                  }
                }
              }}
              className="sam-tap flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-auto md:px-4 items-center justify-center gap-2 rounded-xl border transition-all duration-300 shrink-0"
              style={{ 
                background: showAiPanel ? 'var(--sam-accent-muted)' : 'var(--sam-surface-low)',
                borderColor: showAiPanel ? 'var(--sam-accent)' : 'var(--sam-glass-border)',
                color: showAiPanel ? 'var(--sam-accent)' : 'var(--sam-text-muted)',
              }}
            >
              <Sparkles className={`h-4 w-4 pointer-events-none ${showAiPanel ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">SAM AI</span>
            </button>



            {/* Desktop-only secondary actions */}
            <div className="hidden md:flex items-center gap-2">
              <button 
                onClick={() => setShowShortcutsHelp(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sam-glass-border)] bg-[var(--sam-surface-low)] text-[var(--sam-text-dim)] transition-all hover:text-sam-text"
              >
                <Keyboard className="h-5 w-5" />
              </button>
              <button 
                id="history-btn"
                onClick={() => setShowHistory(!showHistory)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sam-glass-border)] bg-[var(--sam-surface-low)] text-[var(--sam-text-dim)] transition-all hover:text-sam-text"
              >
                <Clock className="h-5 w-5" />
              </button>
            </div>

            {/* No mobile menu toggle here, use mobile header */}
          </div>
        </div>

      </header>

      {/* MOBILE TAB NAVIGATOR */}
      {isCompact && (
        <MobileTabNav 
          activeTab={activeMobileTab} 
          onTabChange={(tab) => {
            setActiveMobileTab(tab);
            if (tab === 'ai') setShowAiPanel(true);
            else if (!isCompact) setShowAiPanel(false); // Should not happen but for safety
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
          }} 
          theme={theme} 
        />
      )}

      {/* ═══════════════════════════════════════════
          CONTEXTUAL AI TRIGGER - Relocated to Root
          Floats opposite to the Run button
      ══════════════════════════════════════════════ */}
      {/* The run button is hidden on the AI tab. It is fixed to the bottom-right
          and the AI panel's send button and quick actions occupy exactly that
          corner, so the two overlapped and the run button intercepted taps
          meant for Send. */}
      {isCompact && activeMobileTab !== 'ai' && (
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
            // Positioned against the tab bar's measured height plus the
            // 44px status bar, rather than a hardcoded 160px that did not
            // account for the safe-area inset.
            bottom: 'calc(var(--sam-mobile-nav-height) + 56px)',
            right: 20,
            zIndex: 110, // above content, below the tab bar (120) and modals
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
        <main className="relative z-10 flex flex-1 flex-col md:flex-row overflow-y-auto overflow-x-hidden md:overflow-hidden p-0 md:p-6 md:pb-6 gap-2 md:gap-0 transition-all duration-200 ease-out">
          {/* EDITOR SECTION */}
          <section 
            className={`flex flex-col overflow-hidden w-full lg:w-auto ${isCompact && activeMobileTab !== 'editor' ? 'hidden' : ''}`}
            style={isCompact ? { flex: '1 1 100%', height: '100%' } : { flexBasis: `${editorWidth}%`, flexGrow: 0, flexShrink: 0 }}
          >
              <div className={`sam-glass flex flex-1 flex-col overflow-hidden ${isCompact ? 'rounded-none border-0' : 'rounded-2xl border'}`}>
                <div className="flex h-11 shrink-0 items-center justify-between px-3 md:px-5" style={{ background: 'var(--sam-surface-low)', borderBottom: '1px solid var(--sam-glass-border)' }}>
                <div className="flex items-center gap-2 md:gap-4">
                  <LanguageSelector activeLanguage={activeLangId} onLanguageChange={setActiveLangId} />
                  
                  {/* Reset Safety Valve */}
                  <button
                    onClick={handleCodeReset}
                    className="sam-tap"
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
                {/* Only shown while the offline Python fallback is downloading
                    or after it failed - the normal path is the cloud runtime. */}
                {activeLangId === 'python' && (isPyodideLoading || pyodideError) && (
                  <span
                    className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest"
                    style={{ color: pyodideError ? '#ef4444' : 'var(--sam-text-dim)' }}
                    role="status"
                  >
                    {isPyodideLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    {pyodideError ? 'Local Python engine unavailable' : 'Loading local Python engine'}
                  </span>
                )}
                {!isCompact && (
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
                   /* Deliberately NOT keyed on sessionId: that embeds
                      activeLangId, so every language switch fully unmounted and
                      remounted Monaco (~1-2s, losing undo stack, folds and
                      cursor). CodeEditor re-inits Yjs on sessionId/language
                      change internally, which is all that was needed. */
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

          {!isCompact && (
            <div 
               onMouseDown={startResizingEditor}
               className="hidden lg:flex group relative w-1.5 h-full cursor-col-resize items-center justify-center transition-all hover:bg-sam-text/5 z-30"
            >
              <div className={`h-24 w-[1px] ${theme === 'dark' ? 'bg-sam-text/10' : 'bg-sam-bg/5'} group-hover:bg-sam-text/30 transition-all`} />
            </div>
          )}

          {/* TERMINAL SECTION */}
          <section 
            className={`flex flex-col overflow-hidden sam-terminal-container ${busy ? 'is-active' : ''} w-full lg:w-auto ${isCompact && activeMobileTab !== 'terminal' ? 'hidden' : ''}`}
            style={isCompact ? { flex: '1 1 100%', height: '100%' } : { flex: 1, minWidth: 0 }}
          >
              <div className={`sam-glass flex flex-1 flex-col overflow-hidden ${isCompact ? 'rounded-none border-0' : 'rounded-2xl border'}`} style={{ background: 'var(--sam-surface)' }}>
                <div className="flex h-11 shrink-0 items-center justify-between px-4 md:px-6" style={{ background: 'var(--sam-surface-low)', borderBottom: '1px solid var(--sam-glass-border)' }}>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={async () => {
                       // The write was neither awaited nor caught, and the
                       // success toast fired unconditionally - including when
                       // the clipboard was blocked, or when there was nothing
                       // to copy at all.
                       const logs = stdErrRef.current || "";
                       const toastStyle = { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '10px', fontWeight: 900 };
                       if (!logs.trim()) {
                         toast("No logs to copy", { style: toastStyle });
                         return;
                       }
                       try {
                         await navigator.clipboard.writeText(logs);
                         toast.success("Logs copied to clipboard", { style: toastStyle });
                       } catch {
                         toast.error("Clipboard access was blocked", { style: toastStyle });
                       }
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

                  {/* INTEGRATED AI DIAGNOSTIC TRIGGER.
                      Plain conditional: an AnimatePresence exit that never
                      completes would leave an invisible but clickable button
                      sitting in the toolbar. */}
                  {pendingAiPrompt && !showAiPanel && (
                      <motion.button
                        key="explain-error"
                        initial={{ opacity: 0, scale: 0.8, x: -10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        onClick={() => {
                          setShowAiPanel(true);
                          if (isCompact) {
                            setActiveMobileTab('ai');
                          } else {
                            applyLayout(33.33, 33.33, true);
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all shadow-[0_0_15px_rgba(59,130,246,0.1)] ml-2"
                      >
                        <Sparkles className="h-3 w-3 animate-pulse pointer-events-none" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Explain Error</span>
                      </motion.button>
                  )}
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
                {/* 1. Engine Cold Start Overlay.
                    No AnimatePresence: its exit node stayed in the DOM at
                    opacity 0 and, being inset-0 z-20, swallowed every click
                    aimed at the terminal underneath. It also carries
                    pointer-events-none - it is purely informational. */}
                {isColdStarting && (
                    <motion.div
                      key="engine-cold-start"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-sam-bg/60 backdrop-blur-md"
                    >
                      <div className="relative mb-6">
                        <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                      </div>
                      <h3 className="text-sm font-black uppercase tracking-[0.3em] text-sam-text">Engine Warming Up</h3>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-sam-text-muted">Spinning up isolated sandbox...</p>
                    </motion.div>
                )}

                {/* 2. Actual XTerm Instance Mount Point */}
                <div className="h-full w-full p-3 overflow-hidden">
                  <div ref={terminalRef} id="terminal-container" className="h-full w-full" />
                </div>


                {/* 4. Mobile Execution Overlay. Plain conditional (exits are
                    never removed) and pointer-events-none: it is purely
                    informational and must never eat taps on the terminal. */}
                {isCompact && busy && (
                    <motion.div
                      key="mobile-executing"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center backdrop-blur-[2px] bg-sam-bg/5"
                    >
                      <div className="flex items-center gap-3 px-6 py-3 rounded-full border border-sam-glass-border bg-sam-bg/80 shadow-2xl">
                        <Loader2 className="h-4 w-4 text-sam-text animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sam-text">Executing...</span>
                      </div>
                    </motion.div>
                )}
              </div>
  
              <div className="flex h-8 md:h-10 shrink-0 items-center justify-between px-4 md:px-6" style={{ borderTop: '1px solid var(--sam-glass-border)', background: 'var(--sam-surface-low)' }}>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--sam-text)', opacity: 0.8, fontFamily: 'var(--font-body)' }}>SAM-RUNTIME</span>
                  {/* The badge was `text-white/30`, which is invisible on the
                      light theme's surface. Follows the token like its siblings. */}
                  {!user && (
                    <span
                      className="px-1.5 py-0.5 rounded-sm bg-sam-text/5 border border-sam-glass-border text-[7px] font-black uppercase tracking-widest"
                      style={{ color: 'var(--sam-text)', opacity: 0.55 }}
                    >
                      Guest
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--sam-text)', fontFamily: 'var(--font-mono)' }}>{languageConfigs[activeLangId]?.name}</span>
              </div>



          </div>
          </section>

          {/* SPLITTER 2 (Terminal | SAM AI) */}
          {showAiPanel && !isCompact && (
            <div 
               onMouseDown={startResizingAi}
               className="flex group relative w-1.5 h-full cursor-col-resize items-center justify-center transition-all hover:bg-sam-text/5 z-30"
            >
              <div className={`h-24 w-[1px] ${theme === 'dark' ? 'bg-sam-text/10' : 'bg-sam-bg/5'} group-hover:bg-sam-text/30 transition-all`} />
            </div>
          )}

          {/* SAM AI PANEL - Now Integrated */}
          {showAiPanel && (
            <section 
              className={`flex-col h-full overflow-hidden ${isCompact && activeMobileTab !== 'ai' ? 'hidden' : 'flex'} w-full lg:w-auto`}
              style={isCompact ? { flex: '1 1 100%', height: '100%' } : { flexBasis: `${aiWidth}%`, flexGrow: 0, flexShrink: 0 }}
            >
              <React.Suspense fallback={
                <div className="flex h-full w-full items-center justify-center bg-sam-bg/50 backdrop-blur-md rounded-2xl">
                  <div className="sam-spinner w-8 h-8" />
                </div>
              }>
                <AiPanel 
                  isOpen={showAiPanel}
                  onClose={() => {
                    setShowAiPanel(false);
                    if (isCompact) setActiveMobileTab('editor');
                    else {
                      applyLayout(50, 33.33, false);
                    }
                  }}
                  currentCode={buffers[activeLangId]}
                  language={activeLangId}
                  onApplyRefactor={(refactoredCode) => {
                    setBuffers(prev => ({ ...prev, [activeLangId]: refactoredCode }));
                    // The confirmation toast used to be inside `if (isCompact)`,
                    // so desktop users got no feedback that a refactor had been
                    // applied. It also hardcoded its colours instead of using
                    // the theme tokens.
                    window.dispatchEvent(new CustomEvent('sam-editor-reset', {
                      detail: { template: refactoredCode, message: "Refactor applied" }
                    }));
                    if (isCompact) setActiveMobileTab('editor');
                  }}
                  theme={theme}
                  isCompact={isCompact}
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
          onShowAbout={() => setActiveModal('about')}
          theme={theme}
          busy={busy}
        />
      </footer>

      {/* No AnimatePresence: its exit-removal never completes here (verified in
          the production build too), so the closed modal stayed in the DOM at
          opacity 0 and its fixed inset-0 z-[200] layer swallowed every click in
          the app - the UI looked frozen after opening this once. */}
      {showShortcutsHelp && (
          <motion.div
            key="shortcuts-help"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          >
            <div
               onClick={() => setShowShortcutsHelp(false)}
               className="absolute inset-0 bg-sam-bg/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={`relative w-full max-w-sm rounded-[32px] border p-8 shadow-2xl backdrop-blur-2xl sam-modal-mobile-center ${
                theme === 'dark' ? 'border-sam-glass-border bg-sam-bg/95' : 'border-slate-200 bg-sam-bg/95'
              }`}
            >
              <h3 className={`mb-8 flex items-center gap-3 text-sm font-black uppercase tracking-[0.25em] opacity-90 ${
                theme === 'dark' ? 'text-sam-text' : 'text-slate-900'
              }`}>
                 <Keyboard className={`h-5 w-5 ${theme === 'dark' ? 'text-sam-text' : 'text-slate-900'}`} strokeWidth={3} />
                 Terminal Shortcuts
              </h3>
              <div className="flex flex-col gap-5">
                 <ShortcutItem keys={["CTRL", "ENTER"]} label="Run Code" theme={theme} />
                 <ShortcutItem keys={["CTRL", "S"]} label="Save Locally" theme={theme} />
                 <ShortcutItem keys={["CTRL", "L"]} label="Clear Output" theme={theme} />
                 <ShortcutItem keys={["CTRL", "SHIFT", "A"]} label="Toggle Sam AI" theme={theme} />

              </div>
              <button 
                onClick={() => setShowShortcutsHelp(false)}
                className={`mt-10 w-full rounded-2xl p-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 ${
                  theme === 'dark' ? 'bg-sam-text/10 text-sam-text hover:bg-sam-text/20' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                }`}
              >
                Close Guidelines
              </button>
            </motion.div>
          </motion.div>
      )}

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
            setConfirmState({
              title: "Sign out",
              message: "You will be signed out of SAM Compiler on this device.",
              confirmLabel: "Sign out",
              onConfirm: () => {
                logoutUser();
                setActiveModal(null);
                setConfirmState(null);
              }
            });
          }}
        />
        <HistoryPanel
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          theme={theme}
          token={token}
          onLoadCode={handleLoadFromHistory}
        />
        <AboutModal isOpen={activeModal === 'about'} onClose={() => setActiveModal(null)} theme={theme} />
      </React.Suspense>
      
      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        destructive={confirmState?.destructive}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />

      <Toaster position="bottom-right" reverseOrder={false} />
    </div>
  );
}
