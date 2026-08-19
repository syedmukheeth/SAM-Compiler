import { describe, it, expect } from "vitest";
import {
  buildJudge0Payload,
  runtimeFilename,
  LANGUAGE_MAP,
  COMPILER_OPTIONS,
  RESOURCE_LIMITS,
  STATUS_MAP
} from "../src/modules/runs/pistonExecutor.js";

/**
 * Pure guards, no network. Every assertion here corresponds to a failure that
 * was reproduced against the live sandbox:
 *
 *   Node 12.14  -> `o?.a` was a SyntaxError
 *   Python 3.8  -> `match x:` was a SyntaxError
 *   GCC 9.2     -> `#include <ranges>` did not exist
 *   OpenJDK 13  -> records and switch expressions were preview-gated
 *   no -lm      -> `sqrt` was "undefined reference"
 *   no -pthread -> `std::thread` was "undefined reference to pthread_create"
 *   no limits   -> an 8s program came back as a timeout at 5.08s
 *
 * If any of these values regress, the corresponding class of user program stops
 * running - so they are pinned here rather than left to a code review.
 */

const decode = (b64) => Buffer.from(b64, "base64").toString("utf8");

const runFor = (runtime, code, stdin = "") => ({
  _id: "000000000000000000000001",
  runtime,
  entrypoint: runtimeFilename(runtime),
  files: [{ path: runtimeFilename(runtime), content: code }],
  stdin
});

describe("Judge0 language pinning", () => {
  it("targets runtimes new enough for modern code", () => {
    expect(LANGUAGE_MAP).toEqual({
      python: 109,     // 3.13.2 - `match`, X|Y unions, dataclass(slots=)
      javascript: 102, // Node 22.08 - ?., ??, .at(), replaceAll, Object.hasOwn
      cpp: 105,        // GCC 14.1 - <ranges>, <format>
      c: 103,          // GCC 14.1
      java: 91         // JDK 17 - records, switch expressions, text blocks
    });
  });

  it("offers exactly the languages both entry points validate", () => {
    expect(Object.keys(LANGUAGE_MAP).sort()).toEqual(["c", "cpp", "java", "javascript", "python"]);
  });

  it("rejects a runtime it cannot map instead of guessing", () => {
    expect(() => buildJudge0Payload(runFor("go", "package main"))).toThrow(/does not support runtime/);
  });
});

describe("compiler options", () => {
  it("links libm and pthread and selects a current standard for C", () => {
    const opts = buildJudge0Payload(runFor("c", "int main(){}")).compiler_options;
    expect(opts).toBe(COMPILER_OPTIONS.c);
    expect(opts).toContain("-lm");
    expect(opts).toContain("-pthread");
    expect(opts).toMatch(/-std=gnu(?:\d\d|17)/);
  });

  it("selects C++20 and links pthread for C++", () => {
    const opts = buildJudge0Payload(runFor("cpp", "int main(){}")).compiler_options;
    expect(opts).toBe(COMPILER_OPTIONS.cpp);
    expect(opts).toContain("-std=gnu++20");
    expect(opts).toContain("-pthread");
  });

  it("sends no compiler options for interpreted languages", () => {
    for (const runtime of ["python", "javascript", "java"]) {
      expect(buildJudge0Payload(runFor(runtime, "x")).compiler_options).toBeUndefined();
    }
  });
});

describe("resource limits", () => {
  it("raises every limit above the sandbox defaults", () => {
    const payload = buildJudge0Payload(runFor("python", "print(1)"));
    expect(payload.cpu_time_limit).toBeGreaterThan(5);
    expect(payload.wall_time_limit).toBeGreaterThan(10);
    expect(payload.memory_limit).toBeGreaterThan(256000);
    expect(payload.stack_limit).toBeGreaterThan(64000);
  });

  it("stays within the public instance's advertised maxima", () => {
    expect(RESOURCE_LIMITS.cpu_time_limit).toBeLessThanOrEqual(20);
    expect(RESOURCE_LIMITS.wall_time_limit).toBeLessThanOrEqual(30);
    expect(RESOURCE_LIMITS.memory_limit).toBeLessThanOrEqual(2048000);
  });

  it("applies to every language", () => {
    for (const runtime of Object.keys(LANGUAGE_MAP)) {
      const payload = buildJudge0Payload(runFor(runtime, "x"));
      for (const key of Object.keys(RESOURCE_LIMITS)) {
        expect(payload[key]).toBe(RESOURCE_LIMITS[key]);
      }
    }
  });
});

describe("payload shape", () => {
  it("base64-encodes source and stdin", () => {
    const payload = buildJudge0Payload(runFor("python", "print(input())", "42\n"));
    expect(decode(payload.source_code)).toBe("print(input())");
    expect(decode(payload.stdin)).toBe("42\n");
  });

  it("sends an empty stdin rather than undefined when the panel is blank", () => {
    expect(decode(buildJudge0Payload(runFor("c", "int main(){}")).stdin)).toBe("");
  });

  it("falls back to the first file when the entrypoint does not match", () => {
    const payload = buildJudge0Payload({
      _id: "1",
      runtime: "javascript",
      entrypoint: "nope.js",
      files: [{ path: "solution.js", content: "console.log(1)" }]
    });
    expect(decode(payload.source_code)).toBe("console.log(1)");
  });
});

describe("java normalization on the way out", () => {
  it("moves a non-public main class into Main", () => {
    const payload = buildJudge0Payload(
      runFor("java", 'class Solution{ public static void main(String[] a){ System.out.println("hi"); } }')
    );
    // Judge0 writes the file as Main.java and runs `java Main`; without this the
    // run died with "Could not find or load main class Main".
    expect(decode(payload.source_code)).toMatch(/class\s+Main\b/);
  });

  it("leaves the seeded template untouched", () => {
    const template = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome to SAM Compiler!");\n    }\n}\n';
    expect(decode(buildJudge0Payload(runFor("java", template)).source_code)).toBe(template);
  });

  it("does not rewrite non-Java sources", () => {
    const code = 'print("class Solution")';
    expect(decode(buildJudge0Payload(runFor("python", code)).source_code)).toBe(code);
  });
});

describe("entry file naming", () => {
  it("names the Java entry Main.java so the worker's javac call matches", () => {
    expect(runtimeFilename("java")).toBe("Main.java");
  });

  it("gives every other runtime its conventional extension", () => {
    expect(runtimeFilename("python")).toBe("solution.py");
    expect(runtimeFilename("cpp")).toBe("solution.cpp");
    expect(runtimeFilename("c")).toBe("solution.c");
    expect(runtimeFilename("javascript")).toBe("solution.js");
  });
});

describe("status mapping", () => {
  it("does not report an unfinished submission as a failure", () => {
    // The public instance advertises enable_wait_result:false, so a queued or
    // processing submission can come back from a wait=true call.
    expect(STATUS_MAP[1]).toBe("queued");
    expect(STATUS_MAP[2]).toBe("running");
  });

  it("distinguishes compilation, timeout and memory failures", () => {
    expect(STATUS_MAP[3]).toBe("succeeded");
    expect(STATUS_MAP[5]).toBe("timeout");
    expect(STATUS_MAP[6]).toBe("compilation_error");
    expect(STATUS_MAP[12]).toBe("memory_limit");
  });
});
