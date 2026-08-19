import { describe, it, expect } from "vitest";
import { executeViaPiston } from "../src/modules/runs/pistonExecutor.js";

/**
 * The real language matrix, run against the live cloud sandbox.
 *
 * Gated behind SAM_LIVE_E2E so CI never depends on a third-party public API:
 *
 *   SAM_LIVE_E2E=1 npx vitest run --root apps/api tests/executor.live.test.js
 *
 * Every case here failed before the runtime/flag/limit changes. The comment on
 * each one records the exact error the old configuration produced, so a
 * regression is recognisable from the test name alone.
 */

const LIVE = Boolean(process.env.SAM_LIVE_E2E);
const TIMEOUT = 90000;

let seq = 0;
const run = (runtime, code, stdin = "") =>
  executeViaPiston({
    _id: { toString: () => `live-${(seq += 1)}` },
    runtime,
    entrypoint: null,
    files: [],
    code,
    stdin
  });

const detail = (r) => `status=${r.status} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`;

describe.skipIf(!LIVE)("live language matrix", () => {
  it("JavaScript: optional chaining, nullish coalescing, .at(), replaceAll, Object.hasOwn", async () => {
    // Node 12.14 (id 63): SyntaxError: Unexpected token '.'
    const r = await run(
      "javascript",
      'const o={a:1};console.log(o?.a ?? 0,[1,2,3].at(-1),"aa".replaceAll("a","b"),Object.hasOwn(o,"a"));'
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("1 3 bb true");
  }, TIMEOUT);

  it("Python: match statement, X|Y unions, dataclass(slots=True)", async () => {
    // Python 3.8.1 (id 71): SyntaxError: invalid syntax at `match x:`
    const r = await run(
      "python",
      [
        "from dataclasses import dataclass",
        "@dataclass(slots=True)",
        "class P: x:int|None=None",
        "match 2:",
        '    case 2: print("two", P(1))'
      ].join("\n")
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("two P(x=1)");
  }, TIMEOUT);

  it("C: math.h links without the caller passing -lm", async () => {
    // GCC 9.2 with no flags: "undefined reference to `sqrt`" - Compilation Error
    const r = await run(
      "c",
      '#include <stdio.h>\n#include <math.h>\nint main(){printf("%.6f\\n",sqrt(2.0));return 0;}'
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("1.414214");
  }, TIMEOUT);

  it("C: pthreads link", async () => {
    // No -pthread: "undefined reference to `pthread_create`"
    const r = await run(
      "c",
      '#include <stdio.h>\n#include <pthread.h>\nvoid*f(void*a){(void)a;printf("thr");return 0;}\nint main(){pthread_t t;pthread_create(&t,0,f,0);pthread_join(t,0);printf("|ok\\n");return 0;}'
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("thr|ok");
  }, TIMEOUT);

  it("C++: <ranges>, <format> and std::thread", async () => {
    // GCC 9.2: "fatal error: ranges: No such file or directory"
    // GCC 14 without -std=gnu++20: "'std::views' has not been declared"
    const r = await run(
      "cpp",
      [
        "#include <iostream>",
        "#include <ranges>",
        "#include <vector>",
        "#include <thread>",
        "#include <format>",
        "int main(){std::vector<int> v{1,2,3};",
        "for(int x:v|std::views::reverse)std::cout<<x;",
        'std::thread t([]{std::cout<<"|thr";});t.join();',
        'std::cout<<std::format("|{}",42)<<"\\n";}'
      ].join("\n")
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("321|thr|42");
  }, TIMEOUT);

  it("C++: bits/stdc++.h with a cin loop over multi-line stdin", async () => {
    const r = await run(
      "cpp",
      "#include <bits/stdc++.h>\nusing namespace std;\nint main(){int n;cin>>n;long long s=0;for(int i=0;i<n;i++){int x;cin>>x;s+=x;}cout<<\"sum=\"<<s<<\"\\n\";}",
      "3\n10 20 30"
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("sum=60");
  }, TIMEOUT);

  it("Java: records, switch expressions and text blocks", async () => {
    // OpenJDK 13 (id 62): "switch expressions are a preview feature and are
    // disabled by default"
    const r = await run(
      "java",
      [
        "public class Main{",
        "  record P(int x,int y){}",
        "  public static void main(String[] a){",
        "    var p=new P(1,2);",
        '    String s=switch(p.x()){case 1->"one";default->"other";};',
        '    System.out.println(s+p);',
        "  }",
        "}"
      ].join("\n")
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("oneP[x=1, y=2]");
  }, TIMEOUT);

  it("Java: a non-public main class still runs", async () => {
    // Old regex only matched `public class X`, so this died with
    // "Could not find or load main class Main".
    const r = await run(
      "java",
      'class Solution{ public static void main(String[] a){ System.out.println("hi"); } }'
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("hi");
    expect(r.stderr).not.toMatch(/Could not find or load main class/);
  }, TIMEOUT);

  it("Java: a helper class declared above the main class still runs", async () => {
    const r = await run(
      "java",
      "class Node{ int v=7; }\nclass App{ public static void main(String[] a){ System.out.println(new Node().v); } }"
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("7");
  }, TIMEOUT);

  it("Java: Scanner reads the supplied stdin", async () => {
    const r = await run(
      "java",
      'import java.util.*;\npublic class Main{public static void main(String[] a){Scanner sc=new Scanner(System.in);System.out.println("n="+sc.nextInt());}}',
      "7\n"
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("n=7");
  }, TIMEOUT);

  it("a program that runs longer than the default 5s CPU limit completes", async () => {
    // Without cpu_time_limit this returned "timeout" at 5.08s.
    const r = await run(
      "cpp",
      "#include <bits/stdc++.h>\nint main(){volatile double s=0;for(long long i=0;i<3000000000LL;i++)s+=i;std::cout<<\"done\\n\";}"
    );
    expect(r.status, detail(r)).toBe("succeeded");
    expect(r.stdout.trim()).toBe("done");
  }, TIMEOUT);

  it("reports a compilation error as compilation_error, not a generic failure", async () => {
    const r = await run("cpp", "int main(){ return oops; }");
    expect(r.status, detail(r)).toBe("compilation_error");
    expect(r.stderr).toMatch(/oops/);
  }, TIMEOUT);

  it("reports reading past the end of stdin as a runtime error with an EOF diagnostic", async () => {
    const r = await run("python", 'name=input("Enter name: ")\nprint(name)');
    expect(r.status, detail(r)).toBe("runtime_error");
    expect(r.stderr).toMatch(/EOFError/);
  }, TIMEOUT);

  it("preserves a program's real exit code", async () => {
    const r = await run("python", "import sys\nprint('bye')\nsys.exit(3)");
    expect(r.exitCode, detail(r)).toBe(3);
    expect(r.stdout.trim()).toBe("bye");
  }, TIMEOUT);
});
