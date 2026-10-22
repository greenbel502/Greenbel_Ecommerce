import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { RecoverPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Recuperar acceso", robots: { index: false, follow: false } };

export default function RecoverPasswordPage() {
  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Recupera tu acceso."
      description="Solicita un enlace para configurar una nueva contraseña y volver a comprar con tu cuenta."
    >
      <RecoverPasswordForm />
    </AuthShell>
  );
}
