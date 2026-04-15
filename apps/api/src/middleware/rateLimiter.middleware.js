const { getRedisClient } = require("../modules/runs/runs.queue");
const { logger } = require("../config/logger");

/**
 * Redis-backed per-user rate limiter.
 * Limits authenticated users to 15 code executions per minute.
 * Guests fall through to the IP-based limiter.
 */
async function userRateLimiter(req, res, next) {
  const userId = req.user?._id || req.user?.id;
  
  if (!userId) {
    // No user found, fall back to IP-based limiter in app.js
    return next();
  }

  const redis = getRedisClient();
  if (!redis) {
    logger.warn({ userId }, "Redis client unavailable, bypassing per-user rate limit");
    return next();
  }

  try {
    const key = `rl:user:${userId}`;
    const count = await redis.incr(key);
    
    if (count === 1) {
      await redis.expire(key, 60);
    }

    if (count > 15) {
      logger.info({ userId, count }, "User rate limit exceeded");
      return res.status(429).json({
        message: "You've exceeded the 15 runs per minute limit. Please wait a moment."
      });
    }

    next();
  } catch (err) {
    logger.error({ err, userId }, "Rate limiter error");
    next(); // Fail open to avoid blocking users on cache errors
  }
}

module.exports = { userRateLimiter };
