import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SalesNavigation } from "@/app/admin/ventas/components";
import styles from "@/app/admin/ventas/sales.module.css";
import { saveUserAccess } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acceso de usuarios", robots: { index: false, follow: false } };
const PAGE_SIZE = 30;
type Role = "customer" | "operator" | "admin";
type AccessRow = { id: string; email: string | null; displayName: string; role: Role; active: boolean };

const messages: Record<string, string> = {
  saved: "Acceso actualizado y auditado.", unchanged: "No había cambios que guardar.",
  stale: "Otra operación cambió este acceso. Revisa los valores actuales antes de volver a guardar.",
  forbidden: "No se autorizó el cambio. Debes ser administrador activo y conservar tu propio acceso.",
  invalid: "Revisa el rol y el estado seleccionados.", failed: "No se pudo actualizar el acceso; inténtalo de nuevo."
};

function pageNumber(input: string | undefined): number {
  const number = Number(input);
  return Number.isInteger(number) && number >= 1 && number <= 10000 ? number : 1;
}

export default async function UsersAdminPage({ searchParams }: {
  searchParams: Promise<{ page?: string; result?: string }>;
}) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <main className={styles.shell}><p className={styles.alert} role="alert">No se pudo verificar el acceso.</p></main>;
  }

  const params = await searchParams;
  const page = pageNumber(params.page);
  let rows: AccessRow[] = [];
  let totalUsers = 0;
  try {
    const admin = createSupabaseAdminClient();
    const usersResult = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (usersResult.error) throw usersResult.error;
    const users = usersResult.data.users;
    totalUsers = usersResult.data.total;
    const ids = users.map((user) => user.id);
    if (ids.length) {
      const [profiles, roles] = await Promise.all([
        admin.from("profiles").select("id,display_name,active").in("id", ids),
        admin.from("user_roles").select("user_id,role").in("user_id", ids)
      ]);
      if (profiles.error || roles.error) throw new Error("User access unavailable");
      const profileById = new Map((profiles.data ?? []).map((row) => [row.id, row]));
      const roleById = new Map((roles.data ?? []).map((row) => [row.user_id, row.role]));
      rows = users.map((user) => {
        const profile = profileById.get(user.id);
        const role = roleById.get(user.id);
        if (!profile || (role !== "customer" && role !== "operator" && role !== "admin")) {
          throw new Error("Auth user missing profile or role");
        }
        return { id: user.id, email: user.email ?? null,
          displayName: profile.display_name, role, active: profile.active };
      });
    }
  } catch {
    return <main className={styles.shell}>
      <h1>Acceso de usuarios</h1>
      <p className={styles.alert} role="alert">No se pudo consultar Auth y los roles de GreenBel. Revisa la conexión DEV.</p>
      <Link href="/admin/ventas" className="inline-link">Volver a ventas</Link>
    </main>;
  }
  const lastPage = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  if (page > lastPage) redirect(`/admin/usuarios?page=${lastPage}`);
  const resultMessage = params.result && Object.prototype.hasOwnProperty.call(messages, params.result)
    ? messages[params.result] : null;

  return <main className={styles.shell}>
    <header className={styles.hero}><div>
      <span className="eyebrow">Panel administrativo</span><h1>Acceso de usuarios</h1>
      <p>Asigna el rol de GreenBel y habilita o suspende sus operaciones. Supabase Auth conserva las credenciales y la confirmación de correo.</p>
    </div></header>
    <SalesNavigation role="admin" />
    <p className={styles.notice}>Los cambios se registran en auditoría. Suspender operaciones no elimina la cuenta de Auth ni borra pedidos. No puedes retirar tu propio acceso de administrador.</p>
    {resultMessage && <p className={params.result === "saved" || params.result === "unchanged" ? styles.notice : styles.alert}
      role={params.result === "saved" || params.result === "unchanged" ? "status" : "alert"}>{resultMessage}</p>}
    <section className={styles.section} aria-labelledby="users-heading">
      <div className={styles.sectionHeading}><h2 id="users-heading">Cuentas Auth</h2><span>{totalUsers} cuentas · Página {page} de {lastPage}</span></div>
      {rows.length === 0 ? <div className={styles.empty}><p>Sin cuentas en esta página.</p></div> :
        <div className={styles.cards}>{rows.map((user) => <article className={styles.card} key={user.id}>
          <div className={styles.cardTop}><div><h3>{user.displayName || "Nombre pendiente"}</h3>
            <small>{user.email ?? "Sin correo visible"} · {user.id}</small></div>
            <span className={styles.role}>{user.active ? "Activo" : "Suspendido"}</span>
          </div>
          <form action={saveUserAccess} className={styles.caseForm}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="expectedRole" value={user.role} />
            <input type="hidden" name="expectedActive" value={String(user.active)} />
            <input type="hidden" name="page" value={page} />
            <label htmlFor={`role-${user.id}`}>Rol</label>
            <select id={`role-${user.id}`} name="role" defaultValue={user.role}>
              <option value="customer">Cliente</option><option value="operator">Operador</option><option value="admin">Administrador</option>
            </select>
            <label htmlFor={`active-${user.id}`}>Acceso a operaciones</label>
            <select id={`active-${user.id}`} name="active" defaultValue={String(user.active)}>
              <option value="true">Activo</option><option value="false">Suspendido</option>
            </select>
            <button type="submit" className="primary-button">Guardar acceso</button>
          </form>
        </article>)}</div>}
      <nav className={styles.pager} aria-label="Páginas de usuarios">
        {page > 1 ? <Link href={`/admin/usuarios?page=${page - 1}`}>Anterior</Link> : <span />}
        <span>Página {page}</span>
        {page < lastPage ? <Link href={`/admin/usuarios?page=${page + 1}`}>Siguiente</Link> : <span />}
      </nav>
    </section>
  </main>;
}
