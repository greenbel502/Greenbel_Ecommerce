"use client";
import {
  useActionState,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  BookOpen,
  MessageCircle,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Save,
  Eye,
  CheckCircle2,
  Clock3,
  AlertCircle,
} from "lucide-react";
import { CatalogDrawer } from "../catalogo/catalog-drawer";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import {
  notify,
  useNotificationFeedback,
} from "@/presentation/notifications/notify";
import {
  knowledgeCategories,
  type KnowledgeRow,
  type ConversationRow,
  type ChatMetrics,
} from "@/lib/chatbot/admin-types";
import type { ChatMessage } from "@/lib/chatbot/types";
import {
  saveKnowledge,
  chatbotAdminCommand,
  type ChatAdminState,
} from "./actions";
import styles from "./chatbot.module.css";
const idle: ChatAdminState = { status: "idle", message: "" };
const paths = {
  "/nosotros": "Nosotros",
  "/productos": "Productos",
  "/carrito": "Carrito",
  "/contacto": "Contacto",
  "/financiamiento": "Financiamiento",
  "/capacitaciones": "Capacitaciones",
  "/legal/privacidad": "Privacidad",
  "/legal/terminos": "Términos",
  "/legal/garantias": "Garantías",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Guatemala",
  }).format(new Date(value));
