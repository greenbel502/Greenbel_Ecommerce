"use client";
import {
  notify,
  useNotificationFeedback,
} from "@/presentation/notifications/notify";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  LockKeyhole,
  LogIn,
  Send,
  ShoppingBag,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  calculateCartLineTotal,
  formatCurrency,
} from "@/application/use-cases/cartCalculations";
import { quoteSelectionSignature } from "@/domain/quotes/selection-signature";
import { ACCOUNT_UPDATED_EVENT } from "@/presentation/events/account-events";
import { useCart } from "@/presentation/providers/cart-provider";
import styles from "./financing-form.module.css";
const LOGIN =
  "/cuenta/ingresar?next=%2Ffinanciamiento%23solicitud&reason=financiamiento";
const KEY = "greenbel-financing-account-v3";
const schema = z.object({
  name: z.string().trim().min(3, "Ingresa tu nombre completo").max(160),
  phone: z
    .string()
    .trim()
    .refine(
      (v) => !v || /^\+?[0-9\s-]{8,40}$/.test(v),
      "Ingresa un teléfono válido",
    ),
  message: z.string().trim().max(500, "Usa un máximo de 500 caracteres"),
  consent: z
    .boolean()
    .refine(Boolean, "Autoriza compartir tus datos antes de continuar"),
});
type Fields = z.infer<typeof schema>;
type Account = { name: string; email: string };
type Flow = { id: string; signature: string; owner: string };
type Prepared = {
  stage: string;
  email: string;
  name: string;
  phone: string | null;
  message: string | null;
  reference: string;
  delivery: string | null;
  retryAt: string | null;
  lines: { name: string; quantity: number; unitPrice: number; total: number }[];
};
class SessionRequired extends Error {}
async function post(path: string, body: object) {
  const r = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  const data = await r.json();
  if (r.status === 401) throw new SessionRequired();
  if (!r.ok)
    throw Error(data.error || "No pudimos confirmar la operación. Reintenta.");
  return data;
}
export function FinancingForm() {
  const router = useRouter();
  const { lines, totals, restoreStatus, storageError, retryRestore } =
    useCart();
  const signature = quoteSelectionSignature(lines);
  const [account, setAccount] = useState<Account | null>(null),
    [session, setSession] = useState<
      "checking" | "ready" | "anonymous" | "error"
    >("checking");
  const [flow, setFlow] = useState<Flow | null>(null),
    [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState<"prepare" | "send" | "pdf" | null>(null),
    [error, setError] = useState<string | null>(null);
  const sessionController = useRef<AbortController | null>(null);
  const keys = useRef<{
    fingerprint: string;
    quote: string;
    draft: string;
    issued?: { quoteId: string; downloadToken: string };
  } | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", message: "", consent: false },
  });
  const refreshSession = useCallback(() => {
    sessionController.current?.abort();
    const controller = new AbortController();
    sessionController.current = controller;
    void (async () => {
      try {
        const r = await fetch("/api/account/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok) throw Error("session_unavailable");
        const d = await r.json();
        if (controller.signal.aborted) return;
        if (!d.account) {
          setAccount(null);
          setSession("anonymous");
          setFlow(null);
          setPrepared(null);
          return;
        }
        const a = d.account as Account;
        setAccount(a);
        setSession("ready");
        if (!getValues("name") && a.name !== "Mi cuenta")
          setValue("name", a.name);
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
        if (
          saved &&
          saved.owner === a.email &&
          z.uuid().safeParse(saved.id).success &&
          typeof saved.signature === "string"
        ) {
          const state = await post("financiamiento/estado", { id: saved.id });
          if (!controller.signal.aborted) {
            setFlow(saved);
            setPrepared(state);
          }
        } else {
          setFlow(null);
          setPrepared(null);
          if (saved) sessionStorage.removeItem(KEY);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          if (e instanceof SessionRequired) {
            setSession("anonymous");
            setAccount(null);
          } else setSession("error");
        }
      }
    })();
  }, [getValues, setValue]);
  useEffect(() => {
    refreshSession();
    window.addEventListener(ACCOUNT_UPDATED_EVENT, refreshSession);
    return () => {
      sessionController.current?.abort();
      window.removeEventListener(ACCOUNT_UPDATED_EVENT, refreshSession);
    };
  }, [refreshSession]);
  useNotificationFeedback(error ? "error" : "idle", error);
  const ready =
    restoreStatus === "ready" &&
    !storageError &&
    lines.length > 0 &&
    totals.subtotal !== null;
  const unchanged = !flow || flow.signature === signature;
  const sent = prepared?.stage === "sent" || prepared?.delivery === "sent";
  const uncertain =
    prepared?.delivery === "unknown" || prepared?.delivery === "sending";
  const run = async (
    kind: NonNullable<typeof busy>,
    work: () => Promise<void>,
  ) => {
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (e) {
      if (e instanceof SessionRequired) {
        setSession("anonymous");
        router.push(LOGIN);
      } else
        setError(
          e instanceof Error ? e.message : "No pudimos confirmar la operación.",
        );
    } finally {
      setBusy(null);
    }
  };
  const prepare = handleSubmit((values) =>
    run("prepare", async () => {
      if (!ready || !account) throw new SessionRequired();
      const fingerprint = JSON.stringify({
        signature,
        values,
        email: account.email,
      });
      if (keys.current?.fingerprint !== fingerprint)
        keys.current = {
          fingerprint,
          quote: crypto.randomUUID(),
          draft: crypto.randomUUID(),
        };
      const k = keys.current!;
      if (!k.issued) {
        const q = await post("cotizaciones", {
          purpose: "financing",
          idempotencyKey: k.quote,
          customerName: values.name,
          customerEmail: account.email,
          lines: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        });
        if (q.status !== "issued")
          throw Error(
            "El PDF se está preparando. Espera unos segundos y vuelve a continuar.",
          );
        k.issued = q;
      }
      const result = await post("financiamiento/borradores", {
        idempotencyKey: k.draft,
        quoteId: k.issued!.quoteId,
        quoteAccessToken: k.issued!.downloadToken,
        applicantName: values.name,
        phone: values.phone || null,
        message: values.message || null,
        consent: true,
      });
      const state = await post("financiamiento/estado", { id: result.id });
      const f = { id: result.id, signature, owner: account.email };
      notify.success("Solicitud preparada", {
        description: "Revisa el PDF y confirma el envío cuando estés listo.",
      });
      setFlow(f);
      setPrepared(state);
      try {
        sessionStorage.setItem(KEY, JSON.stringify(f));
      } catch {
        /* Current page remains usable without browser storage. */
      }
    }),
  );
  const reset = () => {
    setFlow(null);
    setPrepared(null);
    setError(null);
    keys.current = null;
    sessionStorage.removeItem(KEY);
    setValue("consent", false);
  };
  return (
    <div className={`financing-form ${styles.shell}`} aria-busy={Boolean(busy)}>
      <header className={styles.heading}>
        <span className="eyebrow">Solicitud de información</span>
        <h2>
          {prepared ? "Revisa antes de enviar" : "Consulta por financiamiento"}
        </h2>
        <p>
          {prepared
            ? "Estos son los datos y el PDF que GreenBel compartirá con la cooperativa cuando confirmes."
            : "Selecciona tus productos, completa tus datos y solicita información a Cooperativa Concepción R.L."}
        </p>
      </header>
      <div className={styles.steps} aria-label="Progreso de la solicitud">
        <span className={!prepared ? styles.current : styles.complete}>
          <i>{prepared ? <Check size={14} /> : "1"}</i> Tus datos
        </span>
        <span className={prepared ? styles.current : ""}>
          <i>2</i> Revisa y envía
        </span>
      </div>
      <details className={styles.selection} key={prepared ? "frozen" : "cart"}>
        <summary className={styles.selectionToggle}>
          <span className={styles.summaryIcon}>
            <ShoppingBag size={21} />
          </span>
          <span className={styles.selectionTitle}>
            <strong>
              {prepared
                ? "Selección para la cooperativa"
                : "Tu selección de productos"}
            </strong>
            <small>
              {restoreStatus === "loading"
                ? "Actualizando carrito…"
                : `${prepared ? (prepared.lines?.length ?? 0) : lines.length} producto${(prepared ? prepared.lines?.length : lines.length) === 1 ? "" : "s"}`}{" "}
              · Ver detalle
            </small>
          </span>
          <span className={styles.summaryTotal}>
            {formatCurrency(
              prepared
                ? prepared.lines.reduce(
                    (sum, l) => sum + Math.round(Number(l.total) * 100),
                    0,
                  ) / 100
                : (totals.subtotal ?? 0),
            )}
          </span>
          <ChevronDown size={18} className={styles.chevron} />
        </summary>
        <div className={styles.selectionBody}>
          {!prepared && lines.length === 0 ? (
            <p>
              Agrega productos al carrito para incluirlos en tu solicitud.{" "}
              <Link href="/productos">Explorar catálogo</Link>
            </p>
          ) : (
            <ul className={styles.productList}>
              {prepared
                ? prepared.lines.map((l, i) => (
                    <li key={i} className={styles.frozenLine}>
                      <strong>{l.name}</strong>
                      <span>
                        {l.quantity} × {formatCurrency(Number(l.unitPrice))}
                      </span>
                      <b>{formatCurrency(Number(l.total))}</b>
                    </li>
                  ))
                : lines.map((l) => (
                    <li key={l.product.id} className={styles.productRow}>
                      <div className={styles.productImage}>
                        <Image
                          src={l.product.image}
                          alt=""
                          fill
                          sizes="64px"
                          unoptimized={l.product.image.startsWith("/api/")}
                        />
                      </div>
                      <div className={styles.productInfo}>
                        <strong>{l.product.name}</strong>
                        <small>
                          {l.product.brand} · {l.product.sku}
                        </small>
                        <span>
                          {l.quantity} ×{" "}
                          {l.product.price === null
                            ? "Precio por confirmar"
                            : formatCurrency(l.product.price)}
                        </span>
                      </div>
                      <b>
                        {calculateCartLineTotal(l) === null
                          ? "Por confirmar"
                          : formatCurrency(calculateCartLineTotal(l)!)}
                      </b>
                    </li>
                  ))}
            </ul>
          )}
          <div className={styles.selectionFooter}>
            <span>Total de productos</span>
            <strong>
              {prepared
                ? formatCurrency(
                    prepared.lines.reduce(
                      (sum, l) => sum + Math.round(Number(l.total) * 100),
                      0,
                    ) / 100,
                  )
                : totals.subtotal === null
                  ? "Por confirmar"
                  : formatCurrency(totals.subtotal)}
            </strong>
          </div>
          <Link className={styles.textLink} href="/carrito">
            Modificar mi carrito
          </Link>
        </div>
      </details>
      <p className={styles.stockNote}>
        Disponibilidad por confirmar. El PDF no reserva inventario; la entrega
        se coordina por separado.
      </p>
      {session === "checking" ? (
        <p className={styles.feedback} role="status">
          <Loader2 size={18} className={styles.spin} /> Comprobando tu sesión…
        </p>
      ) : session === "anonymous" ? (
        <div className={styles.signIn}>
          <span className={styles.signInIcon}>
            <LockKeyhole size={24} />
          </span>
          <h3>Continúa con tu cuenta GreenBel</h3>
          <p>
            Para enviar tu solicitud necesitas iniciar sesión. Tu selección del
            carrito se conservará.
          </p>
          <Link className={styles.primary} href={LOGIN}>
            <LogIn size={18} /> Iniciar sesión para continuar
          </Link>
          <Link
            className={styles.textLink}
            href="/cuenta/registro?next=%2Ffinanciamiento%23solicitud"
          >
            Crear una cuenta
          </Link>
        </div>
      ) : session === "error" ? (
        <div className={styles.error} role="alert">
          <p>No pudimos comprobar tu sesión o recuperar la solicitud.</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={refreshSession}
          >
            Reintentar
          </button>
          {flow && (
            <button type="button" className={styles.textLink} onClick={reset}>
              Iniciar una solicitud nueva
            </button>
          )}
        </div>
      ) : !prepared ? (
        <form onSubmit={prepare} noValidate>
          <fieldset className={styles.fields} disabled={Boolean(busy)}>
            <label>
              <span>Nombre completo</span>
              <input
                {...register("name")}
                autoComplete="name"
                maxLength={160}
              />
              {errors.name && <small role="alert">{errors.name.message}</small>}
            </label>
            <label>
              <span>Correo de tu cuenta</span>
              <input
                value={account?.email ?? ""}
                readOnly
                type="email"
                aria-describedby="finance-account-note"
              />
              <small id="finance-account-note">
                Usaremos el correo de tu sesión.
              </small>
            </label>
            <label className={styles.wide}>
              <span>Teléfono (opcional)</span>
              <input
                {...register("phone")}
                type="tel"
                autoComplete="tel"
                maxLength={40}
              />
              {errors.phone && (
                <small role="alert">{errors.phone.message}</small>
              )}
            </label>
            <label className={styles.wide}>
              <span>Cuéntanos sobre tu proyecto (opcional)</span>
              <textarea
                {...register("message")}
                maxLength={500}
                placeholder="¿Cómo te ayudarían estos productos en tu trabajo?"
              />
              {errors.message && (
                <small role="alert">{errors.message.message}</small>
              )}
            </label>
          </fieldset>
          <label className={styles.consent}>
            <input
              {...register("consent")}
              type="checkbox"
              disabled={Boolean(busy)}
            />
            <span>
              Autorizo a GreenBel a compartir mis datos y el PDF de los
              productos seleccionados con Cooperativa Concepción R.L. cuando
              confirme el envío.
            </span>
          </label>
          {errors.consent && (
            <p className={styles.fieldError} role="alert">
              {errors.consent.message}
            </p>
          )}
          {!ready && (
            <p className={styles.stockNote}>
              {restoreStatus === "ready"
                ? "Revisa el carrito: necesitas productos con precio para continuar."
                : "No pudimos actualizar todos los productos del carrito."}
              {restoreStatus !== "ready" && (
                <button
                  type="button"
                  onClick={retryRestore}
                  className={styles.textLink}
                >
                  Actualizar selección
                </button>
              )}
            </p>
          )}
          <button
            className={styles.primary}
            type="submit"
            disabled={!ready || Boolean(busy)}
          >
            {busy ? (
              <Loader2 size={18} className={styles.spin} />
            ) : (
              <FileText size={18} />
            )}{" "}
            {busy ? "Preparando tu PDF…" : "Revisar solicitud"}
          </button>
          <p className={styles.actionHint}>
            En el siguiente paso podrás revisar el PDF y confirmar su envío.
          </p>
        </form>
      ) : (
        <section
          className={styles.review}
          aria-label="Revisión de la solicitud"
        >
          <dl>
            <div>
              <dt>Solicitante</dt>
              <dd>{prepared.name}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{prepared.email}</dd>
            </div>
            {prepared.phone && (
              <div>
                <dt>Teléfono</dt>
                <dd>{prepared.phone}</dd>
              </div>
            )}
          </dl>
          {prepared.message && <blockquote>{prepared.message}</blockquote>}
          <div className={styles.pdf}>
            <span className={styles.summaryIcon}>
              <FileText size={23} />
            </span>
            <div>
              <strong>PDF de tu selección</strong>
              <small>Productos, cantidades y precios</small>
            </div>
            <button
              className={styles.secondary}
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void run("pdf", async () => {
                  const r = await fetch("/api/financiamiento/pdf", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: flow!.id }),
                    cache: "no-store",
                  });
                  if (r.status === 401) throw new SessionRequired();
                  if (!r.ok) throw Error("No pudimos descargar el PDF.");
                  const url = URL.createObjectURL(await r.blob());
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `Cotizacion-${prepared.reference}.pdf`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 30000);
                })
              }
            >
              <Download size={16} />{" "}
              {busy === "pdf" ? "Descargando…" : "Revisar PDF"}
            </button>
          </div>
          {!unchanged && (
            <p className={styles.error} role="alert">
              El carrito cambió. Inicia una solicitud nueva para incluir la
              selección actual.
            </p>
          )}
          {sent ? (
            <p className={styles.success} role="status">
              <Check size={20} /> Gmail aceptó tu solicitud con el PDF para su
              envío a la cooperativa.
            </p>
          ) : uncertain ? (
            <p className={styles.feedback} role="status">
              El envío está en proceso o su resultado no se pudo confirmar. Para
              evitar duplicados, no se repetirá automáticamente.
            </p>
          ) : (
            <>
              <p className={styles.actionHint}>
                Al confirmar, se enviarán tus datos y el PDF al contacto de
                Cooperativa Concepción R.L.
              </p>
              <button
                className={styles.primary}
                type="button"
                disabled={Boolean(busy) || !unchanged}
                onClick={() =>
                  void run("send", async () => {
                    const result = await post("financiamiento/enviar", {
                      id: flow!.id,
                      confirm: true,
                    });
                    setPrepared(
                      await post("financiamiento/estado", { id: flow!.id }),
                    );
                    if (result.status === "sent")
                      notify.success("Solicitud enviada", {
                        description:
                          "Compartimos tus datos y el PDF con la cooperativa.",
                      });
                    else if (result.status !== "failed")
                      notify.warning("Envío por confirmar", {
                        description:
                          "Tu solicitud está guardada. No la envíes de nuevo mientras comprobamos la entrega.",
                      });
                    if (result.status === "failed")
                      throw Error(
                        "El correo no pudo enviarse. Tu solicitud sigue guardada. Espera un minuto antes de reintentar.",
                      );
                  })
                }
              >
                {busy === "send" ? (
                  <Loader2 size={18} className={styles.spin} />
                ) : (
                  <Send size={18} />
                )}{" "}
                {busy === "send"
                  ? "Enviando solicitud…"
                  : prepared.delivery === "failed"
                    ? "Reintentar envío"
                    : "Enviar solicitud y PDF"}
              </button>
            </>
          )}
          <button
            className={styles.textLink}
            type="button"
            disabled={Boolean(busy)}
            onClick={reset}
          >
            {sent ? "Iniciar otra solicitud" : "Volver y editar mis datos"}
          </button>
        </section>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.disclaimer}>
        <LockKeyhole size={15} />
        <span>
          La cooperativa define requisitos, tasas y plazos. Enviar esta consulta
          no implica aprobación de crédito.
        </span>
      </p>
    </div>
  );
}
