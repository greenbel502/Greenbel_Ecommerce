"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveEnvironment } from "@/lib/server/environment";
import { createSupabaseActionClient } from "@/lib/supabase/server";

export type AuthActionState = {
  status: "idle" | "error" | "notice";
  message: string;
};

const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(8).max(128);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function error(message: string): AuthActionState {
  return { status: "error", message };
}

export async function signInAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  const returnTo = field(formData, "returnTo") === "/checkout" ? "/checkout" : "/cuenta";
  if (!emailSchema.safeParse(email).success || !password) {
    return error("Ingresa un correo válido y tu contraseña.");
  }

  let signedIn = false;
  try {
    const supabase = await createSupabaseActionClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    signedIn = !authError && Boolean(data.session);
  } catch {
    return error("El acceso no está disponible en este momento. Inténtalo más tarde.");
  }

  if (!signedIn) return error("No se pudo iniciar sesión. Verifica tus datos y el estado de confirmación de tu cuenta.");
  redirect(returnTo);
}

export async function signUpAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  const confirmation = field(formData, "passwordConfirmation");
  const returnTo = field(formData, "returnTo") === "/checkout" ? "/checkout" : "/cuenta";
  if (!emailSchema.safeParse(email).success || !passwordSchema.safeParse(password).success) {
    return error("Ingresa un correo válido y una contraseña de 8 a 128 caracteres.");
  }
  if (password !== confirmation) return error("Las contraseñas no coinciden.");

  let hasSession = false;
  try {
    const appUrl = getActiveEnvironment().appUrl;
    if (!appUrl) return error("El registro aún no está configurado para confirmar cuentas en este ambiente.");
    const supabase = await createSupabaseActionClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: new URL(returnTo === "/checkout" ? "/auth/confirm?next=%2Fcheckout" : "/auth/confirm", appUrl).toString() }
    });
    if (authError) return error("No se pudo completar el registro. Inténtalo más tarde.");
    hasSession = Boolean(data.session);
  } catch {
    return error("El registro no está disponible en este momento. Inténtalo más tarde.");
  }

  if (hasSession) redirect(returnTo);
  return {
    status: "notice",
    message: "Supabase Auth procesó la solicitud, pero no abrió una sesión. Si este proyecto requiere confirmar el correo, sigue el enlace de Auth cuando llegue. El envío y la confirmación no se han verificado aquí."
  };
}

export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = field(formData, "email").trim();
  if (!emailSchema.safeParse(email).success) return error("Ingresa un correo válido.");

  try {
    const appUrl = getActiveEnvironment().appUrl;
    if (!appUrl) return error("La recuperación aún no está configurada en este ambiente.");
    const supabase = await createSupabaseActionClient();
    const redirectTo = new URL("/auth/confirm?flow=recovery", appUrl).toString();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (authError) return error("No se pudo procesar la recuperación en este momento.");
  } catch {
    return error("La recuperación no está disponible en este momento.");
  }

  return {
    status: "notice",
    message: "Si corresponde, Supabase Auth procesó la recuperación. Usa el enlace de Auth cuando llegue; esta pantalla no confirma la entrega del correo."
  };
}

export async function updatePasswordAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const password = field(formData, "password");
  const confirmation = field(formData, "passwordConfirmation");
  if (!passwordSchema.safeParse(password).success) return error("Usa una contraseña de 8 a 128 caracteres.");
  if (password !== confirmation) return error("Las contraseñas no coinciden.");

  let updated = false;
  try {
    const supabase = await createSupabaseActionClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return error("El enlace de recuperación no es válido o venció.");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    updated = !updateError;
  } catch {
    return error("No se pudo actualizar la contraseña en este momento.");
  }

  if (!updated) return error("No se pudo actualizar la contraseña. Solicita un nuevo enlace si es necesario.");
  redirect("/cuenta");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseActionClient();
  const { error: authError } = await supabase.auth.signOut({ scope: "local" });
  if (authError) throw new Error("No se pudo cerrar la sesión.");
  redirect("/cuenta/ingresar");
}
