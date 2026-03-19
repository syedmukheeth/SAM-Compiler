const { Schema, model } = require("mongoose");

const FileSchema = new Schema(
  {
    path: { type: String, required: true },
    content: { type: String, required: true }
  },
  { _id: false }
);

const RunSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    runtime: { type: String, required: true },
    status: { type: String, required: true, index: true },
    entrypoint: { type: String, required: true },
    files: { type: [FileSchema], required: true },
    stdout: { type: String, default: "" },
    stderr: { type: String, default: "" },
    exitCode: { type: Number, required: false, default: null },
    startedAt: { type: Date, required: false, default: null },
    finishedAt: { type: Date, required: false, default: null }
  },
  { timestamps: true }
);

const RunModel = model("Run", RunSchema);

module.exports = { RunModel };

