import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { SocketIOProvider } from "y-socket.io";
import ENDPOINTS from "../services/endpoints";
import toast from "react-hot-toast";

// Monaco was being downloaded TWICE. `y-monaco` imports
// monaco-editor/esm/vs/editor/editor.api.js, so Vite bundled a full local
// Monaco into the `monaco` chunk (~630KB gzipped) and the app fetched it on
// load. But @monaco-editor/react defaults to pulling its OWN copy from
// jsDelivr, so that local chunk was downloaded and then thrown away while the
// editor actually rendered from a four-deep serialised CDN chain
// (loader.js -> editor.main.js -> contributions -> editor.api, ~1MB more)
// that did not start until ~1.3s and did not settle until ~3.0s. The editor is
// the largest element on the page, so LCP could not happen until it finished.
//
// Pointing the loader at the copy that is already in the bundle deletes the
// whole CDN chain, and takes the third party off the critical path with it -
// a jsDelivr outage used to mean no editor at all.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// editor.api.js is the editor without any language grammars, so the five
// languages SAM compiles are registered explicitly. Importing the full
// basic-languages barrel would pull in ~90 grammars for no benefit.
// cpp.contribution registers both `c` and `cpp`.
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution.js";

// Self-hosted Monaco needs to be told how to spawn its workers; without this it
// falls back to running tokenisation on the main thread. Monaco reads this off
// `self`, which on the main thread is `window`.
window.MonacoEnvironment = { getWorker: () => new editorWorker() };
loader.config({ monaco });

const LANGUAGE_TO_MONACO = {
  nodejs: "javascript",
  python: "python",
  cpp: "cpp",
  c: "cpp",
  java: "java"
};

const RANDOM_NAMES = [
  "Anonymous Panda", "Anonymous Google SE", "Anonymous Byte", "Anonymous SRE",
  "Anonymous Kernel", "Anonymous Stack", "Anonymous Pointer", "Anonymous Docker"
];

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// How long to wait for the collaboration server before giving up and letting the
// user edit locally. Render's free tier cold-starts in ~10-30s; the editor must
// not be blank for any of it.
const SYNC_TIMEOUT_MS = 6000;

// How often to retry the collaboration session after falling back to local mode.
const OFFLINE_RETRY_MS = 20000;

// How long after the provider reports "sync" to keep waiting for the room's
// actual content before concluding the room is empty and seeding it.
const SYNC_SETTLE_MS = 2000;

/**
 * CodeEditor - Collaborative Monaco editor powered by Yjs + y-socket.io.
 *
 * Key architecture decisions:
 * 1. Yjs is the source of truth for document content ONCE the room has synced.
 * 2. The Monaco model is filled with the local buffer (template or last edit)
 *    the instant the editor mounts, and MonacoBinding is attached only after the
 *    room syncs - the binding's constructor copies ytext into the model, so
 *    attaching it before sync blanked the editor and left it blank for as long
 *    as the server took to answer (forever, if it was down).
 * 3. If the room never syncs, the editor keeps working offline against a local
 *    Yjs doc and retries the connection in the background.
 * 4. The Yjs lifecycle is initialized INSIDE `handleMount` so it always has a
 *    valid editor reference.
 */
