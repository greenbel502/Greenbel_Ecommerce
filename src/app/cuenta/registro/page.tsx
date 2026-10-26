import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { SignUpForm } from "../auth-forms";
import { customerAuthDestination } from "@/lib/supabase/auth-navigation";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false, follow: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const destination = customerAuthDestination(params.next);
  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Crea tu cuenta."
      description="Regístrate con tu correo y una contraseña para facilitar tus próximas compras. Confirma tu correo antes de ingresar."
    >
      <SignUpForm returnTo={destination === "/cuenta" ? undefined : destination} />
    </AuthShell>
  );
}
