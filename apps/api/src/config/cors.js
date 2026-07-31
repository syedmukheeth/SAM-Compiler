/**
 * Shared CORS origin policy for both the HTTP app and the Socket.io server.
 *
 * The previous implementation used `origin.includes("localhost")`, which
 * matched attacker-controlled hostnames such as `https://localhost.attacker.com`
 * while `credentials: true` was set. It also treated an empty WEB_ORIGIN as
 * "reflect any origin", which is allow-all-with-credentials.
 *
 * This version matches allow-listed origins exactly, and only treats a request
 * as a local dev origin when the parsed hostname is exactly `localhost`,
 * `127.0.0.1` or `[::1]` - a substring can no longer widen the policy.
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function parseAllowedOrigins(raw) {
  return (raw || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    // URL normalises IPv6 literals to bracketed form in `host`, not `hostname`.
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

/**
 * @param {string|undefined} origin  The request's Origin header.
 * @param {object} [opts]
 * @param {string} [opts.webOrigin]  Comma-separated allow-list. Defaults to env.
 * @param {boolean} [opts.allowLocal] Permit exact localhost origins. Defaults to
 *   true outside production so `vite dev` keeps working on any port.
 */
function isOriginAllowed(origin, opts = {}) {
  // Same-origin/non-browser callers (curl, server-to-server, health probes)
  // send no Origin header at all.
  if (!origin) return true;

  const allowed = parseAllowedOrigins(
    opts.webOrigin !== undefined ? opts.webOrigin : process.env.WEB_ORIGIN
  );
  if (allowed.includes(origin)) return true;

  const allowLocal =
    opts.allowLocal !== undefined
      ? opts.allowLocal
      : process.env.NODE_ENV !== "production";

  return allowLocal && isLocalOrigin(origin);
}

/** Callback shaped for both `cors()` and Socket.io's `cors.origin`. */
function originChecker(origin, callback) {
  if (isOriginAllowed(origin)) return callback(null, true);
  return callback(null, false);
}

module.exports = { isOriginAllowed, originChecker, parseAllowedOrigins, isLocalOrigin };
