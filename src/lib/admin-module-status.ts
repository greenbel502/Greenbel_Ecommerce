/** Administrative screens paused while purchases are handled through WhatsApp. */
export const PAUSED_ADMIN_MODULES = {
  ventas: { title: "Ventas y posventa" },
  envios: { title: "Envíos externos" },
  entregas: { title: "Entregas y pagos" },
} as const;

export type PausedAdminModule = keyof typeof PAUSED_ADMIN_MODULES;

export function getPausedAdminModule(path: string) {
  return Object.entries(PAUSED_ADMIN_MODULES).find(([key]) => {
    const route = `/admin/${key}`;
    return path === route || path.startsWith(`${route}/`);
  })?.[1];
}
