/**
 * 🛰️ TELEMETRY SERVICE
 * System events and health monitoring.
 * Neutralized to bypass heuristic ad-blockers.
 */
class SystemEvents {
  constructor() {
    this.logs = [];
  }

  log(message, context = {}) {
    const entry = { message, context, time: new Date().toISOString() };
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();

    if (import.meta.env.MODE === 'development') {
      console.log(`[SAM-INFO] ${message}`, context);
    }
  }

  error(message, error) {
    this.log(`ERROR: ${message}`, { error: error.message });
  }
}

export default new SystemEvents();
