import { describe, it, expect } from "vitest";
import { clampCode, clampHistory, buildSystemInstruction, BUDGETS } from "../src/modules/ai/ai.service.js";

describe("AI context budgets", () => {
  it("passes short files through untouched", () => {
    const code = "console.log(1);";
    expect(clampCode(code)).toBe(code);
  });

  // The route accepts up to 1MB of code, which is roughly 250k tokens and was
  // previously forwarded to the model verbatim on every single request.
  it("clamps a very large file and says what it removed", () => {
    const code = "x".repeat(500000);
    const out = clampCode(code);
    expect(out.length).toBeLessThan(code.length);
    expect(out.length).toBeLessThanOrEqual(BUDGETS.MAX_CODE_CHARS + 200);
    expect(out).toContain("characters omitted");
  });

  it("keeps both the start and the end of a clamped file", () => {
    const code = "HEAD_MARKER" + "y".repeat(200000) + "TAIL_MARKER";
    const out = clampCode(code);
    expect(out.startsWith("HEAD_MARKER")).toBe(true);
    expect(out.endsWith("TAIL_MARKER")).toBe(true);
  });

  it("handles a missing or non-string file", () => {
    expect(clampCode(undefined)).toBe("");
    expect(clampCode(null)).toBe("");
    expect(clampCode(42)).toBe("");
  });

  it("caps how many turns are replayed", () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const out = clampHistory(messages);
    expect(out.length).toBe(BUDGETS.MAX_HISTORY_MESSAGES);
    // Keeps the most recent turns, not the oldest.
    expect(out[out.length - 1].content).toBe("m19");
  });

  // Assistant replies carry entire files, so this is where history bloats.
  it("truncates older turns but never the current one", () => {
    const long = "z".repeat(50000);
    const out = clampHistory([
      { role: "assistant", content: long },
      { role: "user", content: long }
    ]);
    expect(out[0].content.length).toBeLessThan(long.length);
    expect(out[0].content).toContain("truncated");
    expect(out[1].content).toBe(long);
  });

  it("tolerates malformed history without throwing", () => {
    expect(clampHistory(undefined)).toEqual([]);
    expect(clampHistory([{ role: "user" }])[0].content).toBe("");
  });

  it("builds a system instruction containing the clamped file", () => {
    const out = buildSystemInstruction("python", "print(1)");
    expect(out).toContain("Language: python");
    expect(out).toContain("print(1)");
  });
});
