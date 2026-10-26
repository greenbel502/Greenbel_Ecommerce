"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Leaf,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  ShoppingBag,
  X,
} from "lucide-react";
import type { ChatAnswer, ChatMessage } from "@/lib/chatbot/types";
import { ACCOUNT_UPDATED_EVENT } from "@/presentation/events/account-events";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import styles from "./virtual-assistant.module.css";

const STORAGE = "greenbel:bell:conversation",
  PENDING = "greenbel:bell:pending";
type PendingMessage = {
  message: string;
  requestId: string;
  conversationId: string | null;
};
const suggestions = [
  "¿Qué productos venden?",
  "¿Cómo puedo pagar?",
  "¿Me pueden enviar a Xela?",
  "¿Cómo funciona el financiamiento?",
];
function Avatar({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`assistant-avatar${compact ? " compact" : ""}`}
      aria-hidden="true"
    >
      <Image
        src="/images/bellbot-thumb.webp"
        alt=""
        width={160}
        height={160}
        className="assistant-avatar-image"
      />
    </span>
  );
}

export function VirtualAssistant() {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false),
    [ready, setReady] = useState(false),
    [initialized, setInitialized] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null),
    [retry, setRetry] = useState<PendingMessage | null>(null);
  const input = useRef<HTMLTextAreaElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    end = useRef<HTMLDivElement>(null),
    busy = useRef(false);
  const pathname = usePathname(),
    confirm = useConfirm();
  useNotificationFeedback(error ? "error" : "idle", error);
  const load = useCallback(async () => {
    setInitialized(true);
    setLoading(true);
    setError("");
    try {
      const stored = sessionStorage.getItem(STORAGE),
        id = stored && /^[a-f0-9-]{36}$/i.test(stored) ? stored : null;
      const response = await fetch(
        `/api/chat${id ? `?conversationId=${encodeURIComponent(id)}` : ""}`,
        { cache: "no-store", signal: AbortSignal.timeout(15000) },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "No pudimos abrir el chat.");
      setConversationId(data.conversationId);
      setMessages(data.messages ?? []);
      setReady(true);
      if (!data.conversationId) {
        sessionStorage.removeItem(STORAGE);
        sessionStorage.removeItem(PENDING);
        setRetry(null);
      } else {
        try {
          const p = JSON.parse(sessionStorage.getItem(PENDING) || "null");
          if (p && p.message && p.requestId) {
            if (
              (data.messages ?? []).some(
                (m: ChatMessage) =>
                  m.role === "assistant" && m.requestId === p.requestId,
              )
            ) {
              sessionStorage.removeItem(PENDING);
              setRetry(null);
            } else {
              setRetry(p);
              setError(
                "No pudimos confirmar tu último mensaje. Reinténtalo sin duplicarlo.",
              );
            }
          }
        } catch {
          sessionStorage.removeItem(PENDING);
        }
      }
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "El chat tardó en responder. Inténtalo nuevamente.",
      );
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (open && !initialized && !loading) void load();
  }, [open, initialized, loading, load]);
  useEffect(() => {
    const changed = () => {
      setMessages([]);
      setReady(false);
      setInitialized(false);
      setRetry(null);
      setConversationId(null);
    };
    window.addEventListener(ACCOUNT_UPDATED_EVENT, changed);
    return () => window.removeEventListener(ACCOUNT_UPDATED_EVENT, changed);
  }, []);
  useEffect(() => {
    if (open && !loading && !pending && ready)
      input.current?.focus({ preventScroll: true });
  }, [open, loading, pending, ready]);
  useEffect(() => {
    if (open)
      end.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [messages, pending, open]);
  const previouslyOpen = useRef(false);
  useEffect(() => {
    if (!open && previouslyOpen.current) launcher.current?.focus();
    previouslyOpen.current = open;
  }, [open]);
  function close() {
    setOpen(false);
  }
  async function send(message: string, repeated?: PendingMessage) {
    if (busy.current || !ready || !message.trim()) return;
    const request = repeated ?? {
      message: message.trim(),
      requestId: crypto.randomUUID(),
      conversationId,
    };
    busy.current = true;
    setPending(true);
    setError("");
    setRetry(null);
    setDraft("");
    const id = request.conversationId ?? request.requestId;
    sessionStorage.setItem(STORAGE, id);
    sessionStorage.setItem(PENDING, JSON.stringify(request));
    if (!repeated)
      setMessages((current) => [
        ...current,
        {
          id: request.requestId + "-user",
          role: "user",
          content: request.message,
          createdAt: new Date().toISOString(),
        },
      ]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, pagePath: pathname }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json();
      if (!response.ok || !data.answer)
        throw Error(data.error || "No pudimos confirmar la respuesta.");
      setConversationId(data.conversationId);
      sessionStorage.setItem(STORAGE, data.conversationId);
      sessionStorage.removeItem(PENDING);
      const answer = data.answer as Omit<ChatAnswer, "context">;
      setMessages((current) => [
        ...current.filter((m) => m.id !== request.requestId + "-assistant"),
        {
          id: request.requestId + "-assistant",
          role: "assistant",
          content: answer.text,
          createdAt: answer.asOf ?? new Date().toISOString(),
          answer,
        },
      ]);
    } catch (e) {
      setRetry(request);
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "No pudimos confirmar la respuesta. Puedes reintentar el mismo mensaje sin duplicarlo.",
      );
    } finally {
      busy.current = false;
      setPending(false);
      input.current?.focus({ preventScroll: true });
    }
  }
  async function fresh() {
    if (pending) return;
    if (
      messages.length &&
      !(await confirm({
        title: "Nueva conversación",
        message: "Comenzaremos una nueva conversación con Bell.",
        confirmLabel: "Comenzar",
      }))
    )
      return;
    sessionStorage.removeItem(STORAGE);
    sessionStorage.removeItem(PENDING);
    setMessages([]);
    setConversationId(null);
    setRetry(null);
    setError("");
    setDraft("");
    input.current?.focus();
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send(draft);
  }
  return (
    <div className="assistant-root">
      {open && (
        <section
          className={styles.chat}
          role="dialog"
          aria-modal="false"
          aria-labelledby="bell-title"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <header className={styles.header}>
            <Avatar compact />
            <div>
              <h2 id="bell-title">Bell · GreenBel</h2>
              <span>Asistente virtual</span>
            </div>
            <button
              type="button"
              onClick={() => void fresh()}
              disabled={pending}
              aria-label="Nueva conversación"
            >
              <Plus size={19} />
            </button>
            <button type="button" onClick={close} aria-label="Cerrar chat">
              <X size={19} />
            </button>
          </header>
          <div
            className={styles.history}
            role="log"
            aria-label="Conversación con Bell"
            aria-live="polite"
            aria-relevant="additions text"
          >
            <div className={styles.welcome}>
              <span className={styles.kicker}>Bienvenido a GreenBel</span>
              <p>
                Hola, soy Bell. Puedo ayudarte a consultar productos, precios y
                la información confirmada de GreenBel.
              </p>
            </div>
            {loading && (
              <p className={styles.status}>
                <Loader2 size={17} className={styles.spin} />
                Abriendo conversación…
              </p>
            )}
            {!messages.length && !loading && (
              <div className={styles.suggestions}>
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={s}
                    disabled={!ready || pending}
                    onClick={() => void send(s)}
                  >
                    {s}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            )}
            {messages.map((message) => (
              <article
                key={message.id}
                className={message.role === "user" ? styles.user : styles.bot}
                aria-label={
                  message.role === "user" ? "Tu mensaje" : "Respuesta de Bell"
                }
              >
                <span className={styles.speaker}>
                  {message.role === "user" ? "Tú" : "Bell"}
                </span>
                <p>{message.content}</p>
                {!!message.answer?.products.length && (
                  <div className={styles.products}>
                    {message.answer.products.map((p) => (
                      <Link
                        key={p.id}
                        href={`/productos/${p.slug}`}
                        className={styles.product}
                        onClick={close}
                      >
                        <Image
                          src={p.image}
                          alt={p.name}
                          width={64}
                          height={64}
                          unoptimized
                        />
                        <div>
                          <small>
                            {p.brand} · {p.sku}
                          </small>
                          <strong>{p.name}</strong>
                          <span className={styles.price}>
                            {p.price === null
                              ? "Precio próximamente"
                              : new Intl.NumberFormat("es-GT", {
                                  style: "currency",
                                  currency: "GTQ",
                                }).format(p.price)}
                            {p.price !== null &&
                              p.regularPrice !== null &&
                              p.regularPrice > p.price && (
                                <del>
                                  {new Intl.NumberFormat("es-GT", {
                                    style: "currency",
                                    currency: "GTQ",
                                  }).format(p.regularPrice)}
                                </del>
                              )}
                          </span>
                          <small>
                            {p.availability === "available"
                              ? "Disponible"
                              : p.availability === "unavailable"
                                ? "Agotado"
                                : "Existencia por confirmar"}
                          </small>
                        </div>
                        <ArrowUpRight size={16} />
                      </Link>
                    ))}
                  </div>
                )}
                {!!message.answer?.products.length && (
                  <small className={styles.asOf}>
                    Precio consultado al responder. Confirma la disponibilidad
                    con GreenBel.
                  </small>
                )}
                {!!message.answer?.links.length && (
                  <div className={styles.links}>
                    {message.answer.links.map((link) => (
                      <Link href={link.href} key={link.href} onClick={close}>
                        {link.label}
                        <ArrowUpRight size={14} />
                      </Link>
                    ))}
                  </div>
                )}
                {!!message.answer?.sources.length && (
                  <small className={styles.sources}>
                    Fuente:{" "}
                    {message.answer.sources
                      .map((s) =>
                        s.type === "catalog"
                          ? "catálogo vigente"
                          : s.type === "orders"
                            ? "tus pedidos"
                            : "información de GreenBel",
                      )
                      .filter((s, i, a) => a.indexOf(s) === i)
                      .join(", ")}
                  </small>
                )}
              </article>
            ))}
            {pending && (
              <p className={styles.status} role="status">
                <Loader2 size={17} className={styles.spin} />
                Consultando información de GreenBel…
              </p>
            )}
            {error && (
              <div role="alert" className={styles.error}>
                <p>{error}</p>
                {retry ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void send(retry.message, retry)}
                  >
                    Reintentar mensaje
                  </button>
                ) : (
                  !ready && (
                    <button type="button" onClick={() => void load()}>
                      Reintentar conexión
                    </button>
                  )
                )}
              </div>
            )}
            <div ref={end} />
          </div>
          <nav className={styles.quick} aria-label="Accesos de GreenBel">
            <Link href="/productos" onClick={close}>
              <Leaf size={15} />
              Productos
            </Link>
            <Link href="/carrito" onClick={close}>
              <ShoppingBag size={15} />
              Carrito
            </Link>
            <Link href="/contacto" onClick={close}>
              <MessageCircle size={15} />
              Contacto
            </Link>
          </nav>
          <form className={styles.composer} onSubmit={submit}>
            <label className={styles.srOnly} htmlFor="bell-message">
              Mensaje para Bell
            </label>
            <textarea
              id="bell-message"
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribe tu consulta…"
              maxLength={1000}
              rows={2}
              disabled={!ready || pending}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              disabled={!ready || pending || !draft.trim()}
              aria-label="Enviar mensaje"
            >
              {pending ? (
                <Loader2 size={19} className={styles.spin} />
              ) : (
                <Send size={19} />
              )}
            </button>
          </form>
          <p className={styles.privacy}>
            Evita datos sensibles. Historial privado hasta 30 días.
          </p>
        </section>
      )}
      {!open && (
        <button
          type="button"
          ref={launcher}
          className="assistant-launcher"
          onClick={() => setOpen(true)}
          aria-label="Abrir chat con Bell"
          aria-expanded={false}
        >
          <span className="assistant-greeting">¿Qué deseas encontrar?</span>
          <Avatar />
        </button>
      )}
    </div>
  );
}
