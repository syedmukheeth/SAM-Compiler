import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { SocketIOProvider } from "y-socket.io";
import ENDPOINTS from "../services/endpoints";
import toast from "react-hot-toast";

const LANGUAGE_TO_MONACO = {
  nodejs: "javascript",
  python: "python",
  cpp: "cpp",
  c: "cpp",
  java: "java"
};

const RANDOM_NAMES = [
  "Anonymous Panda", "Anonymous Google SE", "Anonymous Byte", "Anonymous SRE",
  "Anonymous Kernel", "Anonymous Stack", "Anonymous Pointer", "Anonymous Docker"
];

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

/**
 * CodeEditor — Collaborative Monaco editor powered by Yjs + y-socket.io.
 *
 * Key architecture decisions:
 * 1. Yjs is the SINGLE SOURCE OF TRUTH for document content.
 * 2. `value` prop is stored in a ref and used ONLY to seed a brand-new, empty room.
 *    It never overwrites an existing collaborative document.
 * 3. The Yjs lifecycle (provider, binding) is initialized INSIDE `handleMount`
 *    so it always has a valid editor reference. This prevents the race condition
 *    where the useEffect ran before Monaco finished mounting.
 */
const CodeEditor = ({
  language,
  value,
  defaultTemplate = "",  // canonical template for this language — used to seed new empty rooms
  onChange,
  onCursorChange,
  sessionId = "default",
  userName = null,
  theme = "vs-dark",
  markers = [],
  options = {}
}) => {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const providerRef = useRef(null);
  const ydocRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const cleanupRef = useRef(null); // holds the current session cleanup fn

  // Keep seed values in refs to avoid re-triggering effects
  const seedValueRef = useRef(value);
  const defaultTemplateRef = useRef(defaultTemplate);
  useEffect(() => { seedValueRef.current = value; }, [value]);
  useEffect(() => { defaultTemplateRef.current = defaultTemplate; }, [defaultTemplate]);

  // Track sessionId + language in refs so the mount callback always sees latest values
  const sessionIdRef = useRef(sessionId);
  const languageRef = useRef(language);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { languageRef.current = language; }, [language]);

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);
  const localName = useMemo(() => userName || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], [userName]);
  const localColor = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)], []);

  // Store name/color in refs so the mount callback always has them without re-mounting
  const localNameRef = useRef(localName);
  const localColorRef = useRef(localColor);
  useEffect(() => { localNameRef.current = localName; }, [localName]);
  useEffect(() => { localColorRef.current = localColor; }, [localColor]);

  /**
   * Initialize (or re-initialize) the Yjs collaborative session.
   * Called from handleMount (on first load) and from the sessionId/language effect (on change).
   */
  const initYjs = useCallback((editor) => {
    // Tear down any existing session first
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    hasInitializedRef.current = false;

    const currentSessionId = sessionIdRef.current;
    const currentLanguage = languageRef.current;

    // The room name is the full sessionId which already encodes language: "default::cpp"
    const ydoc = new Y.Doc();
    const provider = new SocketIOProvider(ENDPOINTS.WS_ENDPOINT, currentSessionId, ydoc, {
      ...ENDPOINTS.SOCKET_OPTIONS,
      autoConnect: true
    });

    const ytext = ydoc.getText(currentLanguage);
    ydocRef.current = ydoc;
    providerRef.current = provider;

    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );
    bindingRef.current = binding;

    provider.awareness.setLocalStateField("user", {
      name: localNameRef.current,
      color: localColorRef.current
    });

    // 📡 Observe ytext directly for localStorage sync — fires once per Yjs transaction,
    // regardless of how many Monaco model-change events that transaction generates.
    // This is safer than Monaco's onChange which fires for EVERY model delta (including
    // auto-formatting rewrites) and can cause unnecessary React re-render cycles.
    const onYtextChange = () => {
      if (hasInitializedRef.current) {
        onChange?.(ytext.toString());
      }
    };
    ytext.observe(onYtextChange);

    // 🔑 SEED GUARD: Only insert content if the shared room is genuinely empty after sync.
    // Uses defaultTemplate (not localStorage) to ensure clean canonical content.
    // A 150ms debounce lets concurrent joiners' seeds propagate first — whichever
    // client's seed arrives on the server first wins; the rest skip because ytext.length > 0.
    const handleSync = (isSynced) => {
      if (!isSynced) return;
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        if (ytext.length === 0) {
          // Debounce: wait 150ms before seeding so concurrent peers' seeds can arrive.
          // After the delay, re-check length — if another client seeded first, skip.
          setTimeout(() => {
            if (ytext.length === 0) {
              const seed = defaultTemplateRef.current || seedValueRef.current;
              if (seed && seed.trim() !== "") {
                ydoc.transact(() => { ytext.insert(0, seed); });
              }
            }
          }, 150);
        }
      }
    };

    provider.on("sync", handleSync);

    // Return cleanup function
    cleanupRef.current = () => {
      ytext.unobserve(onYtextChange);
      provider.off("sync", handleSync);
      try { binding.destroy(); } catch (_) {}
      try { provider.destroy(); } catch (_) {}
      hasInitializedRef.current = false;
    };
  }, []); // no deps — always reads from refs

  // ─── Monaco Mount Handler ────────────────────────────────────────────────────
  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    window.samEditor = editor;

    monaco.editor.defineTheme("monolith-dark", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "", foreground: "FFFFFF", background: "000000" },
        { token: "comment", foreground: "525252", fontStyle: "italic" },
        { token: "keyword", foreground: "FFFFFF", fontStyle: "bold" },
        { token: "string", foreground: "A3A3A3" },
        { token: "number", foreground: "D1D1D1" },
        { token: "type", foreground: "FFFFFF" },
        { token: "operator", foreground: "FFFFFF" },
        { token: "delimiter", foreground: "737373" },
        { token: "function", foreground: "FFFFFF" },
        { token: "identifier", foreground: "FFFFFF" },
      ],
      colors: {
        "editor.background": "#000000",
        "editor.foreground": "#FFFFFF",
        "editorLineNumber.foreground": "#262626",
        "editorLineNumber.activeForeground": "#FFFFFF",
        "editorIndentGuide.background": "#171717",
        "editor.selectionBackground": "#FFFFFF22",
        "editorCursor.foreground": "#FFFFFF",
      }
    });

    monaco.editor.defineTheme("monolith-light", {
      base: "vs", inherit: true,
      rules: [
        { token: "", foreground: "000000", background: "FFFFFF" },
        { token: "comment", foreground: "94A3B8", fontStyle: "italic" },
        { token: "keyword", foreground: "000000", fontStyle: "bold" },
        { token: "string", foreground: "404040" },
        { token: "number", foreground: "525252" },
        { token: "type", foreground: "000000" },
        { token: "operator", foreground: "000000" },
        { token: "function", foreground: "000000" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#000000",
        "editorLineNumber.foreground": "#E2E8F0",
        "editorLineNumber.activeForeground": "#000000",
        "editorIndentGuide.background": "#F1F5F9",
        "editor.selectionBackground": "#00000022",
        "editorCursor.foreground": "#000000",
      }
    });

    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      window.dispatchEvent(new CustomEvent("sam:editor:metrics", {
        detail: { lineNumber: pos.lineNumber, column: pos.column }
      }));
      onCursorChange?.({ lineNumber: pos.lineNumber, column: pos.column });
    });

    // ⚡ Initialize Yjs immediately after Monaco is ready.
    // This is the correct place — editorRef.current is guaranteed to be set here.
    initYjs(editor);
  }, [onCursorChange, initYjs]);

  // ─── Re-initialize Yjs when session or language changes ─────────────────────
  useEffect(() => {
    // Skip if Monaco hasn't mounted yet — handleMount will call initYjs
    if (!editorRef.current) return;
    initYjs(editorRef.current);
  }, [sessionId, language, initYjs]);

  // ─── Component unmount cleanup ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  // ─── Monaco theme ────────────────────────────────────────────────────────────
  const monacoTheme = useMemo(() => theme === "light" ? "monolith-light" : "vs-dark", [theme]);

  // ─── Error markers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) monacoRef.current.editor.setModelMarkers(model, "owner", markers);
    }
  }, [markers]);

  // ─── AI template reset event ─────────────────────────────────────────────────
  useEffect(() => {
    const handleResetEvent = (e) => {
      if (editorRef.current) {
        editorRef.current.setValue(e.detail.template);
        toast.success("Applied to editor ✨", {
          style: { background: "var(--sam-surface)", color: "var(--sam-text)", border: "1px solid var(--sam-glass-border)", fontSize: "11px", fontWeight: 900 },
          icon: "✨"
        });
      }
    };
    window.addEventListener("sam-editor-reset", handleResetEvent);
    return () => window.removeEventListener("sam-editor-reset", handleResetEvent);
  }, []);

  // onChange is now driven by ytext.observe inside initYjs — no Monaco onChange needed.

  return (
    <div className="h-full w-full bg-transparent">
      <Editor
        theme={monacoTheme}
        language={monacoLanguage}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: options.fontSize || 12,
          tabSize: options.tabSize || 2,
          lineNumbers: "on",
          lineNumbersMinChars: 2,
          folding: false,
          glyphMargin: false,
          wordWrap: "on",
          wrappingStrategy: "advanced",
          automaticLayout: true,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          padding: { top: 12, bottom: 12 },
          // formatOnType / formatOnPaste MUST be off in collaborative mode.
          // When Monaco auto-reformats (e.g. re-indenting a block on '}'),
          // it generates large multi-line edits that Yjs propagates to all peers.
          // From peer's perspective this looks like "random code being changed"
          // even though the user only pressed one key.
          formatOnPaste: false,
          formatOnType: false,
          scrollBeyondLastLine: false,
          readOnly: false,
          renderLineHighlight: "none",
          renderIndentGuides: true,
          guides: { indentation: true },
          accessibilitySupport: "off",
          contextmenu: false,
          backgroundColor: "#00000000"
        }}
        loading={<div className="flex h-full items-center justify-center text-blue-500/20 font-black uppercase tracking-widest animate-pulse">Initializing Collaborative Layer</div>}
      />
    </div>
  );
};

export default React.memo(CodeEditor);
