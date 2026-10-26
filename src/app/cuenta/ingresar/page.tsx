import type { Metadata } from "next";
import { LoginShell } from "../login-shell";
import { SignInForm } from "../auth-forms";
import { customerAuthDestination } from "@/lib/supabase/auth-navigation";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const destination = customerAuthDestination(params.next);
  return (
    <LoginShell>
      <SignInForm invalidLink={params.error === "confirmacion"}
        googleError={params.error === "google" ? "google" : params.error === "google_cuenta" ? "account" : undefined}
        returnTo={destination === "/cuenta" ? undefined : destination}
        financingNotice={params.reason === "financiamiento" || destination === "/financiamiento#solicitud"} />
    </LoginShell>
  );
}
