const jwt = require("jsonwebtoken");
const { env } = require("../../config/env");
const { RunModel } = require("./runs.model");
const { ProjectStateModel } = require("./project.model");

let io = null;
let redisSubscriber = null;
const inputBuffers = new Map(); // jobId -> string[]
const logBuffers = new Map(); // jobId -> { type, chunk }[]
const activeSubscriptions = new Set(); // jobId
const jobTimestamps = new Map(); // jobId -> timestamp

// Prevent memory leaks for orphaned execution buffers
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes TTL
  for (const [jobId, timestamp] of jobTimestamps.entries()) {
    if (timestamp < cutoff) {
      logBuffers.delete(jobId);
      inputBuffers.delete(jobId);
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
    cors: {
      origin: function (origin, callback) {
        const allowedPatterns = [/vercel\.app$/, /localhost:\d+/];
        if (!origin || allowedPatterns.some(pattern => pattern.test(origin))) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 120000, // Surrounding mobile latency
    pingInterval: 30000,
    transports: ["websocket", "polling"]
  });
  
  // 🚀 HORIZONTAL SCALING: Sync events across multiple API instances via Redis
  const redis = getRedisClient();
  if (redis) {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.IO Redis adapter initialized for horizontal scaling");
  }

  // 🛡️ SECURITY: Mandatory JWT Authentication for WebSocket connections
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.user = decoded; // { id, email, role }
      next();
    } catch (err) {
      logger.warn({ err: err.message, socketId: socket.id }, "Socket authentication failed");
      next(new Error("Authentication error: Invalid or expired token"));
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
        logger.info({ sessionId }, "Yjs document loaded from MongoDB");
        
        // SERVER-SIDE HEALER: Detects and cures 'Code Soup'
        const langId = sessionId.split('::').pop(); // Updated to high-fidelity separator
        const templates = {
          cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Welcome to SAM Compiler!" << std::endl;\n    return 0;\n}\n',
          c: '#include <stdio.h>\n\nint main() {\n    printf("Welcome to SAM Compiler!\\n");\n    return 0;\n}\n',
          python: 'print("Welcome to SAM Compiler!")\n',
          javascript: 'console.log("Welcome to SAM Compiler!");\n',
          java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome to SAM Compiler!");\n    }\n}\n'
        };

        const ytext = doc.getText(langId); // Strict isolated node targeting
        const text = ytext.toString();
        const identifier = "Welcome to SAM Compiler!";
        const occurrences = (text.match(new RegExp(identifier, "g")) || []).length;
        
        // If we find repeating templates in the DB, nuke them and restore balance.
        if (occurrences > 1 && templates[langId]) {
          ytext.delete(0, ytext.length);
          ytext.insert(0, templates[langId]);
          logger.info({ sessionId, occurrences }, "Server-side healer fixed corrupted room in MongoDB");
        } else if (ytext.length === 0 && templates[langId]) {
          // If the room existed but the specific language node was empty (e.g. migration)
          ytext.insert(0, templates[langId]);
          logger.info({ sessionId, langId }, "Server-side healer populated empty legacy room");
        }
      } else {
        // DEFINITIVE INITIALIZATION (The One True Source)
        const langId = sessionId.split('-').pop(); // Updated to dash separator
        const templates = {
          cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Welcome to SAM Compiler!" << std::endl;\n    return 0;\n}\n',
          c: '#include <stdio.h>\n\nint main() {\n    printf("Welcome to SAM Compiler!\\n");\n    return 0;\n}\n',
          python: 'print("Welcome to SAM Compiler!")\n',
          javascript: 'console.log("Welcome to SAM Compiler!");\n',
          java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome to SAM Compiler!");\n    }\n}\n'
        };
        
        const template = templates[langId];
        if (template) {
          const ytext = doc.getText(langId); // Initialize the strict node
          if (ytext.length === 0) {
            ytext.insert(0, template);
            logger.info({ sessionId, langId }, "Yjs room perfectly initialized by backend");
          }
        }
      }
    } catch (err) {
      logger.error({ err, doc: doc.name }, "Failed to load/initialize Yjs state from MongoDB");
    }
  });

  ysocket.initialize();
  
  // Dedicated Redis Subscriber for execution logs
  if (redis) {
    redisSubscriber = redis.duplicate();
    redisSubscriber.on("message", (channel, message) => {
      try {
        const jobId = channel.replace("run:logs:", "");
        const data = JSON.parse(message);
        emitLog(jobId, data.type, data.chunk);
      } catch (err) {
        logger.error({ err, channel }, "Failed to process Redis log message");
      }
    });
    redisSubscriber.on("error", (err) => logger.error({ err }, "Redis Subscriber Error"));
  }

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id, userId: socket.user.id }, "Client authenticated and connected to socket");
    const userId = socket.user.id;

    socket.on("subscribe", async ({ jobId }) => {
      try {
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

        const ownerId = job.userId ? job.userId.toString() : null;
        if (ownerId !== userId) {
          logger.warn({ userId, ownerId, jobId }, "Unauthorized subscription attempt blocked");
          return socket.emit("error", { message: "Unauthorized: You do not own this job" });
        }

        logger.info({ socketId: socket.id, jobId }, "Socket authorized and subscribed to job");
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
      logger.info({ socketId: socket.id, jobId }, "Socket unsubscribed from job");
      socket.leave(`run:${jobId}`);
      
      // Cleanup Redis subscription if no more socket clients are in the room
      const room = io.sockets.adapter.rooms.get(`run:${jobId}`);
      if (!room || room.size === 0) {
        if (redisSubscriber && activeSubscriptions.has(jobId)) {
          redisSubscriber.unsubscribe(`run:logs:${jobId}`);
          activeSubscriptions.delete(jobId);
        }
      }
    });

    socket.on("exec:input", async ({ jobId, input }) => {
      // 🔒 SECURITY Audit Fix: Validate job ownership before accepting input
      const job = await RunModel.findById(jobId).select("userId").lean();
      if (!job || (job.userId && job.userId.toString() !== userId)) {
        return logger.warn({ userId, jobId }, "Unauthorized input attempt blocked");
      }

      logger.info({ socketId: socket.id, jobId }, "Socket received input for job");
      
      const listenerCount = process.listenerCount(`run:input:${jobId}`);
      if (listenerCount > 0) {
        process.emit(`run:input:${jobId}`, input);
      } else {
        if (!inputBuffers.has(jobId)) inputBuffers.set(jobId, []);
        inputBuffers.get(jobId).push(input);
        logger.info({ jobId }, "Buffered input (no active listener yet)");
      }
    });

    socket.on("exec:log:end", ({ jobId }) => {
       inputBuffers.delete(jobId);
       logBuffers.delete(jobId);
       jobTimestamps.delete(jobId);
       if (redisSubscriber && activeSubscriptions.has(jobId)) {
         redisSubscriber.unsubscribe(`run:logs:${jobId}`);
         activeSubscriptions.delete(jobId);
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
    inputBuffers.delete(jobId);
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

  io.to(`run:${jobId}`).emit("exec:log", { type, chunk });
}

function getBufferedInput(jobId) {
  const buffered = inputBuffers.get(jobId) || [];
  inputBuffers.delete(jobId);
  return buffered;
}

module.exports = { initSocket, getIO, emitLog, getBufferedInput };
