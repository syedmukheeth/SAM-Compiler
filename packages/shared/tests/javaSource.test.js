import { describe, it, expect } from "vitest";
import { normalizeJavaSource, maskJava } from "@sam/shared";

/**
 * Every executor writes Java to Main.java and runs `java Main`. Each case below
 * is a shape that failed on the live sandbox before this normalizer existed -
 * see the plan's regression matrix. The assertion that matters is always the
 * same: after normalization the entry point lives in a type called Main, and
 * nothing else in the file is a public top-level type.
 */

const declaresMain = (src) => /\b(?:class|record|enum|interface)\s+Main\b/.test(src);
const publicTypes = (src) => src.match(/\bpublic\s+(?:(?:abstract|final|sealed|non-sealed|static|strictfp)\s+)*(?:class|record|enum|interface)\s+(\w+)/g) || [];

describe("normalizeJavaSource", () => {
  it("renames a non-public main class - the LeetCode shape", () => {
    // Verified live: this produced "Could not find or load main class Main".
    const { source, mainClass } = normalizeJavaSource(
      'class Solution{ public static void main(String[] a){ System.out.println("hi"); } }'
    );
    expect(mainClass).toBe("Main");
    expect(declaresMain(source)).toBe(true);
    expect(source).not.toMatch(/\bclass\s+Solution\b/);
  });

  it("handles modifiers between public and class", () => {
    for (const modifier of ["final", "abstract", "strictfp"]) {
      const { source } = normalizeJavaSource(
        `public ${modifier} class Solver{ public static void main(String[] a){} }`
      );
      expect(declaresMain(source)).toBe(true);
      expect(source).not.toMatch(/\bSolver\b/);
    }
  });

  it("renames constructors along with the class", () => {
    const { source } = normalizeJavaSource(
      "class Solution{ int v; Solution(){v=1;} public static void main(String[] a){ System.out.println(new Solution().v); } }"
    );
    // A declaration-only rename leaves `Solution()` as a method with no return
    // type, which does not compile.
    expect(source).not.toMatch(/\bSolution\b/);
    expect(source).toContain("Main(){v=1;}");
    expect(source).toContain("new Main()");
  });

  it("ignores class declarations inside comments and strings", () => {
    const { source } = normalizeJavaSource(
      '// public class Fake\nclass Real{ public static void main(String[] a){ System.out.println("Real is a class"); } }'
    );
    expect(source).toContain("// public class Fake");
    expect(source).toContain('System.out.println("Real is a class")');
    expect(declaresMain(source)).toBe(true);
  });

  it("picks the class that holds main, not the first class in the file", () => {
    // The worker's old getJavaMainClass took the first `class` token, so a
    // helper type declared above main won and javac was handed the wrong name.
    const { source } = normalizeJavaSource(
      "class Node{ int v; }\nclass App{ public static void main(String[] a){ System.out.println(new Node().v); } }"
    );
    expect(source).toContain("class Node{ int v; }");
    expect(source).toMatch(/class\s+Main\{\s*public static void main/);
  });

  it("is a no-op on an already-correct public class Main", () => {
    const input = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome to SAM Compiler!");\n    }\n}\n';
    expect(normalizeJavaSource(input).source).toBe(input);
  });

  it("strips public from every other top-level type", () => {
    // Java allows exactly one public top-level type and its name must match the
    // file name, which the executor has already fixed to Main.java.
    const { source } = normalizeJavaSource(
      "public class Helper{ static int f(){return 9;} }\nclass App{ public static void main(String[] a){ System.out.println(Helper.f()); } }"
    );
    expect(publicTypes(source)).toHaveLength(0);
    expect(source).toContain("Helper.f()");
  });

  it("accepts modifiers in either order", () => {
    const { source } = normalizeJavaSource(
      "class Z{ static public void main(String[] args){ System.out.println(2); } }"
    );
    expect(declaresMain(source)).toBe(true);
  });

  it("renames a colliding type out of the way before claiming Main", () => {
    const { source } = normalizeJavaSource(
      "class Main{ static int k=5; }\nclass Solution{ public static void main(String[] a){ System.out.println(Main.k); } }"
    );
    expect(source).toContain("class Main_1{ static int k=5; }");
    expect(source).toContain("System.out.println(Main_1.k)");
    expect(source).toMatch(/class\s+Main\{\s*public static void main/);
  });

  it("leaves records and interfaces alone while renaming the runner", () => {
    const { source } = normalizeJavaSource(
      "record Point(int x,int y){}\npublic abstract class Base{ abstract void go(); }\nfinal class Runner extends Base{ void go(){} public static void main(String[] a){ System.out.println(new Point(1,2)); } }"
    );
    expect(source).toContain("record Point(int x,int y){}");
    expect(source).toContain("abstract class Base");
    expect(publicTypes(source)).toHaveLength(0);
    expect(source).toContain("final class Main extends Base");
  });

  it("returns the source untouched when there is no type declaration", () => {
    const input = 'System.out.println("snippet");';
    expect(normalizeJavaSource(input)).toEqual({ source: input, mainClass: null });
  });
});

describe("maskJava", () => {
  it("preserves length and line structure so edit offsets stay valid", () => {
    const src = 'class A{\n  // comment\n  String s = "class B";\n  /* block */\n}';
    const mask = maskJava(src);
    expect(mask).toHaveLength(src.length);
    expect(mask.split("\n")).toHaveLength(src.split("\n").length);
    expect(mask).not.toContain("comment");
    expect(mask).not.toContain("class B");
    expect(mask).toContain("class A");
  });

  it("blanks text blocks", () => {
    const mask = maskJava('class A{ String s = """\n  class Hidden\n  """; }');
    expect(mask).not.toContain("class Hidden");
    expect(mask).toContain("class A");
  });
});
