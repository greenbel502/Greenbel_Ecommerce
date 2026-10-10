"use client";

import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CartLine } from "@/domain/entities/cart";
import { quoteSelectionSignature } from "@/domain/quotes/selection-signature";

type IssuedQuote = { quoteId: string; reference: string; downloadToken: string; selectionSignature: string };

export function QuoteRequest({ lines, ready }: { lines: CartLine[]; ready: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [issued, setIssued] = useState<IssuedQuote | null>(null);
  const key = useRef<string | null>(null);
  const selectionSignature = quoteSelectionSignature(lines);
  const supported = lines.length > 0 && lines.every((line) =>
    !line.product.isMockPrice && line.product.price !== null
    && line.product.availability === "available" && /^[0-9a-f-]{36}$/i.test(line.product.id));

  useEffect(() => {
    key.current = null;
    setError(null);
    setProcessing(false);
    try {
      const raw = sessionStorage.getItem("greenbel-current-quote-v1");
      const previous: unknown = raw ? JSON.parse(raw) : null;
      if (previous && typeof previous === "object"
        && "selectionSignature" in previous && previous.selectionSignature === selectionSignature
        && "quoteId" in previous && typeof previous.quoteId === "string"
        && "reference" in previous && typeof previous.reference === "string"
        && "downloadToken" in previous && typeof previous.downloadToken === "string") {
        setIssued(previous as IssuedQuote);
      } else {
        sessionStorage.removeItem("greenbel-current-quote-v1");
        setIssued(null);
      }
    } catch {
      setIssued(null);
    }
  }, [selectionSignature]);

  const edit = (field: "name" | "email", value: string) => {
    if (field === "name") setName(value);
    else setEmail(value);
    key.current = null;
    setIssued(null);
    setError(null);
    setProcessing(false);
    try { sessionStorage.removeItem("greenbel-current-quote-v1"); } catch { /* no browser storage */ }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || !supported || busy) return;
    setBusy(true);
    setError(null);
    setProcessing(false);
    try {
      key.current ??= crypto.randomUUID();
      const response = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: key.current,
          customerName: name.trim(),
          customerEmail: email.trim() || null,
          lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity }))
        })
      });
      const result: unknown = await response.json();
      if (response.status === 202) {
        setProcessing(true);
        return;
      }
      if (response.ok && typeof result === "object" && result !== null
        && "status" in result && result.status === "issued"
        && "quoteId" in result && typeof result.quoteId === "string"
        && "reference" in result && typeof result.reference === "string"
        && "downloadToken" in result && typeof result.downloadToken === "string") {
        const receipt = { quoteId: result.quoteId, reference: result.reference,
          downloadToken: result.downloadToken, selectionSignature };
        setIssued(receipt);
        try {
          sessionStorage.setItem("greenbel-current-quote-v1", JSON.stringify(receipt));
        } catch {
          // The PDF can still be downloaded in this tab; storage is optional.
        }
        return;
      }
      setError(response.status === 429
        ? "Se alcanzó el límite temporal de cotizaciones. Inténtalo más tarde."
        : response.status === 422
          ? "No se pudo cotizar esta selección. Comprueba precio y disponibilidad actual; el carrito no reserva existencias."
          : "No pudimos confirmar el PDF privado. Reintenta con la misma solicitud o inicia una nueva.");
    } catch {
      setError("No pudimos confirmar la cotización. Reintenta con la misma solicitud para evitar duplicados.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!issued || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(`/api/cotizaciones/${encodeURIComponent(issued.quoteId)}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: issued.downloadToken })
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("application/pdf")) {
        throw new Error("PDF unavailable");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Cotizacion-${issued.reference.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("No se pudo descargar el PDF privado. Comprueba tu acceso y vuelve a intentarlo.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="quote-request" aria-labelledby="quote-request-title">
      <h3 id="quote-request-title"><FileText size={18} /> Cotización sin cuenta</h3>
      <p>El servidor verifica precio y disponibilidad; la cotización no reserva inventario. El transporte y el total final quedan pendientes.</p>
      {!supported && <p role="status">La cotización monetaria requiere productos publicados, con precio y disponibilidad verificada en el catálogo conectado.</p>}
      <form onSubmit={submit}>
        <label>Nombre para la cotización
          <input autoComplete="name" value={name} onChange={(event) => edit("name", event.target.value)}
            required minLength={2} maxLength={160} disabled={busy} />
        </label>
        <label>Correo (opcional)
          <input type="email" autoComplete="email" value={email} onChange={(event) => edit("email", event.target.value)}
            maxLength={254} disabled={busy} />
        </label>
        <button className="primary-button full-width" type="submit" disabled={!ready || !supported || busy}>
          <FileText size={17} /> {busy ? "Generando PDF privado…" : processing ? "Consultar generación" : "Generar cotización PDF"}
        </button>
      </form>
      {processing && <p role="status">La generación sigue en curso. Pulsa de nuevo para consultar esta misma solicitud.</p>}
      {issued && <div role="status">
        <p>Cotización {issued.reference} emitida. Guarda el PDF ahora: los correos están pausados y el acceso privado vence.</p>
        <button className="primary-button full-width" type="button" onClick={download} disabled={downloading}>
          <Download size={17} /> {downloading ? "Descargando…" : "Descargar PDF privado"}
        </button>
        <Link className="continue-shopping" href="/financiamiento">Preparar borrador de financiamiento</Link>
      </div>}
      {error && <p role="alert">{error} <button type="button" onClick={() => {
        key.current = null;
        setProcessing(false);
        setError(null);
      }}>Iniciar solicitud nueva</button></p>}
    </section>
  );
}
