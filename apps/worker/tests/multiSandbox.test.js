import { describe, it, expect } from "vitest";
import { prepareRun } from "../src/sandbox/multiSandbox.js";

/**
 * `prepareRun` is the whole decision half of the Docker sandbox: which files
 * get written, under what names, and the exact docker argv. Testing it directly
 * means these run without Docker installed - which is precisely why the Java
 * defect below survived: nothing could observe the composed command.
 *
 * Two classes of bug are covered:
 *   1. Java. The file list was shallow-copied, so renaming the entry file
 *      mutated the caller's Mongoose subdocuments; the source lookup that
 *      followed then missed, passed an empty string to the command builder, and
 *      the worker ran `javac Solution.java` against a Main.java on disk. Every
 *      Java run failed to compile.
 *   2. C/C++. No -std, -lm or -pthread, so math.h and thread users failed to
 *      link even though the same programs build fine in VS Code.
 */

const prepare = (language, content, entrypoint) =>
  prepareRun({ language, files: [{ path: entrypoint, content }], entrypoint });

describe("java on the docker path", () => {
  it("compiles Main.java and runs Main", () => {
    const r = prepare("java", 'public class Main{ public static void main(String[] a){ System.out.println("hi"); } }', "Main.java");
    expect(r.shellCommand).toContain("javac Main.java");
    expect(r.shellCommand).toContain("java Main");
    // Regression: this used to be `javac Solution.java` against a Main.java.
    expect(r.shellCommand).not.toContain("Solution");
    expect(r.files.map((f) => f.path)).toEqual(["Main.java"]);
  });

  it("hands the command builder the real source, never an empty string", () => {
    const r = prepare("java", "class Solution{ public static void main(String[] a){} }", "Main.java");
    expect(r.sourceCode).not.toBe("");
    expect(r.sourceCode).toMatch(/class\s+Main\b/);
  });

  it("normalizes a non-public main class before writing it", () => {
    const r = prepare("java", 'class Solution{ public static void main(String[] a){ System.out.println("hi"); } }', "Main.java");
    expect(r.files[0].path).toBe("Main.java");
    expect(r.files[0].content).toMatch(/class\s+Main\b/);
    expect(r.files[0].content).not.toMatch(/\bSolution\b/);
  });

  it("renames a legacy Solution.java entrypoint onto Main.java", () => {
    const r = prepare("java", "public class Main{ public static void main(String[] a){} }", "Solution.java");
    expect(r.files.map((f) => f.path)).toEqual(["Main.java"]);
    expect(r.entry).toBe("Main.java");
    expect(r.shellCommand).toContain("javac Main.java");
  });

  it("does not mutate the caller's file objects", () => {
    // These are Mongoose subdocuments owned by the run record; the old shallow
    // copy rewrote their `path` in place.
    const files = [{ path: "Solution.java", content: "class Solution{ public static void main(String[] a){} }" }];
    prepareRun({ language: "java", files, entrypoint: "Solution.java" });
    expect(files[0].path).toBe("Solution.java");
    expect(files[0].content).toContain("class Solution");
  });
});

describe("compiler flags on the docker path", () => {
  it("links libm and pthread for C and selects a current standard", () => {
    const cmd = prepare("c", "int main(){}", "solution.c").shellCommand;
    expect(cmd).toContain("gcc solution.c");
    expect(cmd).toContain("-lm");
    expect(cmd).toContain("-pthread");
    expect(cmd).toContain("-std=gnu17");
  });

  it("selects C++20 and links pthread for C++", () => {
    const cmd = prepare("cpp", "int main(){}", "solution.cpp").shellCommand;
    expect(cmd).toContain("g++ solution.cpp");
    expect(cmd).toContain("-std=gnu++20");
    expect(cmd).toContain("-pthread");
  });

  it("matches the flags the cloud executor sends, so both backends agree", () => {
    // Kept in step with COMPILER_OPTIONS in
    // apps/api/src/modules/runs/pistonExecutor.js.
    expect(prepare("c", "", "a.c").shellCommand).toContain("-std=gnu17 -O2 -lm -pthread");
    expect(prepare("cpp", "", "a.cpp").shellCommand).toContain("-std=gnu++20 -O2 -pthread");
  });

  it("keeps a compile failure distinguishable from a runtime failure", () => {
    // `|| exit 6` is what executeRun's status mapper reads as compilation_error.
    expect(prepare("cpp", "", "a.cpp").shellCommand).toContain("exit 6");
    expect(prepare("c", "", "a.c").shellCommand).toContain("exit 6");
  });

  it("runs interpreted languages directly", () => {
    expect(prepare("javascript", "", "solution.js").shellCommand).toBe("'node' 'solution.js'");
    expect(prepare("python", "", "solution.py").shellCommand).toBe("'python' 'solution.py'");
  });
});

describe("sandbox hardening is still applied", () => {
  const args = prepare("javascript", "console.log(1)", "solution.js").dockerArgs;

  it("runs with no network, dropped capabilities and an unprivileged uid", () => {
    expect(args).toContain("--network");
    expect(args).toContain("none");
    expect(args).toContain("--cap-drop");
    expect(args).toContain("ALL");
    expect(args).toContain("--read-only");
    expect(args).toContain("--security-opt");
    expect(args).toContain("no-new-privileges");
    expect(args).toContain("1000:1000");
  });

  it("mounts the workspace read-only and copies into a writable tmpfs", () => {
    expect(args.some((a) => a.endsWith(":/workspace-host:ro"))).toBe(true);
    expect(args[args.length - 1]).toContain("cp -r /workspace-host/. /workspace/");
  });

  it("keeps /workspace executable so compiled binaries can run", () => {
    // noexec here made every C and C++ run fail structurally.
    const workspaceTmpfs = args.find((a) => typeof a === "string" && a.startsWith("/workspace:"));
    expect(workspaceTmpfs).toBeDefined();
    expect(workspaceTmpfs).not.toContain("noexec");
  });
});

describe("path handling", () => {
  it("strips parent-directory traversal from the entry file", () => {
    const r = prepareRun({
      language: "javascript",
      files: [{ path: "../../etc/passwd.js", content: "" }],
      entrypoint: "../../etc/passwd.js"
    });
    expect(r.entry).not.toContain("..");
  });

  it("falls back to the first file when the entrypoint does not match", () => {
    const r = prepareRun({
      language: "javascript",
      files: [{ path: "solution.js", content: "console.log(1)" }],
      entrypoint: "nope.js"
    });
    expect(r.sourceCode).toBe("console.log(1)");
  });
});
