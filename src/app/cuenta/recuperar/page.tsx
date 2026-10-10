import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { RecoverPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Recuperar acceso", robots: { index: false, follow: false } };

export default function RecoverPasswordPage() {
  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Recupera tu acceso."
      description="Si existe una cuenta para este correo, Supabase Auth puede emitir un enlace de recuperación según la configuración del proyecto."
    >
      <RecoverPasswordForm />
    </AuthShell>
  );
}
