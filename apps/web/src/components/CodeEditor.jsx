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
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const hasInitializedRef = useRef(false);

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);

  const localName = useMemo(() => userName || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], [userName]);
  const localColor = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)], []);

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Define Monolith Dark Theme (Strict Monochromatic Matrix)
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

    // Define Monolith Light Theme (Premium Monochrome Aesthetic)
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

    if (providerRef.current) return;
    
    // Initialize Yjs
    const ydoc = new Y.Doc();
    const endpoint = ENDPOINTS.WS_ENDPOINT;

    const provider = new SocketIOProvider(endpoint, sessionId, ydoc, {
      ...ENDPOINTS.SOCKET_OPTIONS,
      autoConnect: true
    });

    const ytext = ydoc.getText("monaco");

    // Assign to refs IMMEDIATELY for event visibility
    ydocRef.current = ydoc;
    ytextRef.current = ytext;
    providerRef.current = provider;

    // Bind Monaco to Yjs
    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );
    bindingRef.current = binding;

    // Set local awareness (Cursors/Presence)
    provider.awareness.setLocalStateField("user", {
      name: localName,
      color: localColor
    });

    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      onCursorChange?.({ lineNumber: pos.lineNumber, column: pos.column });
    });

    // BROWSER SANITATION GUARD (The Final Hammer)
    provider.on('sync', (isSynced) => {
      if (isSynced !== false && !hasInitializedRef.current) {
        hasInitializedRef.current = true;
        
        // Defensive check: only transact if refs are still valid in current mount
        const currentYdoc = ydocRef.current;
        const currentYtext = ytextRef.current;
        
        if (currentYdoc && currentYtext) {
          currentYdoc.transact(() => {
            const text = currentYtext.toString();
            const identifier = "Welcome to SAM Compiler!";
            const occurrences = (text.match(new RegExp(identifier, "g")) || []).length;
            
            if (occurrences > 1) {
              currentYtext.delete(0, currentYtext.length);
              if (value) {
                currentYtext.insert(0, value + "\n");
              }
            }
          });
        }
      }
    });
    
  }, [localName, localColor, onCursorChange, value, sessionId]);

  // THEME PERSISTENCE
  const monacoTheme = useMemo(() => theme === "light" ? "monolith-light" : "vs-dark", [theme]);

  // Provider & Binding Lifecycle Management
  useEffect(() => {
    if (editorRef.current && !providerRef.current) {
      handleMount(editorRef.current, window.monaco);
    }

    // EMERGENCY RESET LISTENER - Now using Refs to avoid ReferenceError
    const handleResetEvent = (e) => {
      const { template } = e.detail;
      if (template && ydocRef.current && ytextRef.current) {
        ydocRef.current.transact(() => {
          ytextRef.current.delete(0, ytextRef.current.length);
          ytextRef.current.insert(0, template);
        });
      }
    };
    window.addEventListener('sam-editor-reset', handleResetEvent);

    return () => {
      window.removeEventListener('sam-editor-reset', handleResetEvent);
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      ydocRef.current = null;
      ytextRef.current = null;
      hasInitializedRef.current = false;
    };
  }, [sessionId, handleMount]); // Re-run when session ID changes

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
