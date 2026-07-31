import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "sam_auth_test" });
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("auth input validation", () => {
  // {"email":{"$ne":null}} previously reached User.findOne({ email }) as a Mongo
  // operator query, selecting an arbitrary user document.
  it("rejects a Mongo operator object in the login email field", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: { $ne: null }, password: "whatever" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request");
  });

  it("rejects a Mongo operator object in the forgot-password email field", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: { $gt: "" } });
    expect(res.status).toBe(400);
  });

  it("rejects an array smuggled into the login email field", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ["a@b.com"], password: "whatever" });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed email string", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "whatever" });
    expect(res.status).toBe(400);
  });

  // There was no password policy at all: a 1-character password was accepted.
  it("enforces a minimum password length on register", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test", email: "shortpw@example.com", password: "a" });
    expect(res.status).toBe(400);
  });

  it("enforces a minimum password length on reset", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "sometoken", password: "a" });
    expect(res.status).toBe(400);
  });

  it("accepts a well-formed registration and does not return the password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Valid User", email: "valid@example.com", password: "correct horse battery" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain("correct horse battery");
  });

  it("does not leak githubToken from /api/auth/me", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "Me User", email: "me@example.com", password: "correct horse battery" });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("githubToken");
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("resetPasswordToken");
  });
});
