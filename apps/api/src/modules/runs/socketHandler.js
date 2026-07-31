const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { env } = require("../../config/env");
const { RunModel } = require("./runs.model");
const { ProjectStateModel } = require("./project.model");
const { createAdapter } = require("@socket.io/redis-adapter");
const { logger } = require("../../config/logger");
const { originChecker } = require("../../config/cors");
const { getRedisClient } = require("./runs.queue");
const { signRunToken } = require("./runToken");
const Y = require("yjs");
const { YSocketIO } = require("y-socket.io/dist/server");
// createRun is required inside the handler to avoid circular dependency issues


let io = null;
let redisSubscriber = null;
const logBuffers = new Map(); // jobId -> { type, chunk }[]
const activeSubscriptions = new Set(); // jobId
const jobTimestamps = new Map(); // jobId -> timestamp

/**
 * Guest runs have no userId, so ownership cannot be derived from the document.
 * Without this, every guard that tested `job.userId && ...` short-circuited and
 * any client could attach to, feed stdin to, or tear down any anonymous run.
 * First socket to claim a guest job owns it for the life of that connection.
 */
const guestJobOwners = new Map(); // jobId -> socket.id
const execStartCounts = new Map(); // socket.id -> { count, windowStart }

const EXEC_START_LIMIT = 20;         // executions per socket per window
const EXEC_START_WINDOW_MS = 60000;

const isValidJobId = (jobId) => typeof jobId === "string" && /^[a-f0-9]{24}$/i.test(jobId);

/**
 * Starter code per language, keyed by the id used in the Yjs room name.
 *
 * This was previously two separate object literals a few lines apart, and they
 * disagreed: one used the key `javascript`, the other `nodejs`. A JavaScript
 * room therefore got seeded on one code path and silently left empty on the
 * other. Both aliases are now present in one place.
 */
const TEMPLATES = {
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Welcome to SAM Compiler!" << std::endl;\n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    printf("Welcome to SAM Compiler!\\n");\n    return 0;\n}\n',
  python: 'print("Welcome to SAM Compiler!")\n',
  javascript: 'console.log("Welcome to SAM Compiler!");\n',
  nodejs: 'console.log("Welcome to SAM Compiler!");\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome to SAM Compiler!");\n    }\n}\n'
};

// Mirrors CreateRunSchema on the HTTP route so both entry points agree.
const ExecStartSchema = z.object({
  language: z.enum(["nodejs", "javascript", "python", "cpp", "c", "java"]),
  code: z.string().min(1).max(1_000_000),
  stdin: z.string().max(100_000).default("")
});

function releaseJobOwner(jobId, socketId) {
  if (!socketId || guestJobOwners.get(jobId) === socketId) guestJobOwners.delete(jobId);
}

/**
 * @param {object} socket
 * @param {string} jobId
 * @param {{userId?: unknown}} job  Lean run document.
 */
function canAccessJob(socket, jobId, job) {
  const ownerId = job.userId ? job.userId.toString() : null;

  if (ownerId) {
    // Owned run: only the owner (or an admin) may attach.
    return ownerId === socket.user.id || socket.user.role === "admin";
  }

  // Guest run: claim it, or verify an existing claim belongs to this socket.
  const claimedBy = guestJobOwners.get(jobId);
  if (!claimedBy) {
    guestJobOwners.set(jobId, socket.id);
    return true;
  }
  return claimedBy === socket.id;
}

/** Per-socket execution throttle — exec:start had no rate limiting at all. */
function allowExecStart(socketId) {
  const now = Date.now();
  const entry = execStartCounts.get(socketId);
  if (!entry || now - entry.windowStart > EXEC_START_WINDOW_MS) {
    execStartCounts.set(socketId, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= EXEC_START_LIMIT;
}

// Prevent memory leaks for orphaned execution buffers
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes TTL
  for (const [jobId, timestamp] of jobTimestamps.entries()) {
    if (timestamp < cutoff) {
      logBuffers.delete(jobId);
      jobTimestamps.delete(jobId);
      if (redisSubscriber && activeSubscriptions.has(jobId)) {
        redisSubscriber.unsubscribe(`run:logs:${jobId}`).catch(() => {});
        activeSubscriptions.delete(jobId);
      }
      logger.info({ jobId }, "Cleaned up orphaned socket resources via TTL");
    }
  }
}, 60000); // Clean every 1 min

