import Link from "next/link";
import type { StaffRole } from "@/lib/server/staff-authorization";
import styles from "./sales.module.css";

export function SalesNavigation({ role }: { role: StaffRole }) {
  return (
    <nav className={styles.navigation} aria-label="Navegación administrativa">
      <Link href="/admin/ventas">Ventas y posventa</Link>
      <Link href="/admin/inventario">Inventario</Link>
      <Link href="/admin/envios">Envíos externos</Link>
      {role === "admin" && <>
        <Link href="/admin/catalogo">Catálogo</Link>
        <Link href="/admin/entregas">Configuración de entregas</Link>
        <Link href="/admin/usuarios">Usuarios</Link>
        <Link href="/admin/resenas">Reseñas</Link>
      </>}
      <Link href="/cuenta">Mi cuenta</Link>
    </nav>
  );
}

export function SalesUnavailable({ detail = false }: { detail?: boolean }) {
  return (
    <main className={styles.shell}>
      <span className="eyebrow">Panel administrativo</span>
      <h1>{detail ? "Detalle de venta" : "Ventas y posventa"}</h1>
      <p className={styles.alert} role="alert">
        No se pudieron consultar los registros. Comprueba la conexión y las migraciones de DEV e inténtalo de nuevo.
      </p>
      <Link href="/admin/ventas" className="inline-link">Volver a ventas</Link>
    </main>
  );
}
