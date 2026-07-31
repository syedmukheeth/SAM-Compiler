const mongoose = require("mongoose");
const { getRunModel } = require("@sam/shared");

// Shared with the worker (packages/shared/src/runSchema.js) so the two cannot
// drift apart over the same collection.
const RunModel = getRunModel(mongoose);

module.exports = { RunModel };
