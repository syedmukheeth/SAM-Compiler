const axios = require("axios");
const { io } = require("socket.io-client");

const API_URL = "http://localhost:3000"; // Adjust if necessary
const CONCURRENCY = 50;
const TOTAL_RUNS = 200;

async function runJob(index) {
  const startTime = Date.now();
  try {
    const res = await axios.post(`${API_URL}/api/runs`, {
      language: "javascript",
      code: `console.log("Load test job ${index}"); setTimeout(() => {}, 50);`
    });

    const { jobId } = res.data;
    
    return new Promise((resolve) => {
      const socket = io(API_URL);
      socket.emit("subscribe", { jobId });
      
      socket.on("exec:log", (data) => {
        if (data.type === "end") {
          const duration = Date.now() - startTime;
          socket.disconnect();
          resolve({ success: true, duration });
        }
      });

      // Timeout safety
      setTimeout(() => {
        socket.disconnect();
        resolve({ success: false, error: "timeout" });
      }, 15000);
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log(`Starting Load Test: ${TOTAL_RUNS} total runs, ${CONCURRENCY} concurrent`);
  const startsAt = Date.now();
  
  let completed = 0;
  let successCount = 0;
  let totalDuration = 0;
  const active = new Set();
  const queue = Array.from({ length: TOTAL_RUNS }, (_, i) => i);

  async function next() {
    if (queue.length === 0) return;
    const index = queue.shift();
    const promise = runJob(index).then(res => {
      completed++;
      if (res.success) {
        successCount++;
        totalDuration += res.duration;
      }
      active.delete(promise);
      if (completed % 10 === 0) {
        console.log(`Progress: ${completed}/${TOTAL_RUNS} (${((completed/TOTAL_RUNS)*100).toFixed(0)}%)`);
      }
      return next();
    });
    active.add(promise);
    return promise;
  }

  // Start initial batch
  const initialBatch = [];
  for (let i = 0; i < Math.min(CONCURRENCY, TOTAL_RUNS); i++) {
    initialBatch.push(next());
  }

  await Promise.all(initialBatch);
  
  const totalTime = (Date.now() - startsAt) / 1000;
  console.log("\n--- Load Test Results ---");
  console.log(`Total Time: ${totalTime.toFixed(2)}s`);
  console.log(`Successful: ${successCount}/${TOTAL_RUNS}`);
  console.log(`Throughput: ${(successCount / totalTime).toFixed(2)} runs/sec`);
  console.log(`Avg Latency: ${(totalDuration / successCount || 0).toFixed(0)}ms`);
  console.log("-------------------------\n");
}

main();
