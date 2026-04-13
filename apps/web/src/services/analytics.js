/**
 * 📊 ANALYTICS SERVICE
 * Simple, privacy-first event tracking for SAM Compiler.
 */
class AnalyticsService {
  constructor() {
    this.enabled = true; // Can be toggled via config
  }

  /**
   * Track a user event
   * @param {string} event - The event name (e.g., 'code_run', 'ai_refactor')
   * @param {Object} props - Additional metadata
   */
  track(event, props = {}) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const payload = {
      event,
      timestamp,
      ...props,
      path: window.location.pathname,
      screen: `${window.innerWidth}x${window.innerHeight}`,
    };

    // In a real production app, you would send this to a backend or a service like Plausible
    // For now, we log it to the console with a distinctive signature for site monitoring
    if (import.meta.env.MODE === 'development') {
      console.log(`[ANALYTICS] 📈 Event: ${event}`, payload);
    } else {
      // Logic for production tracking endpoint would go here
      // fetch(`${process.env.VITE_API_BASE_URL}/analytics/event`, { method: 'POST', body: JSON.stringify(payload) });
      console.info(`[SAM-METRICS] Recording interaction: ${event}`);
    }
  }

  // Core Event Helpers
  trackCodeRun(language, success) {
    this.track('code_run', { language, success });
  }

  trackAiInteraction(type, promptLength) {
    this.track('ai_interaction', { type, promptLength });
  }

  trackAuth(method, action) {
    this.track('auth_event', { method, action });
  }
}

export default new AnalyticsService();
