"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import { useRef, useState, type FormEvent } from "react";

export function GmailConnectButton({
  reconnect,
  disabled,
}: {
  reconnect: boolean;
  disabled: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useNotificationFeedback(error ? "error" : "idle", error);
  const busy = useRef(false);
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/gmail/connect", {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("authorizationUrl" in data) ||
        typeof data.authorizationUrl !== "string"
      )
        throw Error(
          "No se pudo iniciar la conexión. Actualiza tu sesión administrativa e inténtalo de nuevo.",
        );
      const url = new URL(data.authorizationUrl);
      if (
        url.origin !== "https://accounts.google.com" ||
        url.pathname !== "/o/oauth2/v2/auth"
      )
        throw Error(
          "No se pudo verificar la dirección de autorización de Google.",
        );
      window.location.assign(url.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir Google.");
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <form
      action="/api/integrations/gmail/connect"
      method="post"
      onSubmit={connect}
    >
      <button
        className="secondary-dark-button"
        type="submit"
        disabled={disabled || pending}
      >
        {pending
          ? "Abriendo Google…"
          : reconnect
            ? "Reconectar Gmail"
            : "Conectar Gmail"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
