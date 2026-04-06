function generateRunTitle(code, runtime) {
  if (!code) return "Empty Run";
  const lines = code.split("\n");
  const skipPatterns = [
    /^\s*#include/, /^\s*import/, /^\s*package/, /^\s*using namespace/,
    /^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*$/, /^\s*{\s*$/, /^\s*}\s*$/,
    /\*\/\s*$/, 
    /\b(int|void|public static void)\s+main\b/,
    /\b(class|struct|module|namespace)\b/
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !skipPatterns.some(p => p.test(line))) {
      return trimmed.length > 50 ? trimmed.substring(0, 47) + "..." : trimmed;
    }
  }
  
  for (const line of lines) {
     if (line.trim().length > 0) return line.trim().substring(0, 50);
  }

  return "Untitled Run";
}

const tests = [
  {
    name: "C++ with boilerplate",
    code: "#include <iostream>\nusing namespace std;\nint main() {\n    cout << \"Hello Task 1\" << endl;\n}",
    expected: 'cout << "Hello Task 1" << endl;'
  },
  {
    name: "Python with imports",
    code: "import os\nimport sys\n\ndef main():\n    print(\"Work done\")",
    expected: 'def main():'
  },
  {
    name: "Java with class",
    code: "public class Solution {\n    public static void main(String[] args) {\n        System.out.println(\"Result: 42\");\n    }\n}",
    expected: 'System.out.println("Result: 42");'
  },
  {
    name: "JS with only comments",
    code: "// This is a comment\n/* Block \n   comment */",
    expected: '// This is a comment'
  }
];

tests.forEach(t => {
  const result = generateRunTitle(t.code, "");
  console.log("[" + t.name + "] Result: \"" + result + "\" | " + (result === t.expected ? "PASS" : "FAIL (Expected: " + t.expected + ")"));
});
