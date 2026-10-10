import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false, follow: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Crea tu cuenta."
      description="Regístrate con correo y contraseña. Supabase Auth puede requerir la confirmación del correo antes de permitir el ingreso."
    >
      <SignUpForm returnTo={params.next === "/checkout" ? "/checkout" : undefined} />
    </AuthShell>
  );
}
