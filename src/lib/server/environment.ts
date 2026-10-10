import "server-only";

import {
  resolveActiveEnvironment,
  resolveAppEnvironment,
  resolveBusinessEmailDeliveryMode,
  type ActiveEnvironmentConfig
} from "./environment-policy";

/** Server-side selection only. Never serialize this module or a secret key into client props. */
export function getActiveEnvironment(): ActiveEnvironmentConfig {
  return resolveActiveEnvironment(process.env);
}

/** Call only for a privileged operation that has already checked actor and scope. */
export function getActiveSupabaseSecretKey(): string {
  const appEnvironment = resolveAppEnvironment(process.env);
  const variableName = `${appEnvironment}_SUPABASE_SECRET_KEY`;
  const value = process.env[variableName]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${variableName}.`);
  return value;
}

export function getBusinessEmailDeliveryMode(): "disabled" {
  return resolveBusinessEmailDeliveryMode(process.env);
}
