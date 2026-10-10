import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { AuthShell } from "../auth-shell";
import { ResetPasswordForm } from "../auth-forms";
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
  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Actualiza tu contraseña."
      description="La nueva contraseña quedará asociada a tu cuenta de Supabase Auth."
    >
      {available ? <ResetPasswordForm /> : <p className={`${styles.feedback} ${styles.error}`} role="alert">La verificación de la sesión no está disponible en este momento. Inténtalo más tarde.</p>}
    </AuthShell>
  );
}
