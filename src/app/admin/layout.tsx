import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { AdminShell } from "./_components/admin-shell";
import "./admin.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor;
  try {
    actor = await requireStaffActor(["admin", "operator"]);
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "unauthenticated"
    )
      redirect("/cuenta/ingresar");
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "forbidden"
    )
      notFound();
    return (
      <div className="admin-access-error">
        <h1>No se pudo verificar el acceso</h1>
        <p>Inténtalo de nuevo en unos momentos.</p>
        <a href="/cuenta">Volver a mi cuenta</a>
      </div>
    );
  }
  const client = await createSupabaseReadClient();
  const [{ data: auth }, { data: profile }] = await Promise.all([
    client.auth.getUser(),
    client
      .from("profiles")
      .select("display_name")
      .eq("id", actor.userId)
      .maybeSingle(),
  ]);
  return (
    <AdminShell
      role={actor.role}
      name={profile?.display_name || "Mi cuenta"}
      email={auth.user?.email || ""}
    >
      {children}
    </AdminShell>
  );
}
