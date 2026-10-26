import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import styles from "../inbox.module.css";
import { GmailConnection } from "./gmail-connection";
import {
  readContactNotificationStates,
  type NotificationStatus,
} from "@/lib/gmail/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Consultas recibidas",
  robots: { index: false, follow: false },
};

type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  inquiry_type: string | null;
  product: string | null;
  message: string;
  notification_status: string;
  created_at: string;
};

function time(value: string): string {
  return new Date(value).toLocaleString("es-GT", {
    timeZone: "America/Guatemala",
  });
}

export default async function ContactAdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "unauthenticated"
    )
      redirect("/cuenta/ingresar");
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "forbidden"
    )
      notFound();
    return (
      <div className={styles.shell}>
        <p className={styles.error} role="alert">
          No se pudo verificar el acceso a consultas.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const state = listState(params, "", adminLists.contacts);
  let rows: ContactRow[];
  try {
    const result = await queryAdminList<ContactRow>(
      createSupabaseAdminClient(),
      "contact_messages",
      "id,name,email,phone,inquiry_type,product,message,notification_status,created_at",
      state,
      adminLists.contacts,
    );
    rows = (result.data ?? []) as ContactRow[];
  } catch {
    return (
      <div className={styles.shell}>
        <p className={styles.error} role="alert">
          No se pudieron consultar los registros privados. Inténtalo más tarde.
        </p>
      </div>
    );
  }

  let notifications: NotificationStatus[] = [];
  try {
    notifications = await readContactNotificationStates(
      rows.map((row) => row.id),
    );
  } catch {
    /* Contact records remain visible if notification tracking is temporarily unavailable. */
  }
  const notificationById = new Map(notifications.map((n) => [n.contact_id, n]));
  const notificationLabel: Record<string, string> = {
    not_sent: "Sin notificación por correo",
    pending: "Notificación pendiente",
    sending: "Envío en proceso; no reenviar",
    sent: "Notificación aceptada por Gmail",
    failed: "Notificación fallida; consulta guardada",
    unknown:
      "Resultado sin confirmar: revisa Gmail. No se reenviará automáticamente.",
  };
  return (
    <div className={styles.shell}>
      <div className={styles.hero}>
        <div>
          <span className="eyebrow">Panel administrativo</span>
          <h1>Consultas registradas</h1>
          <p>
            Consultas guardadas desde el formulario de contacto y estado de sus
            notificaciones por Gmail.
          </p>
        </div>
        <nav className={styles.nav} aria-label="Otras áreas administrativas">
          <Link href="/admin/catalogo">Catálogo</Link>
          <Link href="/admin/financiamiento">Borradores de financiamiento</Link>
        </nav>
      </div>
      <p className={styles.notice}>
        Solo administradores pueden ver estos datos. Las consultas permanecen
        guardadas aunque falle una notificación. Conectar Gmail no envía
        registros históricos.
      </p>
      <GmailConnection
        result={typeof params.gmail === "string" ? params.gmail : undefined}
      />
      <ListTools
        state={state}
        config={adminLists.contacts}
        path="/admin/consultas"
      />
      {rows.length === 0 ? (
        <ListEmpty state={state} path="/admin/consultas" />
      ) : (
        <div className={styles.list}>
          {rows.map((row) => (
            <article className={styles.card} key={row.id}>
              <div className={styles.cardHeader}>
                <h2>{row.name}</h2>
                <time dateTime={row.created_at}>{time(row.created_at)}</time>
              </div>
              <div className={styles.meta}>
                <span>Correo: {row.email}</span>
                {row.phone && <span>Teléfono: {row.phone}</span>}
                {row.inquiry_type && <span>Tipo: {row.inquiry_type}</span>}
                {row.product && <span>Producto: {row.product}</span>}
              </div>
              <p className={styles.message}>{row.message}</p>
              <span className={styles.tag}>
                {row.notification_status === "sending" &&
                notificationById.get(row.id)?.last_attempt_at &&
                Date.now() -
                  Date.parse(notificationById.get(row.id)!.last_attempt_at!) >
                  120_000
                  ? notificationLabel.unknown
                  : (notificationLabel[row.notification_status] ??
                    "Estado de correo no disponible")}
              </span>
              {["sending", "unknown"].includes(row.notification_status) && (
                <p>
                  <small>Referencia para revisar en Gmail: {row.id}</small>
                </p>
              )}
              {["failed", "pending"].includes(row.notification_status) &&
                notificationById.has(row.id) && (
                  <form
                    action="/api/integrations/gmail/retry"
                    method="post"
                    className={styles.gmailRetry}
                  >
                    <input type="hidden" name="contactId" value={row.id} />
                    <button
                      type="submit"
                      className="secondary-dark-button"
                      disabled={
                        notificationById.get(row.id)!.attempts >= 5 ||
                        !!(
                          notificationById.get(row.id)!.next_retry_at &&
                          Date.parse(
                            notificationById.get(row.id)!.next_retry_at!,
                          ) > Date.now()
                        )
                      }
                    >
                      Reintentar notificación
                    </button>
                    <small>
                      Hasta cinco intentos, con espera entre reintentos. Si la
                      autorización venció, reconecta Gmail primero.
                    </small>
                  </form>
                )}
            </article>
          ))}
        </div>
      )}
      <ListPager state={state} path="/admin/consultas" />
    </div>
  );
}
