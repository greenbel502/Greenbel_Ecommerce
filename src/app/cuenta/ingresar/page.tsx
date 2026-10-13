import type { Metadata } from "next";
import { LoginShell } from "../login-shell";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <LoginShell>
      <SignInForm invalidLink={params.error === "confirmacion"}
        googleError={params.error === "google" ? "google" : params.error === "google_cuenta" ? "account" : undefined}
        returnTo={params.next === "/checkout" ? "/checkout" : undefined} />
    </LoginShell>
  );
}