const indexing = {
  pending: "Pendiente",
  ready: "Indexado",
  error: "Con error",
};
function KnowledgeEditor({
  row,
  onClose,
  onSaved,
}: {
  row: KnowledgeRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(saveKnowledge, idle),
    [dirty, setDirty] = useState(false);
  const confirm = useConfirm();
  const [verified, setVerified] = useState(row?.verified ?? false),
    [active, setActive] = useState(row?.is_active ?? false);
  useNotificationFeedback(state.status, state.message);
  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [state, onSaved]);
  async function close() {
    if (
      !dirty ||
      (await confirm({
        title: "Descartar cambios",
        message: "Tienes cambios sin guardar en esta respuesta.",
        confirmLabel: "Descartar",
      }))
    )
      onClose();
  }
  return (
    <CatalogDrawer
      id="bell-knowledge-editor"
      title={row ? "Editar respuesta" : "Nueva respuesta"}
      kicker="Conocimiento de Bell"
      closeLabel="Cerrar editor"
      busy={pending}
      onClose={() => void close()}
      returnFocusId={row ? `knowledge-${row.id}` : "new-knowledge"}
    >
      <form
        action={action}
        className={styles.form}
        onChange={() => setDirty(true)}
      >
        <input type="hidden" name="id" value={row?.id ?? ""} />
        <input type="hidden" name="expected" value={row?.updated_at ?? ""} />
        <div className={styles.content}>
          <p className={styles.help}>
            * Campos obligatorios. Publica información corroborada; Bell
            consulta los precios y las existencias directamente en el catálogo.
          </p>
          <section>
            <h3>
              <BookOpen size={19} />
              Pregunta y respuesta
            </h3>
            <label>
              Pregunta habitual *
              <input
                name="question"
                required
                minLength={5}
                maxLength={240}
                defaultValue={row?.question}
                placeholder="Ej. ¿Cómo solicito financiamiento?"
              />
            </label>
            <label>
              Respuesta de GreenBel *
              <textarea
                name="answer"
                required
                minLength={10}
                maxLength={4000}
                rows={7}
                defaultValue={row?.answer}
              />
            </label>
            <label>
              Categoría *
              <select
                name="category"
                defaultValue={row?.category ?? "greenbel"}
              >
                {Object.entries(knowledgeCategories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Palabras relacionadas
              <input
                name="keywords"
                maxLength={500}
                defaultValue={row?.keywords}
                placeholder="Ej. crédito cooperativa financiar"
              />
            </label>
          </section>
          <section>
            <h3>
              <CheckCircle2 size={19} />
              Fuente y revisión
            </h3>
            <label>
              Página de referencia *
              <select
                name="sourcePath"
                defaultValue={row?.source_path ?? "/contacto"}
              >
                {row?.source_path && !Object.hasOwn(paths, row.source_path) && (
                  <option value={row.source_path}>{row.source_path}</option>
                )}
                {Object.entries(paths).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Respaldo de esta información *
              <textarea
                name="sourceNote"
                minLength={5}
                maxLength={500}
                required
                rows={3}
                defaultValue={row?.source_note}
                placeholder="Indica la política o documento aprobado que respalda esta respuesta."
              />
            </label>
            <p className={styles.help}>
              Esta nota es privada; el cliente solo ve la respuesta y su página
              de referencia.
            </p>
            <label className={styles.check}>
              <input
                type="checkbox"
                name="verified"
                checked={verified}
                onChange={(e) => {
                  setVerified(e.target.checked);
                  if (!e.target.checked) setActive(false);
                }}
              />
              <span>He comprobado que la información es correcta.</span>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                name="active"
                checked={active}
                disabled={!verified}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>Habilitar esta respuesta en Bell.</span>
            </label>
          </section>
          <div className={styles.notice}>
            <Clock3 size={18} />
            <p>
              La búsqueda textual se actualiza al guardar. Los embeddings quedan
              pendientes hasta configurar y comprobar un motor real.
            </p>
          </div>
          {state.status === "error" && (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.secondary}
            disabled={pending}
            onClick={() => void close()}
          >
            Cancelar
          </button>
          <button className={styles.primary} disabled={pending}>
            <Save size={17} />
            {pending ? "Guardando…" : "Guardar respuesta"}
          </button>
        </footer>
      </form>
    </CatalogDrawer>
  );
}
function ConversationDetail({
  row,
  onClose,
}: {
  row: ConversationRow;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/chatbot/conversations?id=${row.id}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        }),
        data = await r.json();
      if (!r.ok) throw Error("No se pudo consultar la conversación.");
      setMessages(data.messages);
    } catch {
      setError("No se pudo cargar el historial. Puedes reintentar.");
    } finally {
      setLoading(false);
    }
  }, [row.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useNotificationFeedback(error ? "error" : "idle", error);
  return (
    <CatalogDrawer
      id="bell-conversation"
      title={row.customer_name}
      kicker="Conversación privada"
      closeLabel="Cerrar conversación"
      busy={false}
      onClose={onClose}
      returnFocusId={`conversation-${row.id}`}
    >
      <div className={styles.content}>
        <p className={styles.help}>
          {date(row.created_at)} · {row.message_count} mensajes
        </p>
        <div className={styles.notice}>
          <Eye size={18} />
          <p>
            Consulta de supervisión. El historial original no se edita. Las
            preguntas sin respuesta pueden ayudarte a ampliar el conocimiento.
          </p>
        </div>
        {loading && <p role="status">Cargando conversación…</p>}
        {error && (
          <div role="alert" className={styles.error}>
            {error}
            <button className={styles.secondary} onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        )}
        <div className={styles.thread}>
          {messages.map((m) => (
            <article
              key={m.id}
              className={
                m.role === "user" ? styles.customerMessage : styles.bellMessage
              }
            >
              <span>
                {m.role === "user" ? row.customer_name : "Bell"} ·{" "}
                {date(m.createdAt)}
              </span>
              <p>{m.content}</p>
              {m.answer?.unknown && (
                <small>
                  <AlertCircle size={14} />
                  {m.answer.errorCode
                    ? "Error al consultar los datos"
                    : "Sin información confirmada"}
                </small>
              )}
              {!!m.answer?.sources?.length && (
                <small>
                  Fuentes: {m.answer.sources.map((s) => s.label).join(", ")}
                </small>
              )}
            </article>
          ))}
        </div>
      </div>
    </CatalogDrawer>
  );
}
export function ChatbotAdmin({
  tab,
  knowledge,
  conversations,
  metrics,
  controls,
  pager,
  empty,
}: {
  tab: "knowledge" | "conversations";
  knowledge: KnowledgeRow[];
  conversations: ConversationRow[];
  metrics: ChatMetrics;
  controls: ReactNode;
  pager: ReactNode;
  empty: ReactNode;
}) {
  const router = useRouter(),
    confirm = useConfirm();
  const [editor, setEditor] = useState<KnowledgeRow | null | undefined>(),
    [conversation, setConversation] = useState<ConversationRow | null>(null),
    [busy, setBusy] = useState(false);
  const saved = useCallback(() => {
    setEditor(undefined);
    router.refresh();
  }, [router]);
  async function command(
    kind: "archive" | "reindex" | "prune",
    row?: KnowledgeRow,
  ) {
    if (busy) return;
    const opts =
      kind === "archive"
        ? {
            title: "Eliminar respuesta",
            message: `«${row?.question}» dejará de utilizarse en Bell. El historial anterior se conserva.`,
            confirmLabel: "Eliminar respuesta",
          }
        : kind === "prune"
          ? {
              title: "Limpiar historial vencido",
              message:
                "Se eliminarán hasta 1,000 conversaciones con más de 30 días y sus mensajes. Esta acción no se puede deshacer.",
              confirmLabel: "Eliminar vencidas",
            }
          : {
              title: "Preparar reindexación",
              message:
                "Se invalidarán los vectores anteriores y se encolará el contenido. Sin un motor configurado, seguirá pendiente y disponible por búsqueda textual.",
              confirmLabel: "Poner en cola",
            };
    if (!(await confirm(opts))) return;
    setBusy(true);
    try {
      const result = await chatbotAdminCommand(kind, row?.id);
      notify[result.status === "success" ? "success" : "error"](result.message);
      if (result.status === "success") router.refresh();
    } catch {
      notify.error("No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.module}>
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>Asistencia al cliente</span>
          <h1>
            <Bot size={29} />
            Bell · GreenBel
          </h1>
          <p>
            Gestiona respuestas verificadas y conoce las consultas de tus
            clientes.
          </p>
        </div>
        <Link href="/" className={styles.secondary}>
          Vista pública
        </Link>
      </header>
      <div className={styles.metrics}>
        {[
          ["Conversaciones", metrics.conversations],
          ["Mensajes", metrics.messages],
          ["Consultas respondidas", metrics.answered],
          ["Sin respuesta", metrics.unknown],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className={styles.notice}>
        <CheckCircle2 size={20} />
        <p>
          <strong>Búsqueda textual activa.</strong> Catálogo en tiempo real,
          reglas y conocimiento revisado. Búsqueda semántica pendiente: no hay
          un motor de embeddings configurado.
        </p>
      </div>
      <nav className={styles.tabs} aria-label="Administración de Bell">
        <Link
          href="/admin/chatbot"
          aria-current={tab === "knowledge" ? "page" : undefined}
        >
          <BookOpen size={17} />
          Conocimiento
        </Link>
        <Link
          href="/admin/chatbot?tab=conversations"
          aria-current={tab === "conversations" ? "page" : undefined}
        >
          <MessageCircle size={17} />
          Conversaciones
        </Link>
      </nav>
      <div className={styles.listHeading}>
        <div>
          <h2>
            {tab === "knowledge"
              ? "Respuestas de Bell"
              : "Historial de conversaciones"}
          </h2>
          <p>
            {tab === "knowledge"
              ? "Solo las respuestas activas y verificadas llegan al cliente."
              : "Revisa preguntas sin respuesta y posibles fallos de consulta."}
          </p>
        </div>
        <div className={styles.actions}>
          {tab === "knowledge" ? (
            <>
              <button
                disabled={busy}
                className={styles.secondary}
                onClick={() => void command("reindex")}
              >
                <RefreshCw size={16} />
                Reindexar
              </button>
              <button
                id="new-knowledge"
                className={styles.primary}
                onClick={() => setEditor(null)}
              >
                <Plus size={17} />
                Nueva respuesta
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              className={styles.secondary}
              onClick={() => void command("prune")}
            >
              <Trash2 size={16} />
              Limpiar vencidas
            </button>
          )}
        </div>
      </div>
      {controls}
      {(tab === "knowledge" ? knowledge.length : conversations.length) ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {(tab === "knowledge"
                  ? [
                      "Pregunta",
                      "Categoría",
                      "Publicación",
                      "Indexación",
                      "Acciones",
                    ]
                  : [
                      "Conversación",
                      "Última actividad",
                      "Mensajes",
                      "Atención",
                      "Acciones",
                    ]
                ).map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab === "knowledge"
                ? knowledge.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.question}</strong>
                        <small>
                          {row.answer.slice(0, 130)}
                          {row.answer.length > 130 ? "…" : ""}
                        </small>
                      </td>
                      <td>{knowledgeCategories[row.category]}</td>
                      <td>
                        <span className={styles.badge}>
                          {!row.is_active
                            ? "Inactiva"
                            : row.verified
                              ? "Activa y verificada"
                              : "Pendiente de revisión"}
                        </span>
                      </td>
                      <td>
                        <span className={styles.badge}>
                          {indexing[row.embedding_status]}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            id={`knowledge-${row.id}`}
                            className={styles.secondary}
                            onClick={() => setEditor(row)}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                          <button
                            disabled={busy}
                            className={styles.danger}
                            onClick={() => void command("archive", row)}
                            aria-label={`Eliminar respuesta: ${row.question}`}
                          >
                            <Trash2 size={15} />
                            <span>Eliminar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : conversations.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.title}</strong>
                        <small>{row.customer_name}</small>
                      </td>
                      <td>{date(row.last_activity_at)}</td>
                      <td>{row.message_count}</td>
                      <td>
                        <span className={styles.badge}>
                          {row.has_unknown ? "Revisar consultas" : "Respondida"}
                        </span>
                      </td>
                      <td>
                        <button
                          id={`conversation-${row.id}`}
                          className={styles.secondary}
                          onClick={() => setConversation(row)}
                        >
                          <Eye size={16} />
                          Ver conversación
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      ) : (
        empty
      )}
      {pager}
      <section className={styles.insights}>
        <article>
          <h3>Temas más consultados</h3>
          {metrics.categories.length ? (
            metrics.categories.map((c) => (
              <p key={c.intent}>
                <span>
                  {(
                    {
                      products: "Productos",
                      prices: "Precios",
                      inventory: "Disponibilidad",
                      financing: "Financiamiento",
                      shipping: "Entregas",
                      payment: "Pagos",
                      orders: "Pedidos",
                      contact: "Contacto",
                      purchase: "Compras",
                      categories: "Categorías",
                      brands: "Marcas",
                      policies: "Posventa",
                      trainings: "Capacitaciones",
                      general: "GreenBel",
                      unknown: "Sin identificar",
                      promotions: "Promociones",
                    } as Record<string, string>
                  )[c.intent] ?? c.intent}
                </span>
                <strong>{c.total}</strong>
              </p>
            ))
          ) : (
            <p>Sin consultas todavía.</p>
          )}
        </article>
        <article>
          <h3>Productos mostrados</h3>
          {metrics.products.length ? (
            metrics.products.map((p) => (
              <p key={p.name}>
                <span>{p.name}</span>
                <strong>{p.total}</strong>
              </p>
            ))
          ) : (
            <p>Sin productos consultados todavía.</p>
          )}
        </article>
        <article>
          <h3>Preguntas frecuentes del historial</h3>
          {metrics.questions?.length ? (
            metrics.questions.map((q) => (
              <p key={q.question}>
                <span>{q.question}</span>
                <strong>{q.total}</strong>
              </p>
            ))
          ) : (
            <p>Sin historial todavía.</p>
          )}
          <small>
            Fallos de consulta registrados: {metrics.errors ?? 0}. Las cifras
            corresponden al historial conservado.
          </small>
        </article>
      </section>
      {editor !== undefined && (
        <KnowledgeEditor
          key={editor?.id ?? "new"}
          row={editor}
          onClose={() => setEditor(undefined)}
          onSaved={saved}
        />
      )}
      {conversation && (
        <ConversationDetail
          key={conversation.id}
          row={conversation}
          onClose={() => setConversation(null)}
        />
      )}
    </div>
  );
}
