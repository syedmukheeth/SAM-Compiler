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
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: false },
    runtime: { type: String, required: true },
    title: { type: String, required: false },
    status: { type: String, required: true, index: true },
    entrypoint: { type: String, required: true },
    files: { type: [FileSchema], required: true },
    stdout: { type: String, default: "" },
    stderr: { type: String, default: "" },
    exitCode: { type: Number, required: false, default: null },
    metrics: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, required: false, default: null },
    finishedAt: { type: Date, required: false, default: null }
  },
  { timestamps: true }
);

const RunModel = model("Run", RunSchema);

module.exports = { RunModel };

