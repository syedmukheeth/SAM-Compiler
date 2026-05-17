import React, { useCallback, useMemo, useRef, useEffect } from "react";
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
 * Architecture:
 *  - Yjs is the SINGLE SOURCE OF TRUTH for document state.
 *  - `value` prop (from localStorage buffers) is ONLY used to seed a brand-new,
 *    empty room on first sync. It NEVER overwrites an existing collaborative document.
 *  - This prevents the "Code Soup" bug where a late-joining user's local template
 *    was being inserted into an already-populated shared room.
 */
const CodeEditor = ({ 
  language, 
  value,
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
  // Store the latest `value` in a ref so the sync handler can access it
  // without re-triggering the collaboration useEffect.
  const seedValueRef = useRef(value);

  useEffect(() => {
    seedValueRef.current = value;
  }, [value]);

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);

  const localName = useMemo(() => userName || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], [userName]);
  const localColor = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)], []);

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    window.samEditor = editor;

    monaco.editor.defineTheme('monolith-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'FFFFFF', background: '000000' },
        { token: 'comment', foreground: '525252', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'FFFFFF', fontStyle: 'bold' },
        { token: 'string', foreground: 'A3A3A3' },
        { token: 'number', foreground: 'D1D1D1' },
        { token: 'type', foreground: 'FFFFFF' },
        { token: 'operator', foreground: 'FFFFFF' },
        { token: 'delimiter', foreground: '737373' },
        { token: 'function', foreground: 'FFFFFF' },
        { token: 'identifier', foreground: 'FFFFFF' },
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#FFFFFF',
        'editorLineNumber.foreground': '#262626',
        'editorLineNumber.activeForeground': '#FFFFFF',
        'editorIndentGuide.background': '#171717',
        'editor.selectionBackground': '#FFFFFF22',
        'editorCursor.foreground': '#FFFFFF',
      }
    });

    monaco.editor.defineTheme('monolith-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '000000', background: 'FFFFFF' },
        { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
        { token: 'keyword', foreground: '000000', fontStyle: 'bold' },
        { token: 'string', foreground: '404040' },
        { token: 'number', foreground: '525252' },
        { token: 'type', foreground: '000000' },
        { token: 'operator', foreground: '000000' },
        { token: 'function', foreground: '000000' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#000000',
        'editorLineNumber.foreground': '#E2E8F0',
        'editorLineNumber.activeForeground': '#000000',
        'editorIndentGuide.background': '#F1F5F9',
        'editor.selectionBackground': '#00000022',
        'editorCursor.foreground': '#000000',
      }
    });

    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      
      // ⚡ ELITE EVENT BUS: Dispatch metrics without parent rerender
      window.dispatchEvent(new CustomEvent("sam:editor:metrics", {
        detail: { lineNumber: pos.lineNumber, column: pos.column }
      }));
      
      onCursorChange?.({ lineNumber: pos.lineNumber, column: pos.column });
    });
  }, [onCursorChange]);

  // THEME PERSISTENCE
  const monacoTheme = useMemo(() => theme === "light" ? "monolith-light" : "vs-dark", [theme]);

  // 🛡️ SYNC MARKERS: Apply inline errors to the editor
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelMarkers(model, "owner", markers);
      }
    }
  }, [markers]);

  // ⚡ COLLABORATIVE LIFECYCLE
  useEffect(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;

    // 🔑 KEY FIX: Do NOT call editor.setValue() here.
    // Setting value before MonacoBinding is established causes the content
    // to be treated as a Yjs insertion, which then conflicts with the
    // server's state when the provider syncs. This was the root cause of "Code Soup".

    // Clean up any previous session
    if (bindingRef.current) bindingRef.current.destroy();
    if (providerRef.current) providerRef.current.destroy();
    hasInitializedRef.current = false;

    // The sessionId already encodes both the session and the language (e.g. "abc123::cpp").
    // We use it directly as the room name to match the backend's document-loaded handler.
    const ydoc = new Y.Doc();
    const roomName = sessionId; // e.g. "default::python" or "xyz123::cpp"
    
    const provider = new SocketIOProvider(ENDPOINTS.WS_ENDPOINT, roomName, ydoc, {
      ...ENDPOINTS.SOCKET_OPTIONS,
      autoConnect: true
    });

    // The ytext key must match what the backend initializes (the langId part of the room name).
    const langId = language;
    const ytext = ydoc.getText(langId);
    
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
      name: localName,
      color: localColor
    });

    // 🔑 KEY FIX: The sync handler is the ONLY place we seed content.
    // We wait until Yjs has fully synced with the server.
    // Only if the shared document is EMPTY do we insert the local buffer as a seed.
    // This guarantees User A's real code is NEVER overwritten by User B's local template.
    const handleSync = (isSynced) => {
      if (!isSynced) return; // Wait for a successful sync, not a disconnect
      
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;

        if (ytext.length === 0) {
          // Room is brand new and empty on the server. Seed it from the local buffer.
          const seedContent = seedValueRef.current;
          if (seedContent && seedContent.trim() !== "") {
            ydoc.transact(() => {
              ytext.insert(0, seedContent);
            });
          }
        }
        // If ytext.length > 0, the server already has content (another user's code).
        // MonacoBinding will automatically populate the editor — we do nothing.
      }
    };

    provider.on('sync', handleSync);

    return () => {
      provider.off('sync', handleSync);
      binding.destroy();
      provider.destroy();
      hasInitializedRef.current = false;
    };
  }, [sessionId, language, localName, localColor]); // Re-initialize when session or language changes

  useEffect(() => {
    const handleResetEvent = (e) => {
      const { template } = e.detail;
      if (editorRef.current) {
        editorRef.current.setValue(template);
        toast.success("Applied to editor ✨", {
          style: { background: 'var(--sam-surface)', color: 'var(--sam-text)', border: '1px solid var(--sam-glass-border)', fontSize: '11px', fontWeight: 900 },
          icon: '✨'
        });
      }
    };
    window.addEventListener('sam-editor-reset', handleResetEvent);
    return () => window.removeEventListener('sam-editor-reset', handleResetEvent);
  }, []);

  const handleChange = useCallback((v) => {
    // Only propagate changes to the parent (localStorage) once the Yjs room is
    // initialized. This prevents an empty model wipe from overwriting the buffer
    // during the initial handshake.
    if (hasInitializedRef.current) {
      onChange?.(v ?? "");
    }
  }, [onChange]);

  return (
    <div className="h-full w-full bg-transparent">
      <Editor
        theme={monacoTheme}
        language={monacoLanguage}
        onMount={handleMount}
        onChange={handleChange}
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
          formatOnPaste: true,
          formatOnType: true,
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
