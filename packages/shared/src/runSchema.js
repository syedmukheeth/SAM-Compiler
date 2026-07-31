/**
 * Single source of truth for the `Run` document.
 *
 * The API and the worker previously each declared their own "Run" model over
 * the same collection, and they had drifted: the worker's copy omitted `stdin`,
 * `userId` and `title`. Under Mongoose strict mode those fields were never
 * hydrated, so `run.stdin || ""` in the worker always produced an empty string
 * and every run routed to the Docker worker executed with no stdin at all,
 * while the Judge0 fallback path honoured it.
 *
 * Both apps now build their model from this factory. `mongoose` is injected so
 * this package does not need its own copy of the driver (which would create a
 * second Mongoose instance and its own model registry).
 */

const OUTPUT_LIMIT_BYTES = 500000; // 500KB cap per stream

function truncateOutput(val) {
  if (typeof val !== "string") return "";
  if (val.length > OUTPUT_LIMIT_BYTES) {
    return val.substring(0, OUTPUT_LIMIT_BYTES) + "\n\n... [Output truncated to 500KB limit]";
  }
  return val;
}

/**
 * @param {import("mongoose")} mongoose The host app's mongoose instance.
 * @returns {import("mongoose").Schema}
 */
function createRunSchema(mongoose) {
  const { Schema } = mongoose;

  const FileSchema = new Schema(
    {
      path: { type: String, required: true },
      content: { type: String, required: true }
    },
    { _id: false }
  );

  const RunSchema = new Schema(
    {
      projectId: { type: String, required: true },
      userId: { type: Schema.Types.ObjectId, ref: "User", required: false },
      runtime: { type: String, required: true },
      title: { type: String, required: false },
      status: { type: String, required: true },
      entrypoint: { type: String, required: true },
      files: { type: [FileSchema], required: true },
      stdout: { type: String, default: "", set: truncateOutput },
      stderr: { type: String, default: "", set: truncateOutput },
      stdin: { type: String, default: "" },
      exitCode: { type: Number, required: false, default: null },
      metrics: { type: Schema.Types.Mixed, default: {} },
      startedAt: { type: Date, required: false, default: null },
      finishedAt: { type: Date, required: false, default: null }
    },
    { timestamps: true }
  );

  // getUserHistory filters by userId and sorts createdAt desc. A single-key
  // userId index forced an in-memory sort on every history request.
  RunSchema.index({ userId: 1, createdAt: -1 });

  return RunSchema;
}

/**
 * Registers (or returns an already-registered) Run model on the given mongoose
 * instance. Idempotent so repeated requires — and test harnesses — cannot throw
 * OverwriteModelError.
 */
function getRunModel(mongoose) {
  if (mongoose.models.Run) return mongoose.models.Run;
  return mongoose.model("Run", createRunSchema(mongoose));
}

module.exports = { createRunSchema, getRunModel, truncateOutput, OUTPUT_LIMIT_BYTES };
