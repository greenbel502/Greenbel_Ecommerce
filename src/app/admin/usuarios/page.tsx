import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError } from "@/lib/server/staff-authorization";
import type { Metadata } from "next";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import {
  ListTools,
  ListPager,
  ListEmpty,
  SortHeading,
} from "../_components/list-controls";
import { UserActions, type AccessRow } from "./user-actions";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Usuarios",
  robots: { index: false, follow: false },
};
export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  let actor;
  try {
    actor = await requireStaffActor(["admin"]);
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
    throw error;
  }
  const params = await searchParams;
  const state = listState(params, "", adminLists.users);
  const active =
    typeof params.active === "string" &&
    ["true", "false"].includes(params.active)
      ? params.active
      : "";
  const client = await createSupabaseReadClient();
  const result = await client.rpc("admin_list_users", {
    p_search: state.q,
    p_role: state.filter,
    p_active: active ? active === "true" : null,
    p_sort: state.sort,
    p_direction: state.direction,
    p_page: state.page,
    p_size: state.size,
  });
  if (result.error || !result.data || !Array.isArray(result.data.rows))
    return (
      <div>
        <h1>Usuarios</h1>
        <div className="admin-empty" role="alert">
          <h2>No se pudo cargar la información</h2>
          <p>Inténtalo de nuevo en unos momentos.</p>
          <a href="/admin/usuarios">Reintentar</a>
        </div>
      </div>
    );
  state.total = result.data.total;
  state.page = result.data.page;
  const rows = result.data.rows as AccessRow[];
  return (
    <>
      <span className="eyebrow">Configuración</span>
      <h1>Usuarios</h1>
      <p>Consulta las cuentas y administra los permisos de tu equipo.</p>
      <ListTools
        state={state}
        config={adminLists.users}
        path="/admin/usuarios"
        label="usuarios"
        extraFields={[
          {
            key: "active",
            label: "Acceso",
            value: active,
            options: { true: "Activo", false: "Suspendido" },
          },
        ]}
      />

      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "16px 0" }}>
        Los cambios quedan registrados. Suspender una cuenta conserva sus
        pedidos. Tu acceso de administrador está protegido.
      </p>
      {rows.length === 0 ? (
        <ListEmpty
          state={{ ...state, filter: state.filter || active }}
          path="/admin/usuarios"
          noun="usuarios"
        />
      ) : (
        <div
          className="admin-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Tabla de registros, desplazamiento horizontal"
        >
          <table>
            <caption className="sr-only">
              Cuentas y permisos de GreenBel
            </caption>
            <thead>
              <tr>
                <SortHeading
                  state={state}
                  path="/admin/usuarios"
                  column="display_name"
                  label="Nombre"
                />
                <SortHeading
                  state={state}
                  path="/admin/usuarios"
                  column="email"
                  label="Correo"
                />
                <SortHeading
                  state={state}
                  path="/admin/usuarios"
                  column="role"
                  label="Rol"
                />
                <th scope="col">Estado</th>
                <SortHeading
                  state={state}
                  path="/admin/usuarios"
                  column="created_at"
                  label="Registro"
                />
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>
                      {user.display_name || "Sin nombre registrado"}
                    </strong>
                    {user.id === actor.userId && <small>Tu cuenta</small>}
                  </td>
                  <td>{user.email || "Sin correo"}</td>
                  <td>
                    {
                      {
                        customer: "Cliente",
                        operator: "Operador",
                        admin: "Administrador",
                      }[user.role]
                    }
                  </td>
                  <td>
                    <span className={`admin-tag${user.active ? "" : " muted"}`}>
                      {user.active ? "Activo" : "Suspendido"}
                    </span>
                  </td>
                  <td>
                    {new Date(user.created_at).toLocaleDateString("es-GT", {
                      timeZone: "America/Guatemala",
                    })}
                  </td>
                  <td>
                    <UserActions user={user} own={actor.userId === user.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ListPager state={state} path="/admin/usuarios" label="usuarios" />
    </>
  );
}
