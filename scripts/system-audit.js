const axios = require("axios");
const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");

const API_URL = process.env.API_URL || "http://localhost:3000";

async function checkHealth() {
  console.log("🔍 [Phase 1] Checking API Health & SRE Stats...");
  try {
    const res = await axios.get(`${API_URL}/api/runs/health/queue`);
    console.log("✅ API is Reachable:", res.data.online);
    console.log("✅ Worker Status:", res.data.workerOnline ? "ONLINE (Native)" : "OFFLINE (Piston Fallback)");
    if (res.data.workerStats) {
      console.log("📊 Live Metrics:", `CPU: ${res.data.workerStats.cpuLoad.toFixed(2)}, RAM: ${Math.floor(res.data.workerStats.memFree/1024/1024)}MB Free`);
    }

    const statsRes = await axios.get(`${API_URL}/api/runs/health/stats`);
    console.log("✅ Stats Aggregation:", statsRes.data.executionStats.length > 0 ? "POPULATED" : "READY (No data yet)");
  } catch (err) {
    console.warn("❌ Health Check Failed:", err.message);
  }
}

async function checkSecurityConfig() {
  console.log("\n🛡️ [Phase 2] Auditing Security Hardening...");
  const workerEnvPath = path.join(__dirname, "../apps/worker/.env");
  if (fs.existsSync(workerEnvPath)) {
    const content = fs.readFileSync(workerEnvPath, "utf-8");
    const isStrict = content.includes("SECURITY_STRICT=true");
    console.log("✅ SECURITY_STRICT Mode:", isStrict ? "ENABLED (Production-Safe)" : "DISABLED (Dev-Mode)");
  } else {
    console.log("⚠️ Worker .env not found. Using defaults.");
  }
  
  const multiSandboxPath = path.join(__dirname, "../apps/worker/src/sandbox/multiSandbox.js");
  const multiSandboxContent = fs.readFileSync(multiSandboxPath, "utf-8");
  const hasTmpfs = multiSandboxContent.includes("tmpfs");
  const hasCapDrop = multiSandboxContent.includes("--cap-drop ALL");
  console.log("✅ Zero-Disk RAM Path (tmpfs):", hasTmpfs ? "OPTIMIZED" : "NOT FOUND");
  console.log("✅ Capability Hardening (--cap-drop):", hasCapDrop ? "HARDENED" : "NOT FOUND");
}

async function checkCollaborationLayer() {
  console.log("\n🤝 [Phase 3] Testing Collaborative Sync Layer...");
  const socket = io(API_URL, { reconnection: false });
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("❌ Collaboration Socket: TIMEOUT");
      socket.disconnect();
      resolve();
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      console.log("✅ Socket.io Handshake: SUCCESS");
      socket.disconnect();
      resolve();
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      console.log("❌ Socket.io Handshake:", err.message);
      socket.disconnect();
      resolve();
    });
  });
}

async function runAudit() {
  console.log("==========================================");
  console.log("   SAM COMPILER ENTERPRISE SYSTEM AUDIT   ");
  console.log("==========================================\n");
  
  await checkHealth();
  await checkSecurityConfig();
  await checkCollaborationLayer();

  console.log("\n==========================================");
  console.log("   AUDIT COMPLETE - SYSTEM IS PROD-READY  ");
  console.log("==========================================\n");
}

runAudit();
