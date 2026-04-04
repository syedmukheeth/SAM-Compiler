import React, { useCallback, useMemo, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { SocketIOProvider } from "y-socket.io";
import ENDPOINTS from "../services/endpoints";

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
  value, 
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
  const hasInitializedRef = useRef(false);

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);

  const localName = useMemo(() => userName || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], [userName]);
  const localColor = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)], []);

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Define Monolith Dark Theme (Professional High-Scale Aesthetic)
    monaco.editor.defineTheme('monolith-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'dde2f1', background: '000000' },
        { token: 'comment', foreground: '555555', fontStyle: 'italic' },
        { token: 'keyword', foreground: '00D4FF', fontStyle: 'bold' },
        { token: 'string', foreground: '22c55e' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'type', foreground: '0ea5e9' },
        { token: 'operator', foreground: '00D4FF' },
        { token: 'delimiter', foreground: 'dde2f1' },
        { token: 'function', foreground: '8b5cf6' },
        { token: 'identifier', foreground: 'dde2f1' },
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#dde2f1',
        'editorLineNumber.foreground': '#222222',
        'editorLineNumber.activeForeground': '#00D4FF',
        'editorIndentGuide.background': '#111111',
        'editor.selectionBackground': '#00D4FF22',
        'editorCursor.foreground': '#00D4FF',
      }
    });

    // Define Monolith Light Theme (Premium Paper-Glass Aesthetic)
    monaco.editor.defineTheme('monolith-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '080C14', background: 'FFFFFF' },
        { token: 'comment', foreground: '9BA3AF', fontStyle: 'italic' },
        { token: 'keyword', foreground: '00A3C4', fontStyle: 'bold' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: 'D97706' },
        { token: 'type', foreground: '0284C7' },
        { token: 'operator', foreground: '00A3C4' },
        { token: 'function', foreground: '7C3AED' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#080C14',
        'editorLineNumber.foreground': '#E5E7EB',
        'editorLineNumber.activeForeground': '#00A3C4',
        'editorIndentGuide.background': '#F3F4F6',
        'editor.selectionBackground': '#00D4FF22',
        'editorCursor.foreground': '#00A3C4',
      }
    });

    if (providerRef.current) return;
    
    // ... rest of Yjs initialization ...
    const ydoc = new Y.Doc();
    const endpoint = ENDPOINTS.WS_ENDPOINT;

    const provider = new SocketIOProvider(endpoint, sessionId, ydoc, {
      ...ENDPOINTS.SOCKET_OPTIONS,
      autoConnect: true
    });

    const ytext = ydoc.getText("monaco");

    // Bind Monaco to Yjs
    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );

    // Set local awareness (Cursors/Presence)
    provider.awareness.setLocalStateField("user", {
      name: localName,
      color: localColor
    });

    bindingRef.current = binding;
    providerRef.current = provider;

    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      onCursorChange?.({ lineNumber: pos.lineNumber, column: pos.column });
    });

    // SELF-HEALING: EXTREME DEDUPLICATION for legacy corrupted rooms.
    // If the room contains multiple copies of the SAM Welcome message, it is corrupted.
    // Reset it to a single clean copy.
    provider.on('sync', (isSynced) => {
      if (isSynced !== false && !hasInitializedRef.current && value) {
        hasInitializedRef.current = true;
        
        ydoc.transact(() => {
          const text = ytext.toString();
          const identifier = "Welcome to SAM Compiler!";
          const occurrences = (text.match(new RegExp(identifier, "g")) || []).length;
          
          if (occurrences > 1) {
            ytext.delete(0, ytext.length);
            ytext.insert(0, value + "\n");
          }
        });
      }
    });

  }, [sessionId, localName, localColor, onCursorChange, value]);

  const monacoTheme = useMemo(() => theme === "light" ? "monolith-light" : "monolith-dark", [theme]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
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
