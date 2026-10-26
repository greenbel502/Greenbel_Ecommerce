"use client";
import { useRef, useState, useTransition } from "react";
import { notify } from "@/presentation/notifications/notify";
import { useRouter } from "next/navigation";
import { saveUserAccess, type UserActionState } from "./actions";
export type AccessRow = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: "customer" | "operator" | "admin";
  active: boolean;
  created_at: string;
};
const roles = {
  customer: "Cliente",
  operator: "Operador",
  admin: "Administrador",
};
const idle: UserActionState = { status: "idle", message: "" };
export function UserActions({ user, own }: { user: AccessRow; own: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState(false),
    [review, setReview] = useState(false);
  const [role, setRole] = useState(user.role),
    [active, setActive] = useState(String(user.active));
  const [state, setState] = useState(idle);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const router = useRouter();
  async function action(data: FormData) {
    if (saving.current) return;
    saving.current = true;
    startTransition(async () => {
      try {
        const result = await saveUserAccess(idle, data);
        setState(result);
        if (result.status === "success") {
          notify.success(result.message);
          dialog.current?.close();
          router.refresh();
        }
      } finally {
        saving.current = false;
      }
    });
  }
  function open(editing: boolean) {
    setState(idle);
    setEdit(editing);
    setReview(false);
    setRole(user.role);
    setActive(String(user.active));
    dialog.current?.showModal();
  }
  return (
    <div className="admin-row-actions">
      <button
        onClick={() => open(false)}
        aria-label={`Ver detalles de ${user.display_name || user.email}`}
      >
        Ver detalles
      </button>
      <button
        onClick={() => open(true)}
        disabled={own}
        title={own ? "Tu acceso está protegido" : undefined}
        aria-label={`Editar acceso de ${user.display_name || user.email}`}
      >
        Editar acceso
      </button>
      <dialog
        ref={dialog}
        className="admin-dialog"
        aria-label={edit ? "Editar acceso de usuario" : "Detalle del usuario"}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <h2>{edit ? "Editar acceso" : "Detalle del usuario"}</h2>
        <p>
          {user.display_name || "Sin nombre registrado"} · {user.email}
        </p>
        {edit ? (
          <form
            action={action}
            onSubmit={(event) => {
              if (!review) {
                event.preventDefault();
                setReview(true);
              }
            }}
          >
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="expectedRole" value={user.role} />
            <input
              type="hidden"
              name="expectedActive"
              value={String(user.active)}
            />
            <label htmlFor={`role-${user.id}`}>Rol</label>
            <select
              id={`role-${user.id}`}
              name="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as AccessRow["role"]);
                setReview(false);
              }}
              disabled={pending}
            >
              <option value="customer">Cliente</option>
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </select>
            <label htmlFor={`active-${user.id}`}>Acceso a operaciones</label>
            <select
              id={`active-${user.id}`}
              name="active"
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                setReview(false);
              }}
              disabled={pending}
            >
              <option value="true">Activo</option>
              <option value="false">Suspendido</option>
            </select>
            {review && (
              <p role="status">
                Confirma el cambio de {roles[user.role]} a{" "}
                <strong>{roles[role]}</strong> y de{" "}
                {user.active ? "Activo" : "Suspendido"} a{" "}
                <strong>{active === "true" ? "Activo" : "Suspendido"}</strong>.
                Esto afecta los permisos de esta cuenta.
              </p>
            )}
            {state.status !== "idle" && (
              <p role={state.status === "error" ? "alert" : "status"}>
                {state.message}
              </p>
            )}
            <footer>
              <button
                type="button"
                disabled={pending}
                onClick={() => dialog.current?.close()}
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={pending || state.status === "success"}
              >
                {pending
                  ? "Guardando…"
                  : review
                    ? "Confirmar cambio"
                    : "Revisar cambio"}
              </button>
            </footer>
          </form>
        ) : (
          <>
            <dl>
              <dt>Nombre</dt>
              <dd>{user.display_name || "Sin nombre"}</dd>
              <dt>Correo</dt>
              <dd>{user.email || "Sin correo"}</dd>
              <dt>Teléfono</dt>
              <dd>{user.phone || "No registrado"}</dd>
              <dt>Rol</dt>
              <dd>{roles[user.role]}</dd>
              <dt>Estado</dt>
              <dd>{user.active ? "Activo" : "Suspendido"}</dd>
              <dt>Registro</dt>
              <dd>
                {new Date(user.created_at).toLocaleString("es-GT", {
                  timeZone: "America/Guatemala",
                })}
              </dd>
            </dl>
            <footer>
              <button onClick={() => dialog.current?.close()}>Cerrar</button>
            </footer>
          </>
        )}
      </dialog>
    </div>
  );
}
