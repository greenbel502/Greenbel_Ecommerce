import { resolveAppEnvironment } from "./environment-policy.ts";

/** A configured DEV backend is the default; mock fixtures require an explicit choice. */
export function shouldUseSupabaseCatalog(source: Record<string, string | undefined> = process.env): boolean {
  const appEnvironment = resolveAppEnvironment(source);
  const configured = source.GREENBEL_CATALOG_SOURCE?.trim().toLowerCase();
  if (configured && configured !== "mock" && configured !== "supabase") {
    throw new Error("GREENBEL_CATALOG_SOURCE debe ser mock o supabase.");
  }
  if (configured === "mock" && appEnvironment !== "DEV") {
    throw new Error("El catálogo demostrativo solo está permitido en DEV.");
  }
  return appEnvironment === "PROD" || configured === "supabase"
    || (configured !== "mock" && Boolean(source.DEV_SUPABASE_URL && source.DEV_SUPABASE_PUBLISHABLE_KEY));
}
