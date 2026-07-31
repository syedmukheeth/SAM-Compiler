const mongoose = require("mongoose");
const { getRunModel } = require("@sam/shared");

// Shared with the API (packages/shared/src/runSchema.js). The worker used to
// declare its own narrower copy of this schema over the same collection, which
// silently dropped stdin, userId and title.
const RunModel = getRunModel(mongoose);

module.exports = { RunModel };
