import React, { useCallback, useMemo, useRef } from "react";
import Editor from "@monaco-editor/react";

const LANGUAGE_TO_MONACO = {
  nodejs: "javascript",
  python: "python",
  cpp: "cpp",
  c: "cpp",
  java: "java"
};

export default function CodeEditor({ language, value, onChange, onCursorChange, theme = "vs-dark", options = {} }) {
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
        theme={theme}
        language={monacoLanguage}
        value={value}
        onMount={handleMount}
        onChange={handleChange}
        options={{
          minimap: { enabled: false },
          fontSize: options.fontSize || 14,
          tabSize: options.tabSize || 2,
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
        loading={<div className="flex h-full items-center justify-center text-blue-500/20 font-black uppercase tracking-widest animate-pulse">Initializing LiquidIDE</div>}
      />
    </div>
  );
}

