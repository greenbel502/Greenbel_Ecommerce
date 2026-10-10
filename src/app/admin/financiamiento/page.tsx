import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import styles from "../inbox.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Borradores de financiamiento", robots: { index: false, follow: false } };

const PAGE_SIZE = 50;
type FinanceRow = {
  id: string;
  quote_id: string;
  applicant_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  consent_to_share: boolean;
  consent_version: string | null;
  consent_at: string | null;
  stage: string;
  created_at: string;
};
type QuoteReference = { id: string; reference: string };

function pageNumber(value: string | undefined): number {
  if (!value || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  return Math.min(Number(value), 1000);
}

function time(value: string): string {
  return new Date(value).toLocaleString("es-GT", { timeZone: "America/Guatemala" });
}

export default async function FinancingAdminPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <div className={styles.shell}><p className={styles.error} role="alert">No se pudo verificar el acceso a financiamiento.</p></div>;
  }

  const page = pageNumber((await searchParams).page);
  let rows: FinanceRow[];
  let count: number | null;
  let references: Map<string, string>;
  try {
    const admin = createSupabaseAdminClient();
    const result = await admin.from("financing_requests")
      .select("id,quote_id,applicant_name,email,phone,message,consent_to_share,consent_version,consent_at,stage,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (result.error) throw new Error("Private finance read failed");
    rows = (result.data ?? []) as FinanceRow[];
    count = result.count;
    const ids = [...new Set(rows.map((row) => row.quote_id))];
    if (ids.length > 0) {
      const quoteResult = await admin.from("quotes").select("id,reference").in("id", ids);
      if (quoteResult.error) throw new Error("Quote reference read failed");
      references = new Map(((quoteResult.data ?? []) as QuoteReference[]).map((quote) => [quote.id, quote.reference]));
    } else {
      references = new Map();
    }
  } catch {
    return <div className={styles.shell}><p className={styles.error} role="alert">No se pudieron consultar los borradores privados. Inténtalo más tarde.</p></div>;
  }

  return <main className={styles.shell}>
    <div className={styles.hero}>
      <div><span className="eyebrow">Panel administrativo</span><h1>Borradores de financiamiento</h1><p>Lectura privada de solicitudes vinculadas a una cotización emitida. La verificación de correo y el envío a la cooperativa siguen pausados.</p></div>
      <nav className={styles.nav} aria-label="Otras áreas administrativas">
        <Link href="/admin/catalogo">Catálogo</Link>
        <Link href="/admin/consultas">Consultas registradas</Link>
      </nav>
    </div>
    <p className={styles.notice}>Solo administradores pueden ver estos borradores. Esta vista no verifica correos, envía solicitudes ni cambia estados.</p>
    {rows.length === 0 ? <p>No hay borradores en esta página.</p> : <div className={styles.list}>
      {rows.map((row) => <article className={styles.card} key={row.id}>
        <div className={styles.cardHeader}><h2>{row.applicant_name}</h2><time dateTime={row.created_at}>{time(row.created_at)}</time></div>
        <div className={styles.meta}>
          <span>Cotización: {references.get(row.quote_id) ?? "Referencia no disponible"}</span>
          <a href={`/api/admin/cotizaciones/${row.quote_id}/pdf`}>Descargar PDF privado</a>
          <span>Correo: {row.email}</span>
          {row.phone && <span>Teléfono: {row.phone}</span>}
        </div>
        {row.message && <p className={styles.message}>{row.message}</p>}
        <div className={styles.meta}>
          <span>Consentimiento: {row.consent_to_share && row.consent_version && row.consent_at
            ? `registrado (${row.consent_version}, ${time(row.consent_at)})` : "no registrado"}</span>
        </div>
        <span className={styles.tag}>{row.stage === "draft" ? "Borrador · sin verificación ni envío" : "Estado no disponible"}</span>
      </article>)}
    </div>}
    <nav className={styles.pager} aria-label="Páginas de borradores">
      {page > 1 && <Link href={`/admin/financiamiento?page=${page - 1}`}>Anterior</Link>}
      <span>Página {page}{count !== null ? ` · ${count} borradores` : ""}</span>
      {(count !== null ? page * PAGE_SIZE < count : rows.length === PAGE_SIZE) &&
        <Link href={`/admin/financiamiento?page=${page + 1}`}>Siguiente</Link>}
    </nav>
  </main>;
}
