import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import styles from "./quotes-admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cotizaciones registradas", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;
const MAX_PAGE = 1000;
const LINE_BATCH_SIZE = 1000;
const MAX_LINES_PER_PAGE = 10_000;

type QuoteRow = {
  id: string;
  reference: string;
  customer_name: string;
  customer_email: string | null;
  stage: "generating" | "issued" | "failed";
  currency: string;
  subtotal: string | number | null;
  discount_total: string | number | null;
  merchandise_total: string | number | null;
  included_iva_amount: string | number | null;
  shipping_status: "included" | "excluded" | "pending";
  shipping_fee: string | number | null;
  shipping_description: string | null;
  customer_total: string | number | null;
  issued_at: string | null;
  created_at: string;
};

type QuoteItemRow = {
  id: string;
  quote_id: string;
  line_no: number;
  sku_snapshot: string;
  name_snapshot: string;
  quantity: string | number;
  regular_unit_price: string | number;
  discount_unit: string | number;
  final_unit_price: string | number;
  line_total: string | number;
};

function parsePage(value: string | undefined): number {
  if (!value || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  return Math.min(Number(value), MAX_PAGE);
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("es-GT", { timeZone: "America/Guatemala" });
}

function amount(value: string | number | null, currency: string): string {
  if (value === null) return "Pendiente";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Importe no disponible";
  try {
    return new Intl.NumberFormat("es-GT", { style: "currency", currency: currency.trim() }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency.trim()}`;
  }
}

function stageLabel(stage: QuoteRow["stage"]): string {
  return { generating: "Generando PDF", issued: "Emitida", failed: "Fallida" }[stage];
}

function shippingLabel(status: QuoteRow["shipping_status"]): string {
  return { included: "Incluido en cotización", excluded: "Excluido del total", pending: "Pendiente de cotizar" }[status];
}

function Amounts({ quote }: { quote: QuoteRow }) {
  const transport = quote.shipping_status === "excluded" ? "Excluido del total"
    : quote.shipping_status === "pending" ? "Pendiente de cotizar"
      : amount(quote.shipping_fee, quote.currency);
  const values: Array<[string, string]> = [
    ["Subtotal de productos", amount(quote.subtotal, quote.currency)],
    ["Descuento", amount(quote.discount_total, quote.currency)],
    ["Mercadería", amount(quote.merchandise_total, quote.currency)],
    ["IVA incluido en productos", amount(quote.included_iva_amount, quote.currency)],
    ["Transporte", transport],
    ["Total cliente", amount(quote.customer_total, quote.currency)]
  ];
  return <dl className={styles.amounts}>
    {values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function QuoteCard({ quote, lines }: { quote: QuoteRow; lines: QuoteItemRow[] }) {
  return <details className={styles.card}>
    <summary>
      <span><strong>{quote.reference}</strong><small>{quote.customer_name}</small></span>
      <span className={styles.summaryMeta}><span className={styles.tag}>{stageLabel(quote.stage)}</span><time dateTime={quote.created_at}>{dateTime(quote.created_at)}</time></span>
    </summary>
    <div className={styles.cardBody}>
      <div className={styles.meta}>
        <p><strong>Cliente:</strong> {quote.customer_name}{quote.customer_email ? ` · ${quote.customer_email}` : " · Sin correo registrado"}</p>
        <p><strong>Transporte:</strong> {shippingLabel(quote.shipping_status)}{quote.shipping_description ? ` · ${quote.shipping_description}` : ""}</p>
        {quote.issued_at && <p><strong>Emitida:</strong> <time dateTime={quote.issued_at}>{dateTime(quote.issued_at)}</time></p>}
      </div>
      <Amounts quote={quote} />
      <section className={styles.linesSection} aria-label={`Líneas históricas de ${quote.reference}`}>
        <h3>Líneas históricas</h3>
        {lines.length === 0 ? <p>No hay líneas registradas para esta etapa.</p> : <ol className={styles.lines}>{lines.map((line) => <li key={line.id}>
          <div className={styles.lineTitle}><strong>{line.line_no}. {line.name_snapshot}</strong><small>{line.sku_snapshot}</small></div>
          <dl><div><dt>Cantidad</dt><dd>{Number(line.quantity).toLocaleString("es-GT")}</dd></div>
            <div><dt>Precio regular/u</dt><dd>{amount(line.regular_unit_price, quote.currency)}</dd></div>
            <div><dt>Descuento/u</dt><dd>{amount(line.discount_unit, quote.currency)}</dd></div>
            <div><dt>Precio final/u</dt><dd>{amount(line.final_unit_price, quote.currency)}</dd></div>
            <div><dt>Total línea</dt><dd>{amount(line.line_total, quote.currency)}</dd></div></dl>
        </li>)}</ol>}
      </section>
      {quote.stage === "issued" ? (
        <a className={styles.download} href={`/api/admin/cotizaciones/${encodeURIComponent(quote.id)}/pdf`}>Descargar PDF privado</a>
      ) : <p className={styles.noPdf}>No hay un PDF emitido para esta etapa.</p>}
    </div>
  </details>;
}

export default async function QuoteAdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <div className={styles.shell}><p className={styles.error} role="alert">No se pudo verificar el acceso a cotizaciones.</p></div>;
  }

  const page = parsePage((await searchParams).page);
  let quotes: QuoteRow[];
  const lines: QuoteItemRow[] = [];
  let count: number;
  try {
    const admin = createSupabaseAdminClient();
    const quoteResult = await admin.from("quotes")
      .select("id,reference,customer_name,customer_email,stage,currency,subtotal,discount_total,merchandise_total,included_iva_amount,shipping_status,shipping_fee,shipping_description,customer_total,issued_at,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (quoteResult.error || quoteResult.count === null) throw new Error("Private quote read failed");
    quotes = (quoteResult.data ?? []) as QuoteRow[];
    count = quoteResult.count;

    const quoteIds = quotes.map((quote) => quote.id);
    if (quoteIds.length > 0) {
      for (let offset = 0; offset < MAX_LINES_PER_PAGE; offset += LINE_BATCH_SIZE) {
        const lineResult = await admin.from("quote_items")
          .select("id,quote_id,line_no,sku_snapshot,name_snapshot,quantity,regular_unit_price,discount_unit,final_unit_price,line_total")
          .in("quote_id", quoteIds)
          .order("quote_id", { ascending: true })
          .order("line_no", { ascending: true })
          .range(offset, offset + LINE_BATCH_SIZE - 1);
        if (lineResult.error) throw new Error("Historical quote lines unavailable");
        const batch = (lineResult.data ?? []) as QuoteItemRow[];
        lines.push(...batch);
        if (batch.length < LINE_BATCH_SIZE) break;
        if (offset + LINE_BATCH_SIZE >= MAX_LINES_PER_PAGE) throw new Error("Quote line display limit reached");
      }
    }
  } catch {
    return <div className={styles.shell}><p className={styles.error} role="alert">No se pudieron consultar las cotizaciones privadas y sus líneas históricas. Inténtalo más tarde.</p></div>;
  }

  const linesByQuote = new Map<string, QuoteItemRow[]>();
  for (const line of lines) {
    const found = linesByQuote.get(line.quote_id) ?? [];
    found.push(line);
    linesByQuote.set(line.quote_id, found);
  }

  return <div className={styles.shell}>
    <header className={styles.hero}>
      <div><span className="eyebrow">Panel administrativo</span><h1>Cotizaciones registradas</h1><p>Consulta el documento emitido y sus líneas originales. Una cotización no es un pedido ni una factura y no reserva inventario.</p></div>
      <Link href="/admin/catalogo" className={styles.back}>Catálogo</Link>
    </header>
    <p className={styles.notice}>Lectura privada para administradores. El PDF se descarga mediante una ruta protegida; esta vista no expone tokens ni rutas de almacenamiento.</p>
    {quotes.length === 0 ? <p className={styles.empty}>No hay cotizaciones en esta página.</p> : (
      <div className={styles.list}>{quotes.map((quote) => <QuoteCard key={quote.id} quote={quote} lines={linesByQuote.get(quote.id) ?? []} />)}</div>
    )}
    <nav className={styles.pager} aria-label="Páginas de cotizaciones">
      {page > 1 && <Link href={`/admin/cotizaciones?page=${page - 1}`}>Anterior</Link>}
      <span>Página {page} · {count} cotización{count === 1 ? "" : "es"}</span>
      {page < MAX_PAGE && page * PAGE_SIZE < count && <Link href={`/admin/cotizaciones?page=${page + 1}`}>Siguiente</Link>}
    </nav>
    {count > MAX_PAGE * PAGE_SIZE && <p className={styles.notice}>La vista está limitada a las primeras {MAX_PAGE} páginas. Amplía la consulta para revisar registros posteriores.</p>}
  </div>;
}
