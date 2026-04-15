const { Schema, model } = require("mongoose");

const FileSchema = new Schema(
  {
    path: { type: String, required: true },
    content: { type: String, required: true }
  },
  { _id: false }
);

function truncateOutput(val) {
  if (typeof val !== 'string') return '';
  const limit = 500000; // 500KB cap
  if (val.length > limit) {
    return val.substring(0, limit) + "\n\n... [Output truncated to 500KB limit]";
  }
  return val;
}

const RunSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: false },
    runtime: { type: String, required: true },
    title: { type: String, required: false },
    status: { type: String, required: true, index: true },
    entrypoint: { type: String, required: true },
    files: { type: [FileSchema], required: true },
    stdout: { type: String, default: "", set: truncateOutput },
    stderr: { type: String, default: "", set: truncateOutput },
    exitCode: { type: Number, required: false, default: null },
    metrics: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, required: false, default: null },
    finishedAt: { type: Date, required: false, default: null }
  },
  { timestamps: true }
);

const RunModel = model("Run", RunSchema);

module.exports = { RunModel };

