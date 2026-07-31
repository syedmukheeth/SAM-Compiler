import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";

const SECRET = process.env.JWT_SECRET;
const tokenFor = (id) => jwt.sign({ id, email: `${id}@example.com`, role: "user" }, SECRET);

const USER_A = new mongoose.Types.ObjectId().toString();
const USER_B = new mongoose.Types.ObjectId().toString();

let mongod;
let app;
let ownedRunId;
let guestRunId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "sam_test" });
  // createApp() pulls in runs.model.js via require(), which registers the "Run"
  // schema on the shared mongoose instance. Importing that file directly from an
  // ESM test would compile the model a second time (OverwriteModelError), so we
  // read it back off the registry instead.
  app = createApp();
  const RunModel = mongoose.model("Run");

  const owned = await RunModel.create({
    projectId: "playground",
    userId: USER_A,
    runtime: "javascript",
    entrypoint: "solution.js",
    files: [{ path: "solution.js", content: "console.log(1)" }],
    status: "succeeded",
    stdout: "SECRET OUTPUT BELONGING TO USER A",
    stderr: "",
    exitCode: 0
  });
  ownedRunId = owned._id.toString();

  const guest = await RunModel.create({
    projectId: "playground",
    userId: null,
    runtime: "javascript",
    entrypoint: "solution.js",
    files: [{ path: "solution.js", content: "console.log(1)" }],
    status: "succeeded",
    stdout: "guest output",
    stderr: "",
    exitCode: 0
  });
  guestRunId = guest._id.toString();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("GET /api/runs/:runId authorization", () => {
  it("lets the owner read their own run", async () => {
    const res = await request(app)
      .get(`/api/runs/${ownedRunId}`)
      .set("Authorization", `Bearer ${tokenFor(USER_A)}`);
    expect(res.status).toBe(200);
    expect(res.body.stdout).toContain("SECRET OUTPUT");
  });

  // This is the IDOR: previously unauthenticated and unchecked, so anyone who
  // guessed a (partially time-ordered) ObjectId read another user's output.
  it("does not leak an owned run to an unauthenticated caller", async () => {
    const res = await request(app).get(`/api/runs/${ownedRunId}`);
    expect(res.status).toBe(404);
    expect(res.body.stdout).toBeUndefined();
  });

  it("does not leak an owned run to a different authenticated user", async () => {
    const res = await request(app)
      .get(`/api/runs/${ownedRunId}`)
      .set("Authorization", `Bearer ${tokenFor(USER_B)}`);
    expect(res.status).toBe(404);
    expect(res.body.stdout).toBeUndefined();
  });

  it("rejects a malformed run id instead of throwing a CastError", async () => {
    const res = await request(app).get("/api/runs/not-an-object-id");
    expect(res.status).toBe(400);
  });

  it("still allows the anonymous polling flow to read a guest run", async () => {
    const res = await request(app).get(`/api/runs/${guestRunId}`);
    expect(res.status).toBe(200);
    expect(res.body.stdout).toBe("guest output");
  });
});
