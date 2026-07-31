import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { generateResetToken } from "../src/modules/auth/auth.service.js";

let mongod;
let app;

const EMAIL = "reset-me@example.com";
const OLD_PASSWORD = "old password here";
const NEW_PASSWORD = "brand new password";

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "sam_reset_test" });
  app = createApp();
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Reset User", email: EMAIL, password: OLD_PASSWORD });
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("password reset", () => {
  it("does not reveal whether an address has an account", async () => {
    const known = await request(app).post("/api/auth/forgot-password").send({ email: EMAIL });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it("rejects an invalid reset token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", password: NEW_PASSWORD });
    expect(res.status).toBe(400);
  });

  it("resets the password and invalidates tokens issued beforehand", async () => {
    // A live session from before the reset.
    const before = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: OLD_PASSWORD });
    expect(before.status).toBe(200);
    const oldToken = before.body.token;

    const meBefore = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldToken}`);
    expect(meBefore.status).toBe(200);

    const rawToken = await generateResetToken(EMAIL);
    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // The pre-reset JWT must no longer work - this is the whole point of a
    // reset, and it previously kept working for the full 7-day expiry.
    const meAfter = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldToken}`);
    expect(meAfter.status).toBe(401);

    // Old password rejected, new one accepted.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: OLD_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
  });

  it("cannot reuse a reset token once spent", async () => {
    const rawToken = await generateResetToken(EMAIL);
    const first = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "another new password" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "yet another password" });
    expect(second.status).toBe(400);
  });
});
