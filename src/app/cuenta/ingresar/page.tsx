import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthShell
      eyebrow="Cuenta GreenBel"
      title="Accede a tu cuenta."
      description="Ingresa con tu correo y contraseña para acceder a tus datos de cuenta y revisar tu compra."
    >
      <SignInForm invalidLink={params.error === "confirmacion"} returnTo={params.next === "/checkout" ? "/checkout" : undefined} />
    </AuthShell>
  );
}
