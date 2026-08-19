// Shared runtime constants (no TypeScript)
const { createRunSchema, getRunModel, truncateOutput, OUTPUT_LIMIT_BYTES } = require("./runSchema");
const { normalizeJavaSource, maskJava } = require("./javaSource");

const RUNTIMES = {
  NODEJS: "nodejs",
  JAVASCRIPT: "javascript",
  PYTHON: "python",
  CPP: "cpp",
  C: "c",
  JAVA: "java"
};

module.exports = {
  RUNTIMES,
  createRunSchema,
  getRunModel,
  truncateOutput,
  OUTPUT_LIMIT_BYTES,
  normalizeJavaSource,
  maskJava
};