function initSocket(server) {
  const { Server } = require("socket.io");
  io = new Server(server, {
    transports: ["websocket"], // Prioritize websocket to avoid polling latency
    compression: true,        // Enable gzip/deflate for payloads
    // Same exact-match policy as the HTTP app (config/cors.js). This used to
    // be a second, independently-maintained copy of the substring check.
    cors: {
      origin: originChecker,
      credentials: true
    },
    pingTimeout: 20000, // Detect disconnects faster (from 120s to 20s)
    pingInterval: 10000 // Send heartbeat more frequently (from 30s to 10s)
  });
  
  // 🚀 HORIZONTAL SCALING: Sync events across multiple API instances via Redis
  const redis = getRedisClient();
  // 🛡️ NITRO: Only enable adapter if explicitly requested or if scaling is needed.
  // This saves ~60% of Redis request quota on single-instance deployments like Render.
  const enableAdapter = env.ENABLE_REDIS_ADAPTER === "true";
  
  if (redis && enableAdapter) {
    try {
      const pubClient = redis.duplicate();
      const subClient = redis.duplicate();
      
      // 🔥 CRITICAL: Prevent process crash on Redis errors (e.g. Rate Limits)
      pubClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis PubClient Error"));
      subClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis SubClient Error"));
      
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("Socket.IO Redis adapter initialized for horizontal scaling");
    } catch (err) {
      logger.error({ err }, "Failed to initialize Socket.IO Redis adapter. Falling back to memory adapter.");
    }
  } else {
    logger.info("Socket.IO using Memory adapter (Single-Node mode)");
  }

  // 🛡️ SECURITY: JWT Authentication with Guest Support
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      // Allow Guest connections
      socket.user = { id: "guest", role: "guest", isGuest: true };
      return next();
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.user = decoded; // { id, email, role }
      next();
    } catch (err) {
      // Previously this silently downgraded to a guest session, making a
      // forged or expired token indistinguishable from an anonymous visitor.
      // A client that presents a token is asserting an identity; if it does
      // not verify, reject rather than quietly de-privileging.
      logger.warn({ err: err.message, socketId: socket.id }, "Socket authentication failed");
      next(new Error("Invalid or expired token"));
    }
  });

  // Initialize Yjs Sync over Socket.io
  const ysocket = new YSocketIO(io);
  
  // Persistence — Optimized with a 2-second debounce to prevent DB spam
  const persistenceTimers = new Map();

  ysocket.on("document-update", (doc) => {
    const sessionId = doc.name;
    
    // Clear existing timer for this session
    if (persistenceTimers.has(sessionId)) {
      clearTimeout(persistenceTimers.get(sessionId));
    }

    // Schedule new save after 2 seconds of inactivity
    const timer = setTimeout(async () => {
      try {
        const binaryState = Buffer.from(Y.encodeStateAsUpdate(doc));
        
        // 🛡️ SECURITY Audit Fix: Preventive check - Guard against MongoDB 16MB BSON limit
        const MAX_YJS_SIZE = 10 * 1024 * 1024; // 10MB Safety Ceiling
        if (binaryState.length > MAX_YJS_SIZE) {
          logger.error({ sessionId, size: binaryState.length }, "Yjs document exceeds 10MB limit. Persistence rejected to protect MongoDB.");
          persistenceTimers.delete(sessionId);
          return;
        }

        await ProjectStateModel.findOneAndUpdate(
          { sessionId },
          { binaryState, lastSaved: new Date() },
          { upsert: true }
        );
        persistenceTimers.delete(sessionId);
      } catch (err) {
        logger.error({ err, sessionId }, "Failed to persist debounced Yjs update to MongoDB");
      }
    }, 2000);

    persistenceTimers.set(sessionId, timer);
  });

  // Pre-load state from DB when doc is first created
  ysocket.on("document-loaded", async (doc) => {
    try {
      const sessionId = doc.name;
      const state = await ProjectStateModel.findOne({ sessionId });
      
      if (state && state.binaryState) {
        Y.applyUpdate(doc, state.binaryState);
        logger.debug({ sessionId }, "Yjs document loaded from MongoDB");

        const langId = sessionId.split('::').pop();
        const ytext = doc.getText(langId);

        // The "server-side healer" that used to live here has been removed. It
        // deleted the user's entire document and replaced it with the boilerplate
        // when either:
        //   - the phrase "Welcome to SAM Compiler!" appeared more than once, or
        //   - the text contained both "Wel" and "syed" anywhere.
        // Both are things a user can legitimately type — printing that string
        // twice in a loop, or writing "Well, syed..." in a comment — and the
        // result was silent, unrecoverable loss of their work. These were
        // heuristics for CRDT duplication that was already fixed at its source
        // by moving room seeding server-side.
        //
        // The one safe case is kept: a room that exists but whose node for this
        // language is genuinely empty gets its template.
        if (ytext.length === 0 && TEMPLATES[langId]) {
          ytext.insert(0, TEMPLATES[langId]);
          logger.debug({ sessionId, langId }, "Seeded empty language node in existing room");
        }
      } else {
        // NEW ROOM: No persisted state found in MongoDB.
        // The SERVER seeds the room exactly once — it has ground truth on whether this
        // room is brand new. Client-side seeding caused a race condition: the client's
        // 150ms debounce elapsed before the server state arrived on Render's free tier
        // (~200-500ms latency), so BOTH the server state and the client seed arrived,
        // causing duplicate template insertion (Code Soup on reload).
        const langId = sessionId.split('::').pop();
        if (TEMPLATES[langId]) {
          const ytext = doc.getText(langId);
          if (ytext.length === 0) {
            ytext.insert(0, TEMPLATES[langId]);
            logger.debug({ sessionId, langId }, "Server seeded new Yjs room with default template.");
          }
        } else {
          logger.debug({ sessionId, langId }, "New Yjs room created (no template for langId).");
        }
      }
    } catch (err) {
      logger.error({ err, doc: doc.name }, "Failed to load/initialize Yjs state from MongoDB");
    }
  });

  ysocket.initialize();
  
  // Dedicated Redis Subscriber for execution logs
  if (redis) {
    try {
      redisSubscriber = redis.duplicate();
      // 🔥 CRITICAL: Prevent process crash if subscriber fails (e.g. Rate Limit)
      redisSubscriber.on("error", (err) => logger.error({ err }, "Redis Subscriber Error"));
      
      redisSubscriber.on("message", (channel, message) => {
        try {
          const jobId = channel.replace("run:logs:", "");
          const data = JSON.parse(message);
          logger.trace({ jobId, type: data.type }, "Log chunk received");
          emitLog(jobId, data.type, data.chunk);
        } catch (err) {
          logger.error({ err, channel }, "Failed to process Redis log message");
        }
      });
    } catch (err) {
      logger.error({ err }, "Failed to initialize Redis Subscriber");
    }
  }

  io.on("connection", (socket) => {
    logger.debug({ socketId: socket.id, userId: socket.user.id }, "Client connected to socket");
    const userId = socket.user.id;

    socket.on("disconnect", () => {
      for (const [jobId, ownerSocketId] of guestJobOwners.entries()) {
        if (ownerSocketId === socket.id) guestJobOwners.delete(jobId);
      }
      execStartCounts.delete(socket.id);
    });

    socket.on("subscribe", async ({ jobId }) => {
      try {
        if (!isValidJobId(jobId)) {
          return socket.emit("error", { message: "Invalid job id" });
        }

        // 🛡️ SECURITY Audit Fix: Preventive DoS check - Limit concurrent subscriptions per socket
        const activeRooms = Array.from(socket.rooms).filter(r => r.startsWith("run:"));
        if (activeRooms.length >= 10) {
          logger.warn({ socketId: socket.id, count: activeRooms.length }, "Subscription cap reached for socket");
          return socket.emit("error", { message: "Subscription limit reached (Max 10). Please close some runs." });
        }

        // 🔒 SECURITY Audit Fix: Validate job ownership before joining room
        const job = await RunModel.findById(jobId).select("userId").lean();
        if (!job) {
          return socket.emit("error", { message: "Job not found" });
        }

        if (!canAccessJob(socket, jobId, job)) {
          logger.warn({ userId, jobId, socketId: socket.id }, "Unauthorized subscription attempt blocked");
          return socket.emit("error", { message: "Unauthorized: You do not own this job" });
        }

        logger.debug({ socketId: socket.id, jobId }, "Socket subscribed to job");
        socket.join(`run:${jobId}`);
        
        // Also subscribe to Redis logs if not already active
        if (redisSubscriber && !activeSubscriptions.has(jobId)) {
          redisSubscriber.subscribe(`run:logs:${jobId}`).catch(err => {
            logger.error({ err, jobId }, "Failed to subscribe to Redis logs");
          });
          activeSubscriptions.add(jobId);
        }

        // Replay buffered logs to the newly joined client
        if (logBuffers.has(jobId)) {
          const bufferedLines = logBuffers.get(jobId);
          bufferedLines.forEach(log => {
            socket.emit("exec:log", log);
          });
        }
      } catch (err) {
        logger.error({ err, jobId }, "Error during job subscription validation");
        socket.emit("error", { message: "Internal server error during subscription" });
      }
    });

    socket.on("unsubscribe", ({ jobId }) => {
      if (!isValidJobId(jobId)) return;
      logger.debug({ socketId: socket.id, jobId }, "Socket unsubscribed from job");
      socket.leave(`run:${jobId}`);
      releaseJobOwner(jobId, socket.id);

      // Cleanup Redis subscription if no more socket clients are in the room
      const room = io.sockets.adapter.rooms.get(`run:${jobId}`);
      if (!room || room.size === 0) {
        if (redisSubscriber && activeSubscriptions.has(jobId)) {
          redisSubscriber.unsubscribe(`run:logs:${jobId}`)
            .catch(err => logger.error({ err, jobId }, "Failed to unsubscribe Redis logs"));
          activeSubscriptions.delete(jobId);
        }
      }
    });

    socket.on("exec:input", async ({ jobId, input }) => {
      try {
        if (!isValidJobId(jobId) || typeof input !== "string") {
          return logger.warn({ jobId }, "Malformed exec:input rejected");
        }
        // The old guard was `job.userId && job.userId.toString() !== userId`,
        // which short-circuits for every guest-owned run (userId == null) —
        // so any connected client could inject stdin into any guest run.
        // Requiring room membership means the caller must have passed the
        // subscribe check first.
        if (!socket.rooms.has(`run:${jobId}`)) {
          return logger.warn({ userId, jobId, socketId: socket.id }, "Unauthorized input attempt blocked");
        }

        // findById can throw a CastError on a malformed id inside an async
        // handler — previously uncaught, taking the process down.
        const job = await RunModel.findById(jobId).select("userId").lean();
        if (!job || !canAccessJob(socket, jobId, job)) {
          return logger.warn({ userId, jobId }, "Unauthorized input attempt blocked");
        }

        // Neither execution backend accepts input mid-run: the Judge0 cloud
        // path is batch-only, and the Docker worker is handed run.stdin once at
        // container start. The previous implementation dispatched to
        // `process.emit("run:input:<id>")` — an event nothing in the codebase
        // ever subscribed to — and otherwise appended to inputBuffers, which
        // was only read by getBufferedInput(), which nothing ever imported.
        // Keystrokes were collected and then dropped.
        //
        // The client is told so explicitly rather than left waiting.
        socket.emit("exec:input:unsupported", {
          jobId,
          message: "This run does not accept input while it is running. Provide input in the STDIN panel before running."
        });
      } catch (err) {
        logger.error({ err, jobId }, "exec:input handler failed");
      }
    });

    socket.on("exec:log:end", ({ jobId }) => {
      // This handler previously had NO authorization check at all: any client
      // could send an arbitrary jobId and wipe another run's buffers and tear
      // down its Redis log subscription mid-run.
      if (!isValidJobId(jobId) || !socket.rooms.has(`run:${jobId}`)) {
        return logger.warn({ userId, jobId, socketId: socket.id }, "Unauthorized exec:log:end blocked");
      }
      logBuffers.delete(jobId);
      jobTimestamps.delete(jobId);
      releaseJobOwner(jobId);
      if (redisSubscriber && activeSubscriptions.has(jobId)) {
        redisSubscriber.unsubscribe(`run:logs:${jobId}`)
          .catch(err => logger.error({ err, jobId }, "Failed to unsubscribe Redis logs"));
        activeSubscriptions.delete(jobId);
      }
    });

    socket.on("exec:start", async (data, callback) => {
      try {
        const { createRun } = require("./runs.service");
        const { language, code, stdin } = data || {};

        // The HTTP path validates with zod (CreateRunSchema); this one accepted
        // anything, and multiSandbox defaults an unknown language to JavaScript.
        const parsed = ExecStartSchema.safeParse({ language, code, stdin: stdin || "" });
        if (!parsed.success) {
          if (callback) callback({ error: "Invalid execution request" });
          return;
        }

        // exec:start was a full unauthenticated execution pipeline with no rate
        // limiting of any kind — neither runLimiter nor userRateLimiter apply to
        // websocket events.
        if (!allowExecStart(socket.id)) {
          logger.warn({ socketId: socket.id }, "exec:start rate limit exceeded");
          if (callback) callback({ error: "Too many executions. Please wait a moment." });
          return;
        }

        const userId = (socket.user && socket.user.id !== "guest") ? socket.user.id : null;

        const runtime = (language === "javascript" || language === "nodejs") ? "javascript" : language;
        const filename = language === "java" ? "Solution.java" : language === "python" ? "solution.py" : language === "cpp" ? "solution.cpp" : language === "c" ? "solution.c" : "solution.js";

        // 🔥 NITRO: Direct execution pipeline invocation
        const run = await createRun({
          projectId: "playground",
          userId,
          runtime,
          stdin: stdin || "",
          entrypoint: filename,
          files: [{
            path: filename,
            content: code
          }]
        });

        const jobId = run._id.toString();

        // The creating socket owns this run for authorization purposes.
        if (!userId) guestJobOwners.set(jobId, socket.id);

        // 🚀 NITRO: Auto-subscribe to save 1 RTT.
        // No need for client to send a separate 'subscribe' event.
        socket.join(`run:${jobId}`);
        if (redisSubscriber) {
          redisSubscriber.subscribe(`run:logs:${jobId}`).catch(err => {
            logger.error({ err, jobId }, "Failed to auto-subscribe to Redis logs");
          });
          activeSubscriptions.add(jobId);
        }

        // Guest runs get the same capability token the HTTP route issues, so
        // the polling fallback can still read the result back.
        if (callback) {
          callback({
            jobId,
            status: run.status,
            ...(userId ? {} : { runToken: signRunToken(jobId) })
          });
        }
        logger.debug({ socketId: socket.id, jobId, runtime }, "Direct execution started");
      } catch (err) {
        logger.error({ err }, "Direct socket execution failed");
        if (callback) callback({ error: err.message });
      }
    });

    socket.on("sam:ping", () => {
       // Silent heartbeat to keep proxies alive
    });

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, reason }, "Client disconnected from socket");
    });
  });

  return io;
}

