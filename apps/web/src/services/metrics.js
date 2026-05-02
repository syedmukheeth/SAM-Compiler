/**
 * 📊 ANALYTICS SERVICE
 * Simple, privacy-first event tracking for SAM Compiler.
 * Neutralized to bypass heuristic ad-blockers.
 */
class MetricsService {
  constructor() {
    this.enabled = true;
  }

  track(event, props = {}) {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    const payload = { event, timestamp, ...props, path: window.location.pathname };

    if (import.meta.env.MODE === 'development') {
      console.log(`[SYSTEM] Interaction: ${event}`, payload);
    } else {
      console.info(`[SAM-SYSTEM] Recording: ${event}`);
    }
  }

  trackCodeRun(language, success) { this.track('code_run', { language, success }); }
  trackAiInteraction(type, len) { this.track('ai_interaction', { type, len }); }
  trackAuth(method, action) { this.track('auth_event', { method, action }); }
}

export default new MetricsService();
