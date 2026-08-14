const { callbackUrlBase } = require("./env");
const { logger } = require("./logger");

/**
 * The callback base OAuth providers are handed, kept in one place so it can be
 * corrected at runtime.
 *
 * CALLBACK_URL_BASE is normally authoritative - a deployment can sit behind a
 * custom domain the platform knows nothing about. But it is typed by hand, and
 * when it names a host that demonstrably is not this service, obeying it means
 * every sign-in ends on somebody else's 404. The startup probe in server.js can
 * disprove it, and when it does, this switches to the origin the instance
 * actually answers on.
 *
 * The override is deliberately hard to trigger: only a definite HTTP answer
 * from something that is not this application counts. A timeout or a network
 * error leaves the configured value alone, because an unreachable host is far
 * more likely to be a blip than a misconfiguration.
 */
let effectiveBase = callbackUrlBase;
let overridden = false;

function getCallbackBase() {
  return effectiveBase;
}

function callbackURLFor(provider) {
  return `${effectiveBase}/${provider}/callback`;
}

function overrideCallbackBase(base) {
  if (!base || overridden || base === effectiveBase) return false;
  logger.warn(
    { configured: effectiveBase, using: base },
    "Configured OAuth callback host is not this service; using this instance's own origin instead. " +
    "Fix CALLBACK_URL_BASE (or unset it) and make sure the GitHub/Google dashboards list the callback URL being used."
  );
  effectiveBase = base;
  overridden = true;
  return true;
}

module.exports = { getCallbackBase, callbackURLFor, overrideCallbackBase };
