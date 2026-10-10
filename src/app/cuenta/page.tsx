import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { signOutAction } from "./actions";
import { AuthShell } from "./auth-shell";
import styles from "./auth.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

export default async function AccountPage() {
  let available = true;
  let email: string | undefined;
  let staffEntry: { href: string; label: string } | null = null;
  try {
    const supabase = await createSupabaseReadClient();
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") available = false;
    email = data.user?.email;
    if (data.user && available) {
      const [role, profile] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle(),
        supabase.from("profiles").select("active").eq("id", data.user.id).maybeSingle()
      ]);
      if (!role.error && !profile.error && profile.data?.active === true) {
        if (role.data?.role === "admin") staffEntry = { href: "/admin/catalogo", label: "Panel administrativo" };
        if (role.data?.role === "operator") staffEntry = { href: "/admin/inventario", label: "Panel de inventario" };
      }
    }
  } catch {
    available = false;
  }

  if (available && !email) redirect("/cuenta/ingresar");

  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Mi cuenta."
      description="Tu sesión se valida en el servidor con Supabase Auth."
    >
      {available && email ? (
        <>
          <h2>Sesión activa</h2>
          <div className={styles.accountDetail}><small>Correo de la cuenta</small><strong>{email}</strong></div>
          <div className={styles.accountActions}>
            <Link href="/cuenta/pedidos" className="secondary-dark-button">Mis pedidos</Link>
            {staffEntry && <Link href={staffEntry.href} className="secondary-dark-button">{staffEntry.label}</Link>}
            <Link href="/cuenta/restablecer" className="secondary-dark-button">Cambiar contraseña</Link>
            <form action={signOutAction}><button className="primary-button" type="submit">Cerrar sesión</button></form>
          </div>
        </>
      ) : (
        <p className={`${styles.feedback} ${styles.error}`} role="alert">La verificación de la sesión no está disponible en este momento. Inténtalo más tarde.</p>
      )}
    </AuthShell>
  );
}
