import React, { useCallback, useMemo, useRef } from "react";
import Editor from "@monaco-editor/react";

const LANGUAGE_TO_MONACO = {
  nodejs: "javascript",
  python: "python",
  cpp: "cpp"
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
    <Editor
      theme="vs-dark"
      language={monacoLanguage}
      value={value}
      onMount={handleMount}
      onChange={handleChange}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        tabSize: 2,
        lineNumbers: "on",
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        padding: { top: 14 },
        automaticLayout: true,
        formatOnPaste: true,
        formatOnType: true
      }}
    />
  );
}

