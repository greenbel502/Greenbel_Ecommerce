import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import styles from "../inbox.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consultas recibidas", robots: { index: false, follow: false } };

const PAGE_SIZE = 50;
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

function pageNumber(value: string | undefined): number {
  if (!value || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  return Math.min(Number(value), 1000);
}

function time(value: string): string {
  return new Date(value).toLocaleString("es-GT", { timeZone: "America/Guatemala" });
}

export default async function ContactAdminPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <div className={styles.shell}><p className={styles.error} role="alert">No se pudo verificar el acceso a consultas.</p></div>;
  }

  const page = pageNumber((await searchParams).page);
  let rows: ContactRow[];
  let count: number | null;
  try {
    const result = await createSupabaseAdminClient().from("contact_messages")
      .select("id,name,email,phone,inquiry_type,product,message,notification_status,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (result.error) throw new Error("Private contact read failed");
    rows = (result.data ?? []) as ContactRow[];
    count = result.count;
  } catch {
    return <div className={styles.shell}><p className={styles.error} role="alert">No se pudieron consultar los registros privados. Inténtalo más tarde.</p></div>;
  }

  return <main className={styles.shell}>
    <div className={styles.hero}>
      <div><span className="eyebrow">Panel administrativo</span><h1>Consultas registradas</h1><p>Lectura privada de formularios de contacto. La notificación por correo permanece pausada; un registro no indica que GreenBel haya recibido un correo.</p></div>
      <nav className={styles.nav} aria-label="Otras áreas administrativas">
        <Link href="/admin/catalogo">Catálogo</Link>
        <Link href="/admin/financiamiento">Borradores de financiamiento</Link>
      </nav>
    </div>
    <p className={styles.notice}>Solo administradores pueden ver estos datos. No se envían mensajes ni se cambia el estado desde esta vista.</p>
    {rows.length === 0 ? <p>No hay consultas en esta página.</p> : <div className={styles.list}>
      {rows.map((row) => <article className={styles.card} key={row.id}>
        <div className={styles.cardHeader}><h2>{row.name}</h2><time dateTime={row.created_at}>{time(row.created_at)}</time></div>
        <div className={styles.meta}>
          <span>Correo: {row.email}</span>
          {row.phone && <span>Teléfono: {row.phone}</span>}
          {row.inquiry_type && <span>Tipo: {row.inquiry_type}</span>}
          {row.product && <span>Producto: {row.product}</span>}
        </div>
        <p className={styles.message}>{row.message}</p>
        <span className={styles.tag}>{row.notification_status === "not_sent" ? "Sin notificación por correo" : "Estado de correo no disponible"}</span>
      </article>)}
    </div>}
    <nav className={styles.pager} aria-label="Páginas de consultas">
      {page > 1 && <Link href={`/admin/consultas?page=${page - 1}`}>Anterior</Link>}
      <span>Página {page}{count !== null ? ` · ${count} registros` : ""}</span>
      {(count !== null ? page * PAGE_SIZE < count : rows.length === PAGE_SIZE) &&
        <Link href={`/admin/consultas?page=${page + 1}`}>Siguiente</Link>}
    </nav>
  </main>;
}