const CodeEditor = ({
  language,
  value,
  onChange,
  onCursorChange,
  sessionId = "default",
  userName = null,
  theme = "vs-dark",
  markers = [],
  options = {}
}) => {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const providerRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null); // live ref to current Yjs text node
  const hasInitializedRef = useRef(false);
  const cleanupRef = useRef(null); // holds the current session cleanup fn
  const pendingResetRef = useRef(null); // reset requested before the doc synced
  // Text the user had locally when a reconnect attempt starts. Applied over the
  // room after it syncs so work done offline is not silently replaced.
  const carryOverTextRef = useRef(null);

  // "connecting" until the room syncs, then "synced"; "offline" once we have
  // given up waiting and are editing against a local-only document.
  const [syncState, setSyncState] = useState("connecting");
  // Bumped to rebuild the collaborative session after an offline fallback.
  const [reconnectNonce, setReconnectNonce] = useState(0);

  /**
   * Replace the whole document in ONE Yjs transaction.
   *
   * This used to go through Monaco's executeEdits over the full model range.
   * That produced a delete and an insert as separate operations against a
   * document that might not have synced yet, so the server's own copy of the
   * template was not covered by the delete and survived the merge - the user
   * pressed Reset and got the template twice. Operating on ytext directly also
   * sidesteps the \r\n vs \n length mismatch that motivated executeEdits, since
   * ytext always holds \n.
   */
  const replaceDocument = useCallback((template) => {
    const ytext = ytextRef.current;
    const ydoc = ydocRef.current;
    if (!ytext || !ydoc) return false;
    if (ytext.toString() === template) return true; // already there; nothing to merge

    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, template);
    });
    return true;
  }, []);

  // Keep value in a ref for localStorage sync (not for seeding - server seeds new rooms)
  const seedValueRef = useRef(value);
  useEffect(() => { seedValueRef.current = value; }, [value]);

  // Track sessionId + language in refs so the mount callback always sees latest values
  const sessionIdRef = useRef(sessionId);
  const languageRef = useRef(language);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { languageRef.current = language; }, [language]);

  // initYjs is a useCallback with no deps ("always reads from refs"), but it
  // closed over `onChange`, which was NOT in a ref. onChange is memoised on
  // activeLangId upstream, so after a language switch the Yjs observer kept
  // calling the *previous* onChange and wrote edits into the previous
  // language's buffer.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const monacoLanguage = useMemo(() => LANGUAGE_TO_MONACO[language] ?? "javascript", [language]);
  // Randomised once via lazy state initialisers rather than in a useMemo body:
  // Math.random() during render is impure, and with the previous deps the
  // collaborator identity could change on re-render.
  const [randomName] = useState(() => RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]);
  const [localColor] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
  const localName = userName || randomName;

  // Store name/color in refs so the mount callback always has them without re-mounting
  const localNameRef = useRef(localName);
  const localColorRef = useRef(localColor);
  useEffect(() => { localNameRef.current = localName; }, [localName]);
  useEffect(() => { localColorRef.current = localColor; }, [localColor]);

  /**
   * Initialize (or re-initialize) the Yjs collaborative session.
   * Called from handleMount (on first load) and from the sessionId/language effect (on change).
   */
  const initYjs = useCallback((editor) => {
    // Tear down any existing session first
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    hasInitializedRef.current = false;

    const currentSessionId = sessionIdRef.current;
    const currentLanguage = languageRef.current;
    const model = editor.getModel();
    if (!model) return;

    // Monaco stores whatever EOL the text it was given used; ytext always holds
    // \n, so every read that crosses that boundary must ask for LF explicitly or
    // offsets drift by one per line on Windows-pasted code.
    const readModel = () => model.getValue(1 /* EndOfLinePreference.LF */);

    // Show something immediately. The local buffer is the template on a first
    // visit and the user's last edit afterwards, so the editor is never blank
    // while the room is being fetched.
    const localSeed = seedValueRef.current ?? "";
    if (readModel() !== localSeed) model.setValue(localSeed);
    setSyncState("connecting");

    // The room name is the full sessionId which already encodes language: "default::cpp"
    const ydoc = new Y.Doc();
    const provider = new SocketIOProvider(ENDPOINTS.WS_ENDPOINT, currentSessionId, ydoc, {
      ...ENDPOINTS.SOCKET_OPTIONS,
      autoConnect: true
    });

    const ytext = ydoc.getText(currentLanguage);
    ydocRef.current = ydoc;
    ytextRef.current = ytext; // keep live ref for external consumers (reset button, etc.)
    providerRef.current = provider;

    provider.awareness.setLocalStateField("user", {
      name: localNameRef.current,
      color: localColorRef.current
    });

    // Observe ytext directly for localStorage sync - fires once per Yjs transaction,
    // regardless of how many Monaco model-change events that transaction generates.
    // This is safer than Monaco's onChange which fires for EVERY model delta (including
    // auto-formatting rewrites) and can cause unnecessary React re-render cycles.
    const onYtextChange = () => {
      if (hasInitializedRef.current) {
        onChangeRef.current?.(ytext.toString());
      }
    };
    ytext.observe(onYtextChange);

    let bound = false;
    let boundMode = null;
    let editedWhileUnbound = false;
    let syncTimer = null;
    let settleTimer = null;
    let retryTimer = null;
    // Set when this client seeds an apparently-empty room, so a straggling
    // server copy of the same text can be recognised and undone.
    let seededText = null;

    // Until the binding exists nothing propagates edits, so keep the parent's
    // buffer (and therefore localStorage) up to date by hand.
    const modelListener = model.onDidChangeContent(() => {
      if (bound) return;
      editedWhileUnbound = true;
      onChangeRef.current?.(readModel());
    });

    /**
     * Attach the Yjs <-> Monaco binding. `mode` is the sync state to report:
     * "synced" when the server answered, "offline" when it did not.
     *
     * Ordering matters. MonacoBinding's constructor overwrites the model with
     * ytext, so an empty room must be seeded from the model FIRST or the user's
     * text disappears.
     */
    const bind = (mode) => {
      if (bound || !ytextRef.current) return;
      bound = true;
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }

      const localText = readModel();
      const roomEmpty = ytext.length === 0;

      if (roomEmpty && localText) {
        seededText = localText;
        ydoc.transact(() => ytext.insert(0, localText));
      } else if (!roomEmpty && editedWhileUnbound && localText && carryOverTextRef.current === null) {
        // The room has content but the user typed while we were waiting. Their
        // keystrokes win over a stale room rather than vanishing on sync.
        carryOverTextRef.current = localText;
      }

      bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), provider.awareness);
      hasInitializedRef.current = true;

      // Work carried across a reconnect, then any reset requested while the
      // document was still incomplete (a delete over a range the server had not
      // delivered yet removes nothing, which is how Reset produced two copies).
      const carried = carryOverTextRef.current;
      carryOverTextRef.current = null;
      if (carried !== null && carried !== ytext.toString()) replaceDocument(carried);

      if (pendingResetRef.current !== null) {
        const template = pendingResetRef.current;
        pendingResetRef.current = null;
        replaceDocument(template);
      }

      onChangeRef.current?.(ytext.toString());
      boundMode = mode;
      setSyncState(mode);
    };

    // y-socket.io flips `synced` the moment the SERVER asks the client for its
    // state vector, which happens before the server's own document has been
    // applied. Binding on that event alone therefore saw an empty ytext and
    // seeded a second copy of the template on top of the server's.
    //
    // The reliable signal is the first remote update: at that point the room's
    // content is really here. "sync" only starts a settle timer, which seeds
    // from the local buffer if nothing ever arrives (a genuinely empty room).
    const onDocUpdate = (_update, origin) => {
      if (origin !== provider) return;
      if (!bound) {
        bind("synced");
        return;
      }
      // A server copy that lost the race with our seed: the room now holds our
      // text exactly twice and nothing else. Narrow enough that it cannot fire
      // on anything a user typed (their edits would break the exact equality),
      // and it only stays armed until the first real edit.
      if (seededText && ytext.toString() === seededText + seededText) {
        const duplicate = seededText;
        seededText = null;
        ydoc.transact(() => ytext.delete(0, duplicate.length));
      }
    };
    ydoc.on("update", onDocUpdate);

    const handleSync = (isSynced) => {
      if (!isSynced || bound || settleTimer) return;
      settleTimer = setTimeout(() => {
        settleTimer = null;
        bind("synced");
      }, SYNC_SETTLE_MS);
    };
    provider.on("sync", handleSync);

    // The server never answered. Rather than leaving the editor read-only-ish
    // and blank, bind to the local document and keep trying in the background.
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (bound) return;
      // Disconnect before seeding: a local seed that is later merged with the
      // server's own copy of the same template shows every line twice.
      try { provider.disconnect(); } catch { /* never connected */ }
      bind("offline");
      retryTimer = setTimeout(retryConnection, OFFLINE_RETRY_MS);
    }, SYNC_TIMEOUT_MS);

    function retryConnection() {
      retryTimer = null;
      if (!editorRef.current || ytextRef.current !== ytext) return;
      // Carry the offline work into the fresh session so a room that comes back
      // with only the template does not overwrite it.
      carryOverTextRef.current = readModel();
      // Re-entering initYjs from inside itself would need a self-reference; bump
      // a nonce instead and let the session effect rebuild everything.
      setReconnectNonce((n) => n + 1);
    }

    const onOnline = () => {
      if (boundMode !== "offline") return;
      if (retryTimer) clearTimeout(retryTimer);
      retryConnection();
    };
    window.addEventListener("online", onOnline);

    // Return cleanup function
    cleanupRef.current = () => {
      window.removeEventListener("online", onOnline);
      if (syncTimer) clearTimeout(syncTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (retryTimer) clearTimeout(retryTimer);
      modelListener.dispose();
      ytext.unobserve(onYtextChange);
      ydoc.off("update", onDocUpdate);
      provider.off("sync", handleSync);
      if (bindingRef.current) {
        try { bindingRef.current.destroy(); } catch { /* already torn down */ }
        bindingRef.current = null;
      }
      try { provider.destroy(); } catch { /* already torn down */ }
      hasInitializedRef.current = false;
      pendingResetRef.current = null;
    };
  }, [replaceDocument]); // otherwise reads only from refs

  // ─── Monaco Mount Handler ────────────────────────────────────────────────────
  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    window.samEditor = editor;

    monaco.editor.defineTheme("monolith-dark", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "", foreground: "FFFFFF", background: "000000" },
        { token: "comment", foreground: "525252", fontStyle: "italic" },
        { token: "keyword", foreground: "FFFFFF", fontStyle: "bold" },
        { token: "string", foreground: "A3A3A3" },
        { token: "number", foreground: "D1D1D1" },
        { token: "type", foreground: "FFFFFF" },
        { token: "operator", foreground: "FFFFFF" },
        { token: "delimiter", foreground: "737373" },
        { token: "function", foreground: "FFFFFF" },
        { token: "identifier", foreground: "FFFFFF" },
      ],
      colors: {
        "editor.background": "#000000",
        "editor.foreground": "#FFFFFF",
        "editorLineNumber.foreground": "#262626",
        "editorLineNumber.activeForeground": "#FFFFFF",
        "editorIndentGuide.background": "#171717",
        "editor.selectionBackground": "#FFFFFF22",
        "editorCursor.foreground": "#FFFFFF",
      }
    });

    monaco.editor.defineTheme("monolith-light", {
      base: "vs", inherit: true,
      rules: [
        { token: "", foreground: "000000", background: "FFFFFF" },
        { token: "comment", foreground: "94A3B8", fontStyle: "italic" },
        { token: "keyword", foreground: "000000", fontStyle: "bold" },
        { token: "string", foreground: "404040" },
        { token: "number", foreground: "525252" },
        { token: "type", foreground: "000000" },
        { token: "operator", foreground: "000000" },
        { token: "function", foreground: "000000" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#000000",
        "editorLineNumber.foreground": "#E2E8F0",
        "editorLineNumber.activeForeground": "#000000",
        "editorIndentGuide.background": "#F1F5F9",
        "editor.selectionBackground": "#00000022",
        "editorCursor.foreground": "#000000",
      }
    });

    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      window.dispatchEvent(new CustomEvent("sam:editor:metrics", {
        detail: { lineNumber: pos.lineNumber, column: pos.column }
      }));
      onCursorChange?.({ lineNumber: pos.lineNumber, column: pos.column });
    });

    // Initialize Yjs immediately after Monaco is ready.
    // This is the correct place - editorRef.current is guaranteed to be set here.
    initYjs(editor);
  }, [onCursorChange, initYjs]);

  // ─── Re-initialize Yjs when session or language changes ─────────────────────
  useEffect(() => {
    // Skip if Monaco hasn't mounted yet - handleMount will call initYjs
    if (!editorRef.current) return;
    initYjs(editorRef.current);
  }, [sessionId, language, reconnectNonce, initYjs]);

  // ─── Component unmount cleanup ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
      // window.samEditor was assigned on mount and never cleared, so after an
      // unmount the rest of the app kept calling into a disposed editor.
      if (window.samEditor === editorRef.current) window.samEditor = null;
      editorRef.current = null;
    };
  }, []);

  // ─── Monaco theme ────────────────────────────────────────────────────────────
  const monacoTheme = useMemo(() => theme === "light" ? "monolith-light" : "vs-dark", [theme]);

  // ─── Error markers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) monacoRef.current.editor.setModelMarkers(model, "owner", markers);
    }
  }, [markers]);

  // ─── Reset event (AI panel + Reset button) ──────────────────────────────────
  useEffect(() => {
    const handleResetEvent = (e) => {
      const template = e.detail?.template ?? "";
      if (!template || !editorRef.current) return;

      if (hasInitializedRef.current) {
        if (!replaceDocument(template)) return;
      } else {
        // Applying this now would race the server's initial state; handleSync
        // performs it as soon as the document is whole.
        pendingResetRef.current = template;
      }

      // This event is dispatched by three different actions (AI refactor,
      // reset-to-boilerplate, load-from-history) and always announced
      // "Applied to editor" - wrong copy for two of them, and a second
      // toast on top of the one the dispatcher already showed. The caller
      // now says what happened; silence here unless it does not.
      if (e.detail?.notify !== false) {
        toast.success(e.detail?.message || "Applied to editor", {
          style: { background: "var(--sam-surface)", color: "var(--sam-text)", border: "1px solid var(--sam-glass-border)", fontSize: "11px", fontWeight: 900 }
        });
      }
    };
    window.addEventListener("sam-editor-reset", handleResetEvent);
    return () => window.removeEventListener("sam-editor-reset", handleResetEvent);
  }, [replaceDocument]);

  // onChange is now driven by ytext.observe inside initYjs - no Monaco onChange needed.

  return (
    <div className="relative h-full w-full bg-transparent">
      {syncState !== "synced" && (
        <div
          className="pointer-events-none absolute right-3 top-2 z-10 flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest"
          style={{
            background: "var(--sam-surface)",
            border: "1px solid var(--sam-glass-border)",
            color: "var(--sam-text-dim, var(--sam-text))",
            opacity: 0.85
          }}
          title={
            syncState === "offline"
              ? "The collaboration server is unreachable. Your code is kept in this browser and will sync when the connection returns."
              : "Connecting to the collaboration server."
          }
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: syncState === "offline" ? "#F59E0B" : "#3B82F6",
              animation: syncState === "offline" ? "none" : "sam-pulse 1.4s ease-in-out infinite"
            }}
          />
          {syncState === "offline" ? "Offline - saved locally" : "Connecting"}
        </div>
      )}
      <Editor
        theme={monacoTheme}
        language={monacoLanguage}
        defaultValue={value ?? ""}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: options.fontSize || 12,
          tabSize: options.tabSize || 2,
          lineNumbers: "on",
          lineNumbersMinChars: 2,
          folding: false,
          glyphMargin: false,
          wordWrap: "on",
          wrappingStrategy: "advanced",
          automaticLayout: true,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          padding: { top: 12, bottom: 12 },
          // formatOnType / formatOnPaste MUST be off in collaborative mode.
          // When Monaco auto-reformats (e.g. re-indenting a block on '}'),
          // it generates large multi-line edits that Yjs propagates to all peers.
          // From peer's perspective this looks like "random code being changed"
          // even though the user only pressed one key.
          formatOnPaste: false,
          formatOnType: false,
          scrollBeyondLastLine: false,
          readOnly: false,
          renderLineHighlight: "none",
          renderIndentGuides: true,
          guides: { indentation: true },
          accessibilitySupport: "off",
          contextmenu: false,
          backgroundColor: "#00000000"
        }}
        loading={<div className="flex h-full items-center justify-center text-blue-500/20 font-black uppercase tracking-widest animate-pulse">Initializing Collaborative Layer</div>}
      />
    </div>
  );
};

export default React.memo(CodeEditor);
