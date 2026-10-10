export type AppEnvironment = "DEV" | "PROD";

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type PublicSupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export type ActiveEnvironmentConfig = Readonly<{
  appEnvironment: AppEnvironment;
  appUrl?: string;
  supabase: PublicSupabaseConfig;
  businessEmailDeliveryMode: "disabled";
}>;

function required(source: EnvironmentSource, name: string): string {
  const value = source[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

function optional(source: EnvironmentSource, name: string): string | undefined {
  return source[name]?.trim() || undefined;
}

function validatedUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`La variable ${name} debe ser una URL válida.`);
  }

  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
  ) {
    throw new Error(`La variable ${name} debe usar HTTPS o HTTP local y no incluir credenciales.`);
  }

  return value;
}

export function resolveAppEnvironment(source: EnvironmentSource): AppEnvironment {
  if (source.APP_ENV === "DEV" || source.APP_ENV === "PROD") return source.APP_ENV;
  throw new Error("APP_ENV debe ser DEV o PROD.");
}

export function resolveBusinessEmailDeliveryMode(
  source: EnvironmentSource,
  appEnvironment = resolveAppEnvironment(source)
): "disabled" {
  const variableName = `${appEnvironment}_EMAIL_DELIVERY_MODE`;
  const configuredMode = optional(source, variableName)?.toLowerCase() ?? "disabled";

  // The current business-email pause is a server-side gate, even with a Resend key present.
  if (configuredMode !== "disabled") {
    throw new Error(`${variableName} debe ser disabled mientras el envío de correos esté pausado.`);
  }

  return "disabled";
}

export function resolveActiveEnvironment(source: EnvironmentSource): ActiveEnvironmentConfig {
  const appEnvironment = resolveAppEnvironment(source);
  const supabaseUrlName = `${appEnvironment}_SUPABASE_URL`;
  const publishableKeyName = `${appEnvironment}_SUPABASE_PUBLISHABLE_KEY`;
  const appUrlName = `${appEnvironment}_APP_URL`;
  const appUrl = optional(source, appUrlName);

  return {
    appEnvironment,
    ...(appUrl ? { appUrl: validatedUrl(appUrl, appUrlName) } : {}),
    supabase: {
      url: validatedUrl(required(source, supabaseUrlName), supabaseUrlName),
      publishableKey: required(source, publishableKeyName)
    },
    businessEmailDeliveryMode: resolveBusinessEmailDeliveryMode(source, appEnvironment)
  };
}
