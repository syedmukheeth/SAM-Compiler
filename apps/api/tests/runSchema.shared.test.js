import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { getRunModel } from "@sam/shared";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "sam_schema_test" });
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("shared Run schema", () => {
  // The worker's private copy of this schema omitted stdin/userId/title, so
  // strict mode dropped them on read and every worker-path run executed with
  // empty stdin while the fallback path honoured it.
  it("round-trips stdin, userId and title", async () => {
    const RunModel = getRunModel(mongoose);
    const userId = new mongoose.Types.ObjectId();

    const created = await RunModel.create({
      projectId: "playground",
      userId,
      runtime: "python",
      title: "reads a number",
      status: "queued",
      entrypoint: "solution.py",
      files: [{ path: "solution.py", content: "print(input())" }],
      stdin: "42\n"
    });

    const loaded = await RunModel.findById(created._id);
    expect(loaded.stdin).toBe("42\n");
    expect(String(loaded.userId)).toBe(String(userId));
    expect(loaded.title).toBe("reads a number");
  });

  it("is idempotent so both apps can register it", () => {
    const a = getRunModel(mongoose);
    const b = getRunModel(mongoose);
    expect(a).toBe(b);
  });

  it("declares the compound index history queries need", () => {
    const RunModel = getRunModel(mongoose);
    const hasCompound = RunModel.schema
      .indexes()
      .some(([spec]) => spec.userId === 1 && spec.createdAt === -1);
    expect(hasCompound).toBe(true);
  });

  it("caps stored output at the 500KB limit", async () => {
    const RunModel = getRunModel(mongoose);
    const run = await RunModel.create({
      projectId: "playground",
      runtime: "javascript",
      status: "succeeded",
      entrypoint: "solution.js",
      files: [{ path: "solution.js", content: "x" }],
      stdout: "a".repeat(600000)
    });
    expect(run.stdout.length).toBeLessThan(600000);
    expect(run.stdout).toContain("truncated");
  });
});
