import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { AuthShell } from "../auth-shell";
import styles from "../auth.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva contraseña", robots: { index: false, follow: false } };

export default async function ResetPasswordPage() {
  let available = true;
  let authenticated = false;
  try {
    const supabase = await createSupabaseReadClient();
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") available = false;
    authenticated = Boolean(data.user);
  } catch {
    available = false;
  }

  if (available && !authenticated) redirect("/cuenta/recuperar");
  if (available && authenticated) redirect("/cuenta#seguridad");
  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Actualiza tu contraseña."
      description="Configura tu contraseña de GreenBel para ingresar con tu correo electrónico."
    >
      <p className={`${styles.feedback} ${styles.error}`} role="alert">No pudimos comprobar tu sesión. Inténtalo más tarde.</p>
    </AuthShell>
  );
}
