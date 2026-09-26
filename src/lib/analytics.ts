// Usage analytics are disabled in JLFBot.
//
// Upstream JLFBot shipped a PostHog client with a hard-coded project key
// that reported usage events (and, optionally, the onboarding email) to the
// upstream maintainers. JLFBot is a private, local-first fork, so nothing here
// talks to the network: every export keeps its call signature so callers do
// not need to change, but track()/identifyEmail() are inert and the opt-in can
// never be switched on.

/** Always false: JLFBot never collects usage analytics. */
export function analyticsEnabled(): boolean {
  return false;
}

/** Kept for call-site compatibility; analytics cannot be enabled. */
export function setAnalyticsEnabled(_enabled: boolean): void {}

/** Kept for call-site compatibility; there is no analytics client to start. */
export function initAnalytics(): void {}

/** No-op: events are never recorded or sent anywhere. */
export function track(_event: string, _props?: Record<string, unknown>): void {}

/** No-op: the onboarding email stays in the local profile only. */
export function identifyEmail(_email: string): void {}

// first-run email gate state (purely local UI state, never reported)
const GATE_KEY = "jlfbot-email-gate";
export function emailGateDone(): boolean {
  return Boolean(localStorage.getItem(GATE_KEY));
}
export function setEmailGateDone(status: "submitted" | "skipped") {
  localStorage.setItem(GATE_KEY, status);
}
