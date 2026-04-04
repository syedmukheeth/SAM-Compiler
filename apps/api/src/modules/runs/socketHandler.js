const { logger } = require("../../config/logger");
const { YSocketIO } = require("y-socket.io/dist/server");
const Y = require("yjs");
const { ProjectStateModel } = require("../projects/project.model");

let io = null;
let redisSubscriber = null;
const inputBuffers = new Map(); // jobId -> string[]
const activeSubscriptions = new Set(); // jobId

function initSocket(server) {
  const { Server } = require("socket.io");
  io = new Server(server, {
    cors: {
      origin: "*", 
      methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"], // Align with client
    allowEIO3: true
  });

  // Initialize Yjs Sync over Socket.io
  const ysocket = new YSocketIO(io);
  
  // Persistence 
  ysocket.on("document-update", async (doc, update) => {
    try {
      const sessionId = doc.name; // Room name
      const binaryState = Buffer.from(Y.encodeStateAsUpdate(doc));
      await ProjectStateModel.findOneAndUpdate(
        { sessionId },
        { binaryState, lastSaved: new Date() },
        { upsert: true }
      );
    } catch (err) {
      logger.error({ err, doc: doc.name }, "Failed to persist Yjs update to MongoDB");
    }
  });

  // Pre-load state from DB when doc is first created
  ysocket.on("document-loaded", async (doc) => {
    try {
      const sessionId = doc.name;
      const state = await ProjectStateModel.findOne({ sessionId });
      
      if (state && state.binaryState) {
        Y.applyUpdate(doc, state.binaryState);
        logger.info({ sessionId }, "Yjs document loaded from MongoDB");
      } else {
        // DETERMINISTIC BACKEND INITIALIZATION (Root Cause Fix)
        // If room is brand new, populate it with the correct language template
        const langId = sessionId.split('_').pop();
        const templates = {
          cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Welcome to SAM Compiler!" << std::endl;\n    return 0;\n}',
          c: '#include <stdio.h>\n\nint main() {\n    printf("Welcome to SAM Compiler!\\n");\n    return 0;\n}',
          python: 'print("Welcome to SAM Compiler!")',
          nodejs: 'console.log("Welcome to SAM Compiler!");',
          java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome to SAM Compiler!");\n    }\n}'
        };
        
        if (templates[langId]) {
          const ytext = doc.getText("monaco");
          ytext.insert(0, templates[langId]);
          logger.info({ sessionId, langId }, "Yjs document initialized on backend");
        }
      }
    } catch (err) {
      logger.error({ err, doc: doc.name }, "Failed to load/initialize Yjs state from MongoDB");
    }
  });

  ysocket.initialize();

  // Dedicated Redis Subscriber
  const { getRedisClient } = require("./runs.queue");
  const redis = getRedisClient();
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
    logger.info({ socketId: socket.id }, "Client connected to socket");

    socket.on("subscribe", ({ jobId }) => {
      logger.info({ socketId: socket.id, jobId }, "Socket subscribed to job");
      socket.join(`run:${jobId}`);
      
      // Also subscribe to Redis logs if not already active
      if (redisSubscriber && !activeSubscriptions.has(jobId)) {
        redisSubscriber.subscribe(`run:logs:${jobId}`).catch(err => {
          logger.error({ err, jobId }, "Failed to subscribe to Redis logs");
        });
        activeSubscriptions.add(jobId);
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

    socket.on("exec:input", ({ jobId, input }) => {
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
       if (redisSubscriber && activeSubscriptions.has(jobId)) {
         redisSubscriber.unsubscribe(`run:logs:${jobId}`);
         activeSubscriptions.delete(jobId);
       }
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Client disconnected from socket");
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
  if (type === "end") {
    inputBuffers.delete(jobId);
    // Cleanup Redis sub on job completion
    if (redisSubscriber && activeSubscriptions.has(jobId)) {
       redisSubscriber.unsubscribe(`run:logs:${jobId}`);
       activeSubscriptions.delete(jobId);
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
