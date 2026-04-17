/**
 * 🛰️ SAM Error Analysis Engine (High-Fidelity)
 * Parses raw compiler/runtime output into structured Monaco markers.
 * Standardized for V2 Diagnostics.
 */

const MONACO_SEVERITY = {
  ERROR: 8, // monaco.MarkerSeverity.Error
  WARNING: 4,
  INFO: 2
};

/**
 * Parses stderr into a list of structured diagnostics.
 * @param {string} output - Raw stderr or stdout content
 * @param {string} language - Current active language
 * @returns {Object} { markers: Array, summary: String, primaryLine: Number }
 */
export const parseErrors = (output, language) => {
  if (!output) return { markers: [], summary: "", primaryLine: null };
  const markers = [];
  const lines = output.split('\n');
  let primaryLine = null;

  // 🛡️ C/C++ Parser (GCC/Clang)
  // Format: "main.cpp:5:10: error: message" or "main.cpp:5: error: message"
  if (language === 'cpp' || language === 'c') {
    const regex = /:(\d+):(?:(\d+):)?\s+(error|warning|fatal error):\s+(.*)/i;
    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        const lineNum = parseInt(match[1]);
        const colNum = match[2] ? parseInt(match[2]) : 1;
        if (!primaryLine) primaryLine = lineNum;
        markers.push({
          startLineNumber: lineNum,
          startColumn: colNum,
          endLineNumber: lineNum,
          endColumn: colNum + 5,
          message: match[4] ? match[4].trim() : "Unknown compiler error",
          severity: (match[3].toLowerCase().includes('error')) ? MONACO_SEVERITY.ERROR : MONACO_SEVERITY.WARNING
        });
      }
    });
  }

  // ☕ Java Parser (javac)
  // Format: "Solution.java:5: error: message"
  else if (language === 'java') {
    const regex = /:(\d+):\s+error:\s+(.*)/i;
    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        const lineNum = parseInt(match[1]);
        if (!primaryLine) primaryLine = lineNum;
        markers.push({
          startLineNumber: lineNum,
          startColumn: 1,
          endLineNumber: lineNum,
          endColumn: 100,
          message: match[2],
          severity: MONACO_SEVERITY.ERROR
        });
      }
    });
  }

  // 🐍 Python Parser (Tracebacks)
  // Format: File "main.py", line 4, in <module>\n SyntaxError: message
  else if (language === 'python') {
    const tracebackRegex = /line\s+(\d+)/i;
    const errorMsgRegex = /^(\w+Error|SyntaxError):\s+(.*)/i;
    
    let lastLineNum = -1;
    lines.forEach(line => {
      const tbMatch = line.match(tracebackRegex);
      if (tbMatch) lastLineNum = parseInt(tbMatch[1]);
      
      const msgMatch = line.match(errorMsgRegex);
      if (msgMatch && lastLineNum !== -1) {
        if (!primaryLine) primaryLine = lastLineNum;
        markers.push({
          startLineNumber: lastLineNum,
          startColumn: 1,
          endLineNumber: lastLineNum,
          endColumn: 100,
          message: `${msgMatch[1]}: ${msgMatch[2]}`,
          severity: MONACO_SEVERITY.ERROR
        });
      }
    });
  }

  // 📜 JavaScript / Node.js
  // Format: app.js:10:15 or stack trace
  else if (language === 'javascript' || language === 'nodejs') {
    const stackRegex = /:(\d+):(\d+)(?:\)|$)/;
    const errorMsgRegex = /^(\w+Error|SyntaxError):\s+(.*)/i;

    let lastLineNum = -1;
    let lastCol = 1;
    
    lines.forEach(line => {
      const stackMatch = line.match(stackRegex);
      if (stackMatch) {
        lastLineNum = parseInt(stackMatch[1]);
        lastCol = parseInt(stackMatch[2]);
      }
      
      const msgMatch = line.match(errorMsgRegex);
      if (msgMatch && lastLineNum !== -1) {
        if (!primaryLine) primaryLine = lastLineNum;
        markers.push({
          startLineNumber: lastLineNum,
          startColumn: lastCol,
          endLineNumber: lastLineNum,
          endColumn: lastCol + 10,
          message: `${msgMatch[1]}: ${msgMatch[2]}`,
          severity: MONACO_SEVERITY.ERROR
        });
      }
    });
  }

  // 🐹 Go Parser
  // Format: main.go:5:2: message
  else if (language === 'go') {
    const regex = /:(\d+):(\d+):\s+(.*)/i;
    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        const lineNum = parseInt(match[1]);
        if (!primaryLine) primaryLine = lineNum;
        markers.push({
          startLineNumber: lineNum,
          startColumn: parseInt(match[2]),
          endLineNumber: lineNum,
          endColumn: parseInt(match[2]) + 5,
          message: match[3],
          severity: MONACO_SEVERITY.ERROR
        });
      }
    });
  }

  // 🦀 Rust Parser
  // Format: --> src/main.rs:5:9
  else if (language === 'rust') {
    const locRegex = /-->\s+.*:(\d+):(\d+)/i;
    const errorRegex = /^error\[.*\]:\s+(.*)/i;
    
    let lastLineNum = -1;
    let lastCol = 1;
    let lastMsg = "";

    lines.forEach(line => {
      const locMatch = line.match(locRegex);
      if (locMatch) {
        lastLineNum = parseInt(locMatch[1]);
        lastCol = parseInt(locMatch[2]);
      }
      const errMatch = line.match(errorRegex);
      if (errMatch) lastMsg = errMatch[1];

      if (lastLineNum !== -1 && lastMsg) {
        if (!primaryLine) primaryLine = lastLineNum;
        markers.push({
          startLineNumber: lastLineNum,
          startColumn: lastCol,
          endLineNumber: lastLineNum,
          endColumn: lastCol + 10,
          message: lastMsg,
          severity: MONACO_SEVERITY.ERROR
        });
        lastMsg = ""; // Reset for next error in same file
      }
    });
  }

  return { markers, primaryLine };
};

export default { parseErrors };
