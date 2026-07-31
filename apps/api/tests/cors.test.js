import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const ORIGINAL_WEB_ORIGIN = process.env.WEB_ORIGIN;

afterEach(() => {
  process.env.WEB_ORIGIN = ORIGINAL_WEB_ORIGIN;
});

describe("CORS origin policy", () => {
  it("allows the configured origin", async () => {
    process.env.WEB_ORIGIN = "http://localhost:5174";
    const res = await request(createApp())
      .get("/api/health")
      .set("Origin", "http://localhost:5174");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
  });

  // The original check was `origin.includes("localhost")`, so any attacker
  // domain containing that substring passed - with credentials: true.
  it("rejects an attacker origin that merely contains 'localhost'", async () => {
    process.env.WEB_ORIGIN = "http://localhost:5174";
    const res = await request(createApp())
      .get("/api/health")
      .set("Origin", "https://localhost.attacker.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects an attacker origin that merely contains '127.0.0.1'", async () => {
    process.env.WEB_ORIGIN = "http://localhost:5174";
    const res = await request(createApp())
      .get("/api/health")
      .set("Origin", "https://127.0.0.1.attacker.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  // A custom header is not CORS-safelisted, so if it is missing from
  // allowedHeaders the browser lets the preflight succeed and then blocks the
  // real request. That is invisible to server-side tests, which skip CORS
  // entirely, and it broke guest result polling in the actual browser.
  it("permits the X-Run-Token header on preflight", async () => {
    process.env.WEB_ORIGIN = "http://localhost:5174";
    const res = await request(createApp())
      .options("/api/runs/aaaaaaaaaaaaaaaaaaaaaaaa")
      .set("Origin", "http://localhost:5174")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "x-run-token");
    expect(res.headers["access-control-allow-headers"]).toMatch(/X-Run-Token/i);
  });

  // Previously an unset WEB_ORIGIN degraded to "reflect any origin" while
  // still sending credentials. It must fail closed instead.
  it("does not reflect arbitrary origins when WEB_ORIGIN is unset", async () => {
    delete process.env.WEB_ORIGIN;
    const res = await request(createApp())
      .get("/api/health")
      .set("Origin", "https://unrelated.attacker.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
