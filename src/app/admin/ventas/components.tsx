import Link from "next/link";
import type { StaffRole } from "@/lib/server/staff-authorization";
import styles from "./sales.module.css";

export function SalesNavigation({ role }: { role: StaffRole }) {
  void role;
  return null;
}

export function SalesUnavailable({ detail = false }: { detail?: boolean }) {
  return (
    <div className={styles.shell}>
      <span className="eyebrow">Panel administrativo</span>
      <h1>{detail ? "Detalle de venta" : "Ventas y posventa"}</h1>
      <p className={styles.alert} role="alert">
        No se pudo cargar la información. Inténtalo de nuevo en unos momentos.
      </p>
      <Link href="/admin/ventas" className="inline-link">
        Volver a ventas
      </Link>
    </div>
  );
}
