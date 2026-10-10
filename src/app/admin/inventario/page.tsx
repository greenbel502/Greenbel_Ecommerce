import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { InventoryForm, type InventoryProductOption } from "./inventory-form";
import styles from "./inventory.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inventario", robots: { index: false, follow: false } };

type BalanceRow = { product_id: string; stock_balance: number | string; reserved: number | string };
type MovementRow = {
  id: string;
  product_id: string;
  kind: string;
  quantity_delta: number | string;
  reason: string;
  reference: string | null;
  created_at: string;
};

function formatUnits(value: number | string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("es-GT", { maximumFractionDigits: 3 }) : "—";
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("es-GT", { timeZone: "America/Guatemala" });
}

export default async function InventoryAdminPage() {
  let isAdmin = false;
  try {
    isAdmin = (await requireStaffActor(["operator", "admin"])).role === "admin";
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <div className={styles.shell}><p role="alert">No se pudo verificar el acceso al inventario. Inténtalo más tarde.</p></div>;
  }

  let products: InventoryProductOption[] = [];
  let balances: BalanceRow[] = [];
  let movements: MovementRow[] = [];
  try {
    const admin = createSupabaseAdminClient();
    const [productsResult, movementsResult] = await Promise.all([
      admin.from("products").select("id,sku,name").order("name").limit(1000),
      admin.from("inventory_movements")
        .select("id,product_id,kind,quantity_delta,reason,reference,created_at")
        .order("created_at", { ascending: false }).limit(30)
    ]);
    if (productsResult.error || movementsResult.error) throw new Error("Admin read unavailable");
    products = (productsResult.data ?? []) as InventoryProductOption[];
    movements = (movementsResult.data ?? []) as MovementRow[];
    if (products.length > 0) {
      const balanceResult = await admin.from("inventory_balances")
        .select("product_id,stock_balance,reserved")
        .in("product_id", products.map((product) => product.id));
      if (balanceResult.error) throw new Error("Balance read unavailable");
      balances = (balanceResult.data ?? []) as BalanceRow[];
    }
  } catch {
    return <div className={styles.shell}><p role="alert">Los datos de inventario no están disponibles en este momento.</p></div>;
  }

  const productNames = new Map(products.map((product) => [product.id, `${product.sku} · ${product.name}`]));
  const balanceByProduct = new Map(balances.map((balance) => [balance.product_id, balance]));

  return (
    <div className={styles.shell}>
      <div className={styles.heading}>
        <div><span className="eyebrow">Panel administrativo</span><h1>Inventario compartido</h1><p>Entradas, ajustes y ventas físicas afectan la misma existencia que usarán los pedidos web.</p></div>
        <div className={styles.headingLinks}>
          <Link href="/admin/ventas" className="secondary-dark-button">Ventas y posventa</Link>
          {isAdmin && <Link href="/admin/catalogo" className="secondary-dark-button">Volver al catálogo</Link>}
        </div>
      </div>
      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="inventory-form-title">
          <h2 id="inventory-form-title">Nuevo movimiento</h2>
          <InventoryForm products={products} initialKey={randomUUID()} />
        </section>
        <section className={styles.card} aria-labelledby="inventory-balance-title">
          <h2 id="inventory-balance-title">Existencias</h2>
          <p className={styles.help}>Sin registro de balance significa existencia todavía no verificada; no se interpreta como cero.</p>
          {products.length === 0 ? <p>No hay productos cargados.</p> : (
            <div className={styles.tableWrap}><table><thead><tr><th>Producto</th><th>Existencia</th><th>Reservado</th><th>Disponible</th></tr></thead><tbody>
              {products.map((product) => {
                const balance = balanceByProduct.get(product.id);
                return <tr key={product.id}><th scope="row">{product.sku} · {product.name}</th><td>{balance ? formatUnits(balance.stock_balance) : "No verificada"}</td><td>{balance ? formatUnits(balance.reserved) : "—"}</td><td>{balance ? formatUnits(Number(balance.stock_balance) - Number(balance.reserved)) : "—"}</td></tr>;
              })}
            </tbody></table></div>
          )}
        </section>
      </div>
      <section className={styles.card} aria-labelledby="inventory-history-title">
        <h2 id="inventory-history-title">Movimientos recientes</h2>
        {movements.length === 0 ? <p>Sin movimientos registrados.</p> : (
          <div className={styles.tableWrap}><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cambio</th><th>Motivo y referencia</th></tr></thead><tbody>
            {movements.map((movement) => <tr key={movement.id}><td>{formatTime(movement.created_at)}</td><th scope="row">{productNames.get(movement.product_id) ?? movement.product_id}</th><td>{movement.kind}</td><td>{formatUnits(movement.quantity_delta)}</td><td>{movement.reason}{movement.reference ? ` · ${movement.reference}` : ""}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
      {products.length === 1000 && <p className={styles.help}>Se muestran hasta 1,000 productos; consulta el catálogo para localizar otros registros.</p>}
    </div>
  );
}
