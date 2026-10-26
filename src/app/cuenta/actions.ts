"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getActiveEnvironment } from "@/lib/server/environment";
import { createSupabaseActionClient } from "@/lib/supabase/server";
import { customerAuthDestination, googleCallbackUrl } from "@/lib/supabase/auth-navigation";
import { CustomerProfileError, requireCustomerProfile } from "@/lib/server/customer-profile";

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

export async function signInWithGoogleAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  let authorizationUrl: string;
  try {
    const environment = getActiveEnvironment();
    const requestHeaders = await headers();
    const redirectTo = googleCallbackUrl(environment.appUrl, environment.appEnvironment,
      requestHeaders.get("origin"), field(formData, "returnTo"));
    const supabase = await createSupabaseActionClient();
    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true }
    });
    if (authError || !data.url) return error("No se pudo conectar con Google. Inténtalo de nuevo.");
    const target = new URL(data.url);
    if (target.origin !== new URL(environment.supabase.url).origin || target.pathname !== "/auth/v1/authorize") {
      return error("No se pudo iniciar el acceso con Google de forma segura.");
    }
    authorizationUrl = target.toString();
  } catch {
    return error("El acceso con Google no está disponible en este momento. Inténtalo más tarde.");
  }
  redirect(authorizationUrl);
}

export async function signInAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  const returnTo = customerAuthDestination(field(formData, "returnTo"));
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
  const returnTo = customerAuthDestination(field(formData, "returnTo"));
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
      options: { emailRedirectTo: new URL(returnTo === "/cuenta" ? "/auth/confirm" : `/auth/confirm?next=${encodeURIComponent(returnTo)}`, appUrl).toString() }
    });
    if (authError) return error("No se pudo completar el registro. Inténtalo más tarde.");
    hasSession = Boolean(data.session);
  } catch {
    return error("El registro no está disponible en este momento. Inténtalo más tarde.");
  }

  if (hasSession) redirect(returnTo);
  return {
    status: "notice",
    message: "Solicitud de registro procesada. Para ingresar debes confirmar tu correo cuando recibas el enlace. Esta pantalla no confirma la entrega del mensaje."
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
    message: "Si corresponde a una cuenta, se ha solicitado la recuperación. Usa el enlace cuando llegue; esta pantalla no confirma la entrega del correo."
  };
}

export async function updatePasswordAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const password = field(formData, "password");
  const confirmation = field(formData, "passwordConfirmation");
  if (!passwordSchema.safeParse(password).success) return error("Usa una contraseña de 8 a 128 caracteres.");
  if (password !== confirmation) return error("Las contraseñas no coinciden.");

  try {
    const { client, user } = await requireCustomerProfile();
    if (!user.email || !user.email_confirmed_at) return error("Debes tener un correo confirmado para configurar tu contraseña.");
    // Uses only the verified session. Never accepts a target user/email or an admin credential.
    const { data, error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      if (updateError.code === "reauthentication_needed" || updateError.code === "reauthentication_not_valid") {
        return error("Por seguridad, cierra sesión y vuelve a ingresar antes de guardar tu contraseña.");
      }
      if (updateError.code === "same_password") return error("Elige una contraseña diferente a la que ya usas.");
      if (updateError.code === "weak_password") return error("Elige una contraseña más segura y vuelve a intentarlo.");
      return error("No se pudo guardar la contraseña. Inténtalo de nuevo o vuelve a ingresar a tu cuenta.");
    }
    if (data.user?.id !== user.id) return error("No se pudo confirmar el cambio de contraseña.");
  } catch (failure) {
    if (failure instanceof CustomerProfileError && failure.status === 401) return error("Tu sesión venció. Vuelve a ingresar para guardar tu contraseña.");
    if (failure instanceof CustomerProfileError && failure.status === 403) return error("Esta cuenta no está habilitada. Contacta a GreenBel para revisar su acceso.");
    return error("No se pudo actualizar la contraseña en este momento.");
  }

  return { status: "notice", message: "Contraseña guardada. Ya puedes ingresar con el correo de tu cuenta y esta contraseña." };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseActionClient();
  const { error: authError } = await supabase.auth.signOut({ scope: "local" });
  if (authError) throw new Error("No se pudo cerrar la sesión.");
  redirect("/cuenta/ingresar");
}

/** The navbar keeps a truthful error state if Auth cannot close the session. */
export async function signOutMenuAction(): Promise<AuthActionState> {
  try {
    const supabase = await createSupabaseActionClient();
    const { error: authError } = await supabase.auth.signOut({ scope: "local" });
    if (authError) return error("No pudimos cerrar tu sesión. Inténtalo de nuevo.");
  } catch { return error("El cierre de sesión no está disponible en este momento."); }
  redirect("/cuenta/ingresar");
}
