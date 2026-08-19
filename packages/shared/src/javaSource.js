/**
 * Rewrites a single-file Java program so it compiles and runs under an executor
 * that fixes the file name (Judge0 writes `Main.java` and runs `java Main`; the
 * Docker worker does the same for parity).
 *
 * Both executors used to do this with a regex. The API used
 * `code.replace(/public\s+class\s+\w+/, "public class Main")`, which:
 *   - missed `class Solution { public static void main }` entirely, so the
 *     commonest shape pasted from a textbook died with
 *     "Could not find or load main class Main";
 *   - missed `public final class X` / `public abstract class X`, because it
 *     required `public` to be immediately followed by `class`;
 *   - happily rewrote the words `public class Foo` sitting inside a comment or
 *     a string literal;
 *   - renamed only the declaration, so a constructor named after the class no
 *     longer matched it.
 * The worker's `getJavaMainClass` had the mirror-image problem: it took the
 * FIRST `class` token in the file, so a helper class declared above the main
 * class won, and the word "class" in a comment won over everything.
 *
 * This module makes both paths agree on one answer.
 */

const TYPE_KEYWORDS = "class|interface|enum|record";

/**
 * Returns a same-length copy of `code` with every comment, string literal,
 * text block and char literal replaced by spaces (newlines preserved, so line
 * and column offsets still line up). Every scanning decision below reads the
 * mask; every edit is applied to the real source by index.
 */
function maskJava(code) {
  const out = code.split("");
  const n = code.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  let i = 0;
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];

    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && code[j] !== "\n") j += 1;
      blank(i, j);
      i = j;
      continue;
    }

    if (c === "/" && d === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j + 1] === "/")) j += 1;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
      continue;
    }

    if (code.startsWith('"""', i)) {
      let j = i + 3;
      while (j < n && !code.startsWith('"""', j)) {
        if (code[j] === "\\") j += 1;
        j += 1;
      }
      j = Math.min(n, j + 3);
      blank(i, j);
      i = j;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && code[j] !== c && code[j] !== "\n") {
        if (code[j] === "\\") j += 1;
        j += 1;
      }
      j = Math.min(n, j + 1);
      blank(i, j);
      i = j;
      continue;
    }

    i += 1;
  }

  return out.join("");
}

/** Brace depth immediately before each index of the masked source. */
function braceDepths(mask) {
  const depths = new Array(mask.length);
  let depth = 0;
  for (let i = 0; i < mask.length; i += 1) {
    depths[i] = depth;
    if (mask[i] === "{") depth += 1;
    else if (mask[i] === "}") depth = Math.max(0, depth - 1);
  }
  return depths;
}

/** Every top-level `class|interface|enum|record` declaration, in source order. */
function findTopLevelTypes(mask) {
  const depths = braceDepths(mask);
  const re = new RegExp(`\\b(${TYPE_KEYWORDS})\\s+([A-Za-z_$][\\w$]*)`, "g");
  const found = [];
  let m;
  while ((m = re.exec(mask)) !== null) {
    if (depths[m.index] !== 0) continue;
    found.push({
      keyword: m[1],
      keywordIndex: m.index,
      name: m[2],
      nameStart: m.index + m[0].length - m[2].length,
      nameEnd: m.index + m[0].length
    });
  }
  return found;
}

/**
 * Index of the `main` entry point, or -1. Modifier order is not fixed in Java
 * (`static public void main` is legal), so this matches the signature and then
 * checks that `static` appears among the modifiers in front of it.
 */
function findMainIndex(mask) {
  const re = /\bvoid\s+main\s*\(\s*(?:final\s+)?String\s*(?:\[\s*\]\s*[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*\s*\[\s*\])/g;
  let m;
  while ((m = re.exec(mask)) !== null) {
    const before = mask.slice(Math.max(0, m.index - 80), m.index);
    if (/\bstatic\b[\s\w]*$/.test(before)) return m.index;
  }
  return -1;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word occurrences of `name` in unmasked (real code) regions. */
function wordEdits(mask, name, replacement) {
  const re = new RegExp(`\\b${escapeRe(name)}\\b`, "g");
  const edits = [];
  let m;
  while ((m = re.exec(mask)) !== null) {
    edits.push({ start: m.index, end: m.index + name.length, text: replacement });
  }
  return edits;
}

const MODIFIER_RUN = /^\s*(?:(?:abstract|final|sealed|non-sealed|static|strictfp)\s+)*$/;

/**
 * Removes the `public` modifier in front of a top-level declaration, if any.
 * Java allows one public top-level type per file and its name must match the
 * file name - which the executor has already fixed to Main.java - so every
 * other public type has to lose the modifier or javac rejects the file.
 */
function publicModifierEdit(mask, decl) {
  const windowStart = Math.max(0, decl.keywordIndex - 120);
  const head = mask.slice(windowStart, decl.keywordIndex);
  const m = /\bpublic\b(?![\w$])/.exec(head);
  if (!m) return null;
  const start = windowStart + m.index;
  const between = mask.slice(start + "public".length, decl.keywordIndex);
  if (!MODIFIER_RUN.test(between)) return null;
  const end = start + "public".length;
  return { start, end: mask[end] === " " ? end + 1 : end, text: "" };
}

function applyEdits(code, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = code;
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

/**
 * @param {string} code Raw Java source from the editor.
 * @returns {{ source: string, mainClass: string|null }} Source whose entry
 *   point lives in a type named `Main`, ready to be written to `Main.java`.
 */
function normalizeJavaSource(code) {
  const original = typeof code === "string" ? code : "";
  const mask = maskJava(original);
  const types = findTopLevelTypes(mask);
  if (types.length === 0) return { source: original, mainClass: null };

  const mainIndex = findMainIndex(mask);
  let mainDecl = types[0];
  if (mainIndex !== -1) {
    // Top-level types cannot nest, so the last declaration opened before `main`
    // is the one that contains it.
    for (const t of types) {
      if (t.keywordIndex < mainIndex) mainDecl = t;
    }
  }

  const edits = [];

  if (mainDecl.name !== "Main") {
    const collision = types.find((t) => t !== mainDecl && t.name === "Main");
    if (collision) {
      const taken = new Set(types.map((t) => t.name));
      let free = "Main_1";
      for (let i = 1; taken.has(free); i += 1) free = `Main_${i}`;
      edits.push(...wordEdits(mask, "Main", free));
    }
    edits.push(...wordEdits(mask, mainDecl.name, "Main"));
  }

  for (const t of types) {
    if (t === mainDecl) continue;
    const strip = publicModifierEdit(mask, t);
    if (strip) edits.push(strip);
  }

  return { source: applyEdits(original, edits), mainClass: "Main" };
}

module.exports = { normalizeJavaSource, maskJava };
