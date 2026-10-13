export const ACCOUNT_UPDATED_EVENT = "greenbel:account-updated";

/** Signals only that the server saved a change; no identity or credentials are sent in the event. */
export function notifyAccountUpdated() {
  window.dispatchEvent(new Event(ACCOUNT_UPDATED_EVENT));
}
