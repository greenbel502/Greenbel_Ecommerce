/** Browser mutations accept the configured origin or the actual DEV loopback origin. */
export function isTrustedAppOrigin(request: Request, appUrl: string | undefined, appEnvironment: string): boolean {
  const raw = request.headers.get("origin");
  if (!raw || !appUrl) return false;
  try {
    const origin = new URL(raw);
    const configured = new URL(appUrl);
    if (origin.origin !== raw || origin.username || origin.password) return false;
    if (origin.origin === configured.origin) return true;
    const local = new Set(["localhost", "127.0.0.1"]);
    const actual = new URL(request.url);
    return appEnvironment === "DEV" && local.has(configured.hostname) && local.has(actual.hostname)
      && local.has(origin.hostname) && actual.origin === origin.origin && configured.protocol === origin.protocol;
  } catch { return false; }
}
