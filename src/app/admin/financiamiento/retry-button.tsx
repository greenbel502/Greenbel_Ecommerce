"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function FinancingRetry({ id }: { id: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <div>
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/admin/financiamiento/reintentar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, confirm: true }),
            });
            const d = await r.json();
            setMessage(
              r.ok
                ? d.status === "sent"
                  ? "Gmail aceptó el envío."
                  : "Resultado: " + d.status
                : d.error,
            );
            router.refresh();
          } catch {
            setMessage(
              "No se pudo confirmar el resultado. Actualiza antes de reintentar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Reintentando…" : "Reintentar notificación"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