function getIO() {
  return io;
}

/**
 * Emit a log to all subscribers of a job
 */
function emitLog(jobId, type, chunk) {
  if (!io) return;
  
  jobTimestamps.set(jobId, Date.now());
  
  if (type === "end") {
    setTimeout(() => {
      logBuffers.delete(jobId);
      jobTimestamps.delete(jobId);
    }, 10000); // Keep logs for 10s after completion
    // Cleanup Redis sub on job completion
    if (redisSubscriber && activeSubscriptions.has(jobId)) {
       redisSubscriber.unsubscribe(`run:logs:${jobId}`);
       activeSubscriptions.delete(jobId);
    }
  } else {
    // Senior Dev Buffer: Ensure logs aren't lost during the client connection handshake
    if (!logBuffers.has(jobId)) logBuffers.set(jobId, []);
    const buffer = logBuffers.get(jobId);
    if (buffer.length < 500) { // Limit buffer size to 500 lines
      buffer.push({ type, chunk });
    }
  }

  logger.trace({ jobId, type }, "Emitting log chunk");
  io.to(`run:${jobId}`).emit("exec:log", { type, chunk });
}

// getBufferedInput() removed along with inputBuffers: it was exported but never
// imported, and the buffer it drained was never consumed by either executor.

module.exports = { initSocket, getIO, emitLog };
