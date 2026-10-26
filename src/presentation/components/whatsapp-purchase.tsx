"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Check,
  Download,
  FileDown,
  Loader2,
  MessageCircle,
  X,
  MessageSquareQuote,
} from "lucide-react";
import {
  WhatsAppReviewDrawer,
  type WhatsAppReviewInvitation,
} from "./whatsapp-review-drawer";
import reviewStyles from "./whatsapp-review.module.css";
import type { CartLine } from "@/domain/entities/cart";
import { canRequestByWhatsApp } from "@/domain/cart/whatsapp-selection";
import styles from "./whatsapp-purchase.module.css";
import {
  WHATSAPP_PAYMENT_METHODS,
  WHATSAPP_DELIVERY_METHODS,
  parseWhatsAppPreferences,
  whatsAppPreferenceLabels,
  type WhatsAppPreferences,
} from "@/domain/cart/whatsapp-preferences";
import { ACCOUNT_UPDATED_EVENT } from "@/presentation/events/account-events";
// Reuse the existing purchase return: /checkout redirects to /carrito during this phase.
const LOGIN_URL = "/cuenta/ingresar?next=%2Fcheckout";

type Prepared = {
  blobUrl: string;
  whatsappUrl: string;
  filename: string;
  invitation: WhatsAppReviewInvitation | null;
};
function PurchaseDialog({
  lines,
  preferences,
  onUnauthenticated,
  onClose,
  onReview,
  onPreparedReview,
}: {
  lines: CartLine[];
  preferences: WhatsAppPreferences;
  onUnauthenticated: () => void;
  onClose: () => void;
  onReview: (invitation: WhatsAppReviewInvitation) => void;
  onPreparedReview: (invitation: WhatsAppReviewInvitation) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    started = useRef(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [completed, setCompleted] = useState(false);
  useNotificationFeedback(
    error ? "error" : completed ? "success" : "idle",
    error ||
      (completed
        ? "Tu PDF está listo. Adjunta el archivo al mensaje de WhatsApp."
        : ""),
  );
  useLayoutEffect(() => {
    const panel = dialog.current!,
      previous = document.activeElement,
      overflow = document.documentElement.style.overflow;
    panel.showModal();
    document.documentElement.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      panel.close();
      document.documentElement.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let blobUrl: string | undefined;
    setPrepared(null);
    setError("");
    started.current = false;
    async function prepare() {
      try {
        const response = await fetch("/api/cart/whatsapp/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences,
            lines: lines.map((l) => ({
              productId: l.product.id,
              quantity: l.quantity,
            })),
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
          cache: "no-store",
        });
        if (response.status === 401) {
          onUnauthenticated();
          return;
        }
        if (!response.ok) {
          const data = await response.json();
          throw Error(data.error || "No se pudo preparar el PDF.");
        }
        const href = response.headers.get("X-Greenbel-WhatsApp-Url"),
          url = new URL(href ?? "");
        if (
          !response.headers
            .get("content-type")
            ?.startsWith("application/pdf") ||
          url.origin !== "https://wa.me" ||
          !/^\/[1-9]\d{7,14}$/.test(url.pathname) ||
          url.username ||
          url.password
        )
          throw Error("No se pudo comprobar el documento y el contacto.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        blobUrl = URL.createObjectURL(blob);
        const filename =
          response.headers
            .get("content-disposition")
            ?.match(/filename="([A-Za-z0-9_-]+\.pdf)"/)?.[1] ??
          "Seleccion-GreenBel.pdf";
        const invitationId = response.headers.get(
          "X-Greenbel-Review-Invitation",
        );
        const reference = response.headers.get(
          "X-Greenbel-Selection-Reference",
        );
        const invitation =
          invitationId &&
          /^[0-9a-f-]{36}$/i.test(invitationId) &&
          reference &&
          /^GB-[A-Z0-9]{8}$/.test(reference)
            ? { id: invitationId, reference }
            : null;
        setPrepared({ blobUrl, whatsappUrl: url.href, filename, invitation });
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "No pudimos preparar tu selección. Inténtalo de nuevo.",
          );
      }
    }
    void prepare();
    return () => {
      controller.abort();
      if (blobUrl) {
        const url = blobUrl;
        if (started.current) setTimeout(() => URL.revokeObjectURL(url), 60000);
        else URL.revokeObjectURL(url);
      }
    };
  }, [lines, preferences, attempt, onUnauthenticated]);
  function download() {
    if (!prepared) throw Error("El PDF no está disponible.");
    const a = document.createElement("a");
    a.href = prepared.blobUrl;
    a.download = prepared.filename;
    document.body.append(a);
    a.click();
    a.remove();
  }
  function proceed(e: MouseEvent<HTMLAnchorElement>) {
    if (started.current || !prepared) {
      e.preventDefault();
      return;
    }
    try {
      download();
      started.current = true;
      if (prepared.invitation) onPreparedReview(prepared.invitation);
      setTimeout(() => setCompleted(true), 0);
    } catch {
      e.preventDefault();
      setError(
        "El navegador no inició la descarga. Inténtalo de nuevo antes de abrir WhatsApp.",
      );
    }
  }
  const labels = whatsAppPreferenceLabels(preferences);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="whatsapp-purchase-title"
      aria-describedby="whatsapp-purchase-description"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Cerrar confirmación de compra"
      >
        <X size={20} />
      </button>
      <div className={styles.icon}>
        <MessageCircle size={27} />
      </div>
      <span className="eyebrow">Compra con atención personalizada</span>
      <h2 id="whatsapp-purchase-title">Continuar por WhatsApp</h2>
      <p id="whatsapp-purchase-description">
        Se descargará un PDF con tus productos seleccionados y se abrirá el
        WhatsApp de GreenBel.{" "}
        <strong>Por favor, adjunta el PDF al mensaje.</strong>
      </p>
      <dl className={styles.selectedPreferences}>
        <div>
          <dt>Forma de pago</dt>
          <dd>{labels.payment}</dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>{labels.delivery}</dd>
        </div>
      </dl>
      <ol className={styles.steps}>
        <li>
          <FileDown size={21} />
          <span>
            <strong>Descarga tu selección</strong>
            <small>Incluye productos, cantidades, total, pago y entrega.</small>
          </span>
        </li>
        <li>
          <MessageCircle size={21} />
          <span>
            <strong>Adjunta el PDF en WhatsApp</strong>
            <small>Un asesor confirmará disponibilidad, entrega y pago.</small>
          </span>
        </li>
      </ol>
      {!prepared && !error && (
        <p role="status" className={styles.status}>
          <Loader2 size={17} className={styles.spin} />
          Preparando tu PDF…
        </p>
      )}
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setAttempt((a) => a + 1)}
          >
            Reintentar
          </button>{" "}
          <Link href="/contacto">Ver contacto</Link>
        </div>
      )}
      {completed && (
        <p role="status" className={styles.success}>
          <Check size={18} />
          Se inició la descarga. Busca el PDF en tus descargas y adjúntalo al
          mensaje.
        </p>
      )}
      {completed && prepared?.invitation && (
        <div className={reviewStyles.invitation}>
          <strong>
            <MessageSquareQuote size={19} /> Tu experiencia cuenta
          </strong>
          <p>
            Después de enviar tu mensaje, puedes compartir cómo fue solicitar
            por WhatsApp.
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => onReview(prepared.invitation!)}
          >
            Escribir reseña
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <button
          ref={cancel}
          type="button"
          className={styles.secondary}
          onClick={onClose}
        >
          {completed ? "Cerrar" : "Cancelar"}
        </button>
        {prepared && !completed ? (
          <a
            className={styles.primary}
            href={prepared.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={proceed}
          >
            Continuar
            <MessageCircle size={18} />
          </a>
        ) : completed && prepared ? (
          <a
            className={styles.primary}
            href={prepared.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir WhatsApp
            <MessageCircle size={18} />
          </a>
        ) : (
          <button type="button" className={styles.primary} disabled>
            Continuar
            <MessageCircle size={18} />
          </button>
        )}
      </div>
      {completed && (
        <button
          type="button"
          className={styles.redownload}
          onClick={() => {
            try {
              download();
            } catch {
              setError("No se pudo iniciar la descarga.");
            }
          }}
        >
          <Download size={16} />
          Descargar PDF de nuevo
        </button>
      )}
    </dialog>
  );
}
export function WhatsAppPurchase({
  lines,
  ready,
}: {
  lines: CartLine[];
  ready: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [reviewInvitation, setReviewInvitation] =
    useState<WhatsAppReviewInvitation | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false),
    [reviewSaved, setReviewSaved] = useState(false);
  const [session, setSession] = useState<
    "checking" | "ready" | "anonymous" | "error"
  >("checking");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [validation, setValidation] = useState(false);
  const sessionRequest = useRef<AbortController | null>(null);
  const payment = useRef<HTMLSelectElement>(null),
    delivery = useRef<HTMLSelectElement>(null);
  const [chosen, setChosen] = useState<WhatsAppPreferences | null>(null);
  const unauthenticated = useCallback(() => {
    setOpened(false);
    setSession("anonymous");
    setReviewOpen(false);
    setReviewInvitation(null);
  }, []);
  const refreshSession = useCallback(() => {
    sessionRequest.current?.abort();
    const controller = new AbortController();
    sessionRequest.current = controller;
    void (async () => {
      try {
        const response = await fetch("/api/account/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw Error("session_unavailable");
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (payload.account && typeof payload.account === "object")
          setSession("ready");
        else unauthenticated();
      } catch {
        if (!controller.signal.aborted) {
          setSession("error");
          setOpened(false);
        }
      }
    })();
  }, [unauthenticated]);
  useEffect(() => {
    refreshSession();
    const visible = () => {
      if (document.visibilityState === "visible") refreshSession();
    };
    window.addEventListener("focus", refreshSession);
    window.addEventListener(ACCOUNT_UPDATED_EVENT, refreshSession);
    document.addEventListener("visibilitychange", visible);
    return () => {
      sessionRequest.current?.abort();
      window.removeEventListener("focus", refreshSession);
      window.removeEventListener(ACCOUNT_UPDATED_EVENT, refreshSession);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshSession]);
  const supported =
    lines.length > 0 && lines.every((l) => canRequestByWhatsApp(l.product));
  function openPurchase() {
    if (session !== "ready" || !ready || !supported) return;
    const preferences = parseWhatsAppPreferences({
      paymentMethod,
      deliveryMethod,
    });
    if (!preferences) {
      setValidation(true);
      (!paymentMethod ? payment : delivery).current?.focus();
      return;
    }
    setChosen(preferences);
    setOpened(true);
  }
  return (
    <div className={styles.purchase}>
      {session === "ready" && (
        <>
          <div className={styles.preferences}>
            <label>
              Forma de pago
              <select
                ref={payment}
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setValidation(false);
                }}
                required
                aria-invalid={validation && !paymentMethod}
                aria-describedby={
                  validation ? "whatsapp-preferences-error" : undefined
                }
              >
                <option value="">Selecciona una opción</option>
                {WHATSAPP_PAYMENT_METHODS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Método de entrega
              <select
                ref={delivery}
                value={deliveryMethod}
                onChange={(e) => {
                  setDeliveryMethod(e.target.value);
                  setValidation(false);
                }}
                required
                aria-invalid={validation && !deliveryMethod}
                aria-describedby={
                  validation ? "whatsapp-preferences-error" : undefined
                }
              >
                <option value="">Selecciona una opción</option>
                {WHATSAPP_DELIVERY_METHODS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {validation && (
            <p
              role="alert"
              id="whatsapp-preferences-error"
              className={styles.error}
            >
              Selecciona la forma de pago y el método de entrega.
            </p>
          )}
          <button
            type="button"
            className="primary-button full-width"
            disabled={!ready || !supported}
            onClick={openPurchase}
          >
            <MessageCircle size={20} />
            Comprar por WhatsApp
          </button>
          <p>
            Las opciones elegidas se adjuntarán al mensaje de WhatsApp y al PDF.
          </p>
        </>
      )}
      {session === "checking" && (
        <button type="button" className="primary-button full-width" disabled>
          <Loader2 size={18} className={styles.spin} />
          Verificando sesión…
        </button>
      )}
      {session === "anonymous" && (
        <>
          <p>
            Inicia sesión o crea tu cuenta para continuar con la compra por
            WhatsApp.
          </p>
          <Link className="primary-button full-width" href={LOGIN_URL}>
            Iniciar sesión para comprar
          </Link>
          <p>
            ¿Aún no tienes cuenta?{" "}
            <Link href="/cuenta/registro?next=%2Fcheckout">
              Crear una cuenta
            </Link>
          </p>
        </>
      )}
      {session === "error" && (
        <div role="alert" className={styles.error}>
          <p>No pudimos comprobar tu sesión. Reintenta antes de continuar.</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={refreshSession}
          >
            Reintentar sesión
          </button>
        </div>
      )}
      {!supported && (
        <p role="status">
          Actualiza el carrito: algunos productos no tienen precio o no están
          disponibles.
        </p>
      )}
      {opened && chosen && session === "ready" && (
        <PurchaseDialog
          lines={lines}
          preferences={chosen}
          onUnauthenticated={unauthenticated}
          onClose={() => setOpened(false)}
          onPreparedReview={(invitation) => {
            setReviewInvitation(invitation);
            setReviewSaved(false);
          }}
          onReview={(invitation) => {
            setOpened(false);
            setReviewInvitation(invitation);
            setReviewOpen(true);
          }}
        />
      )}
      {reviewInvitation && session === "ready" && (
        <div className={reviewStyles.invitation}>
          <strong>
            <MessageSquareQuote size={19} />{" "}
            {reviewSaved
              ? "Gracias por compartir tu opinión"
              : "¿Ya enviaste tu solicitud?"}
          </strong>
          <p>
            {reviewSaved
              ? "Tu reseña quedó pendiente de moderación."
              : "Cuéntanos tu experiencia al solicitar por WhatsApp."}
          </p>
          {!reviewSaved && (
            <button
              type="button"
              id="whatsapp-review-open"
              className="secondary-dark-button"
              onClick={() => setReviewOpen(true)}
            >
              Escribir reseña
            </button>
          )}
        </div>
      )}
      {reviewOpen && reviewInvitation && session === "ready" && (
        <WhatsAppReviewDrawer
          invitation={reviewInvitation}
          onClose={() => setReviewOpen(false)}
          onSaved={() => setReviewSaved(true)}
        />
      )}
    </div>
  );
}
