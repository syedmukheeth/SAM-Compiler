const crypto = require("crypto");
const { env } = require("../../config/env");

/**
 * Capability token for anonymous runs.
 *
 * A guest run has no userId, so there is no identity to check a reader against.
 * That left GET /api/runs/:runId readable by anyone who knew (or guessed) the
 * id: ObjectIds embed a timestamp and a counter, so they are partially
 * predictable and enumerable.
 *
 * The creator of a guest run now receives a token derived from the run id and
 * the server secret, and must present it to read the run back. It is not stored
 * — verification recomputes it — and it grants access to exactly one run.
 */
function signRunToken(runId) {
  return crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(`run:${runId}`)
    .digest("base64url");
}

function verifyRunToken(runId, token) {
  if (typeof token !== "string" || !token) return false;
  const expected = signRunToken(runId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { signRunToken, verifyRunToken };
