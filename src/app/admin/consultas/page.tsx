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

  const state = listState(await searchParams, "", adminLists.contacts);
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

  return (
    <div className={styles.shell}>
      <div className={styles.hero}>
        <div>
          <span className="eyebrow">Panel administrativo</span>
          <h1>Consultas registradas</h1>
          <p>
            Lectura privada de formularios de contacto. La notificación por
            correo permanece pausada; un registro no indica que GreenBel haya
            recibido un correo.
          </p>
        </div>
        <nav className={styles.nav} aria-label="Otras áreas administrativas">
          <Link href="/admin/catalogo">Catálogo</Link>
          <Link href="/admin/financiamiento">Borradores de financiamiento</Link>
        </nav>
      </div>
      <p className={styles.notice}>
        Solo administradores pueden ver estos datos. No se envían mensajes ni se
        cambia el estado desde esta vista.
      </p>
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
                {row.notification_status === "not_sent"
                  ? "Sin notificación por correo"
                  : "Estado de correo no disponible"}
              </span>
            </article>
          ))}
        </div>
      )}
      <ListPager state={state} path="/admin/consultas" />
    </div>
  );
}
