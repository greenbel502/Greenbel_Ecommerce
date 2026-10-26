/** Only these customer destinations can be selected by an authentication link. */
export type CustomerAuthDestination = "/checkout" | "/cuenta" | "/financiamiento#solicitud";
export function customerAuthDestination(value: unknown): CustomerAuthDestination {
  return value === "/checkout" || value === "/financiamiento#solicitud" ? value : "/cuenta";
}

const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

/** Preserve the actual local DEV port without trusting arbitrary forwarded hosts. */
export function googleCallbackUrl(appUrl: string | undefined, appEnvironment: string, requestOrigin: string | null, next: unknown): string {
  if (!appUrl) throw new Error("Falta la URL de la aplicación.");
  const configured = new URL(appUrl);
  let origin = configured.origin;
  if (requestOrigin) {
    const requested = new URL(requestOrigin);
    const localDev = appEnvironment === "DEV" && loopbackHosts.has(configured.hostname)
      && loopbackHosts.has(requested.hostname) && requested.protocol === configured.protocol;
    if (requested.username || requested.password || requested.origin !== requestOrigin
      || (requested.origin !== configured.origin && !localDev)) {
      throw new Error("Origen de autenticación no permitido.");
    }
    origin = requested.origin;
  }
  const callback = new URL("/auth/callback", origin);
  const destination = customerAuthDestination(next);
  if (destination !== "/cuenta") callback.searchParams.set("next", destination);
  return callback.toString();
}
