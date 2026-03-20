const { URL } = require("url");
const Redis = require("ioredis");
require("dotenv").config({ path: "./apps/api/.env" });

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

console.log("🔍 LiquidIDE Redis Diagnostic Tool");
console.log("-----------------------------------");
console.log(`URL: ${redisUrl.replace(/:[^:@]+@/, ":****@")}`);

async function diagnostic() {
  try {
    const u = new URL(redisUrl);
    const config = {
      host: u.hostname,
      port: u.port || 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      tls: u.protocol === "rediss:" ? {} : undefined,
      enableOfflineQueue: true,
      connectTimeout: 5000
    };

    console.log("1. Testing Connection (with Offline Queue)...");
    const redis = new Redis(config);
    
    redis.on("error", (err) => {
      console.error("❌ Redis Error:", err.message);
    });

    const start = Date.now();
    try {
      await redis.ping();
      console.log(`✅ Success! Ping received in ${Date.now() - start}ms`);
      
      console.log("2. Testing Write/Read...");
      await redis.set("liquid-diag", "ok", "EX", 10);
      const val = await redis.get("liquid-diag");
      console.log(`✅ Success! Data roundtrip verified: ${val}`);
      
    } catch (err) {
      console.error("❌ Diagnostic Failed:", err.message);
      if (err.message.includes("Stream isn't writeable")) {
        console.log("\n💡 TIPS:");
        console.log("- Check if your Redis URL needs 'rediss://' (with double S) for TLS.");
        console.log("- Verify that your Redis provider (e.g. Upstash) doesn't have an IP allowlist blocking this machine.");
      }
    } finally {
      redis.disconnect();
    }
  } catch (err) {
    console.error("❌ Invalid URL Format:", err.message);
  }
}

diagnostic();
