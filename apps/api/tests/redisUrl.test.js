import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { redisConnectionFromUrl, getRedisDiagnostics } = require("../src/modules/runs/runs.queue.js");

// A misconfigured REDIS_URL used to be indistinguishable from a missing one:
// both fell back to localhost:6379, so a production process reconnected
// forever against a port nothing listens on and reported only
// `redisConnected: false`.
describe("redisConnectionFromUrl", () => {
  it("parses host, port and credentials", () => {
    const c = redisConnectionFromUrl("redis://default:s3cr3t@10.0.0.5:6380");
    expect(c).toMatchObject({ host: "10.0.0.5", port: 6380, username: "default", password: "s3cr3t" });
    expect(c.tls).toBeUndefined();
  });

  it("url-decodes a password containing reserved characters", () => {
    const c = redisConnectionFromUrl("redis://default:p%40ss%3Aword@10.0.0.5:6379");
    expect(c.password).toBe("p@ss:word");
  });

  it("defaults to port 6379", () => {
    expect(redisConnectionFromUrl("redis://10.0.0.5").port).toBe(6379);
  });

  it("enables TLS for rediss://", () => {
    const c = redisConnectionFromUrl("rediss://default:tok@eu1.upstash.io:6379");
    expect(c.tls).toEqual({ servername: "eu1.upstash.io" });
  });

  it("upgrades a managed host to TLS even when the scheme says otherwise", () => {
    // Copying the non-TLS URL out of a provider dashboard is the common way to
    // get a connection that never establishes.
    const c = redisConnectionFromUrl("redis://default:tok@eu1.upstash.io:6379");
    expect(c.tls).toEqual({ servername: "eu1.upstash.io" });
  });

  it("rejects a non-Redis scheme instead of guessing", () => {
    expect(redisConnectionFromUrl("https://eu1.upstash.io")).toBeNull();
  });

  it("rejects an unparseable value", () => {
    expect(redisConnectionFromUrl("eu1.upstash.io:6379")).toBeNull();
  });

  it("never buffers commands on the standalone read path", () => {
    // enableOfflineQueue is overridden to false where the client is built; the
    // queue connection keeps buffering because BullMQ relies on it.
    expect(redisConnectionFromUrl("redis://10.0.0.5").maxRetriesPerRequest).toBeNull();
  });
});

describe("rejection reasons", () => {
  it("names the offending scheme", () => {
    expect(redisConnectionFromUrl("https://eu1.upstash.io")).toBeNull();
    expect(getRedisDiagnostics().configError).toMatch(/https:/);
  });

  it("explains an unparseable value", () => {
    expect(redisConnectionFromUrl("not a url at all")).toBeNull();
    expect(getRedisDiagnostics().configError).toMatch(/must look like/);
  });

  it("never echoes the password back", () => {
    // A URL pasted without its scheme parses as scheme "default:", so it is
    // rejected on the scheme branch - which must still not leak the secret.
    expect(redisConnectionFromUrl("default:hunter2@eu1.upstash.io:6379")).toBeNull();
    expect(getRedisDiagnostics().configError).not.toContain("hunter2");
  });

  it("clears the reason once a good value parses", () => {
    redisConnectionFromUrl("nope");
    expect(getRedisDiagnostics().configError).toBeTruthy();
    redisConnectionFromUrl("rediss://default:tok@eu1.upstash.io:6379");
    expect(getRedisDiagnostics().configError).toBeNull();
  });
});
