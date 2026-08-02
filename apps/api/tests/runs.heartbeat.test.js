import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readWorkerHeartbeat } = require("../src/modules/runs/runs.service.js");

// Regression cover for the production hang. The Redis client is configured with
// `maxRetriesPerRequest: null` plus an offline queue (runs.queue.js), so a GET
// issued while the connection is down is buffered and its promise never
// settles. createRun awaited exactly that with no timeout, so on a deployment
// whose Redis was unreachable - which is what production looked like - the
// background run task never continued: the run stayed "running" with empty
// output and no "end" event was ever emitted to the client.
describe("readWorkerHeartbeat", () => {
  it("does not issue a command while the socket is not ready", async () => {
    const get = vi.fn(() => new Promise(() => {}));
    const start = Date.now();

    await expect(readWorkerHeartbeat({ status: "connecting", get })).resolves.toBeNull();

    expect(get).not.toHaveBeenCalled();
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("gives up on a command that never settles instead of hanging forever", async () => {
    const get = vi.fn(() => new Promise(() => {}));
    const start = Date.now();

    await expect(readWorkerHeartbeat({ status: "ready", get })).resolves.toBeNull();

    expect(get).toHaveBeenCalledTimes(1);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(1500);
    expect(elapsed).toBeLessThan(6000);
  });

  it("swallows a rejected read rather than failing the run", async () => {
    const get = vi.fn(() => Promise.reject(new Error("READONLY")));
    await expect(readWorkerHeartbeat({ status: "ready", get })).resolves.toBeNull();
  });

  it("returns the raw heartbeat when Redis answers", async () => {
    const payload = JSON.stringify({ hasDocker: true });
    const get = vi.fn(() => Promise.resolve(payload));

    await expect(readWorkerHeartbeat({ status: "ready", get })).resolves.toBe(payload);
  });

  it("treats a missing client as no worker", async () => {
    await expect(readWorkerHeartbeat(null)).resolves.toBeNull();
  });
});
