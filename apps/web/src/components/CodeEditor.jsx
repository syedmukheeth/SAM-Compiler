import React, { useCallback, useMemo, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { io } from "socket.io-client";
import { SocketIOProvider } from "y-socket.io";

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

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);

  const localName = useMemo(() => userName || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], [userName]);
  const localColor = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)], []);

  const handleMount = useCallback((editor) => {
    editorRef.current = editor;

    // Initialize Yjs
    const ydoc = new Y.Doc();
    const endpoint = window.location.hostname.includes("vercel.app") 
      ? "https://liquid-ide.onrender.com" 
      : window.location.origin;

    const provider = new SocketIOProvider(endpoint, sessionId, ydoc, {
      autoConnect: true,
      transports: ["polling", "websocket"]
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

    // If initial value exists and doc is empty, populate it
    if (value && ytext.toString() === "") {
      ytext.insert(0, value);
    }

  }, [sessionId, localName, localColor, onCursorChange, value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bindingRef.current) bindingRef.current.destroy();
      if (providerRef.current) providerRef.current.destroy();
    };
  }, []);

  const handleChange = useCallback(
    (v) => {
      // With Yjs, the binding handles the sync, but we still trigger onChange for the parent
      onChange?.(v ?? "");
    },
    [onChange]
  );

  return (
    <div className="h-full w-full bg-transparent">
      <Editor
        theme={theme}
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
