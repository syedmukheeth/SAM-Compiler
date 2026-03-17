import React, { useCallback, useMemo, useRef } from "react";
import Editor from "@monaco-editor/react";

const LANGUAGE_TO_MONACO = {
  nodejs: "javascript",
  python: "python",
  cpp: "cpp",
  java: "java",
  go: "go"
};

export default function CodeEditor({ language, value, onChange, onCursorChange }) {
  const editorRef = useRef(null);

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);

  const handleMount = useCallback((editor) => {
    editorRef.current = editor;

    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      onCursorChange?.({ lineNumber: pos.lineNumber, column: pos.column });
    });
  }, [onCursorChange]);

  const handleChange = useCallback(
    (v) => {
      onChange?.(v ?? "");
    },
    [onChange]
  );

  return (
    <div className="h-full w-full bg-transparent">
      <Editor
        theme="vs-dark"
        language={monacoLanguage}
        value={value}
        onMount={handleMount}
        onChange={handleChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          tabSize: 2,
          lineNumbers: "on",
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          padding: { top: 20, bottom: 20 },
          automaticLayout: true,
          formatOnPaste: true,
          formatOnType: true,
          scrollBeyondLastLine: false,
          readOnly: false,
          renderLineHighlight: "none",
          backgroundColor: "#00000000" // Transparent
        }}
        loading={<div className="flex h-full items-center justify-center text-blue-500/20 font-black uppercase tracking-widest animate-pulse">Initializing Flux</div>}
      />
    </div>
  );
}

