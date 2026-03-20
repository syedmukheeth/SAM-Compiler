const { logger } = require("../../config/logger");

let io = null;
const inputBuffers = new Map(); // jobId -> string[]

function initSocket(server) {
  const { Server } = require("socket.io");
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust as needed, but for local dev * is fine
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Client connected to socket");

    socket.on("subscribe", ({ jobId }) => {
      logger.info({ socketId: socket.id, jobId }, "Socket subscribed to job");
      socket.join(`run:${jobId}`);
    });

    socket.on("unsubscribe", ({ jobId }) => {
      logger.info({ socketId: socket.id, jobId }, "Socket unsubscribed from job");
      socket.leave(`run:${jobId}`);
    });

    socket.on("exec:input", ({ jobId, input }) => {
      logger.info({ socketId: socket.id, jobId }, "Socket received input for job");
      
      const listenerCount = process.listenerCount(`run:input:${jobId}`);
      if (listenerCount > 0) {
        process.emit(`run:input:${jobId}`, input);
      } else {
        // Buffer the input if no listener is active (e.g., still compiling)
        if (!inputBuffers.has(jobId)) inputBuffers.set(jobId, []);
        inputBuffers.get(jobId).push(input);
        logger.info({ jobId }, "Buffered input (no active listener yet)");
      }
    });

    socket.on("exec:log:end", ({ jobId }) => {
       inputBuffers.delete(jobId);
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
  if (type === "end") inputBuffers.delete(jobId);
  io.to(`run:${jobId}`).emit("exec:log", { type, chunk });
}

function getBufferedInput(jobId) {
  const buffered = inputBuffers.get(jobId) || [];
  inputBuffers.delete(jobId);
  return buffered;
}

module.exports = { initSocket, getIO, emitLog, getBufferedInput };
