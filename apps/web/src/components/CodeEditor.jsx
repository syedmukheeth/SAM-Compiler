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

export default function CodeEditor({ 
  language, 
  onChange, 
  onCursorChange, 
  sessionId = "default",
  userName = null,
  theme = "vs-dark", 
  options = {} 
}) {
  const editorRef = useRef(null);
  const bindingRef = useRef(null);
  const providerRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const hasInitializedRef = useRef(false);

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);

  const localName = useMemo(() => userName || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], [userName]);
  const localColor = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)], []);

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Define themes (kept same as before)
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
      onCursorChange?.({ lineNumber: pos.lineNumber, column: pos.column });
    });
  }, [onCursorChange]);
  // THEME PERSISTENCE
  const monacoTheme = useMemo(() => theme === "light" ? "monolith-light" : "vs-dark", [theme]);

  // ⚡ INSTANT BOOT & COLLABORATIVE LIFECYCLE
  useEffect(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    
    // 1. Instant Local Write: Fill the editor from buffer immediately
    if (value !== undefined && value !== editor.getValue() && !hasInitializedRef.current) {
      editor.setValue(value);
    }

    // 2. Clear previous session if exists
    if (bindingRef.current) bindingRef.current.destroy();
    if (providerRef.current) providerRef.current.destroy();

    // 3. Initialize fresh collaborative room for this language
    const ydoc = new Y.Doc();
    const endpoint = ENDPOINTS.WS_ENDPOINT;
    const roomName = `${sessionId}-${language}`;
    
    const provider = new SocketIOProvider(endpoint, roomName, ydoc, {
      ...ENDPOINTS.SOCKET_OPTIONS,
      autoConnect: true
    });

    const ytext = ydoc.getText(language);
    
    ydocRef.current = ydoc;
    ytextRef.current = ytext;
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

    provider.on('sync', (isSynced) => {
      if (isSynced !== false) {
        hasInitializedRef.current = true;
      }
    });

    return () => {
      binding.destroy();
      provider.destroy();
      hasInitializedRef.current = false;
    };
  }, [sessionId, language, localName, localColor]); // Re-initialize on session/language change

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
    onChange?.(v ?? "");
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
          backgroundColor: "#00000000"
        }}
        loading={<div className="flex h-full items-center justify-center text-blue-500/20 font-black uppercase tracking-widest animate-pulse">Initializing Collaborative Layer</div>}
      />
    </div>
  );
}
