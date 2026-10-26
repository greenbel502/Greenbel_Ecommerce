import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { readContactSettings } from "@/lib/server/contact-settings";
import { ContactsAdmin } from "./contacts-admin";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contacto",
  robots: { index: false, follow: false },
};
export default async function AdminContactPage() {
  try {
    await requireStaffActor(["admin"]);
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
    throw error;
  }
  return <ContactsAdmin initial={await readContactSettings()} />;
}
