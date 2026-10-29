import { z } from "zod";

export const DEPARTMENTS = [
  { id: "alta-verapaz", name: "Alta Verapaz" },
  { id: "baja-verapaz", name: "Baja Verapaz" },
  { id: "chimaltenango", name: "Chimaltenango" },
  { id: "chiquimula", name: "Chiquimula" },
  { id: "el-progreso", name: "El Progreso" },
  { id: "escuintla", name: "Escuintla" },
  { id: "guatemala", name: "Guatemala" },
  { id: "huehuetenango", name: "Huehuetenango" },
  { id: "izabal", name: "Izabal" },
  { id: "jalapa", name: "Jalapa" },
  { id: "jutiapa", name: "Jutiapa" },
  { id: "peten", name: "Petén" },
  { id: "quetzaltenango", name: "Quetzaltenango" },
  { id: "quiche", name: "Quiché" },
  { id: "retalhuleu", name: "Retalhuleu" },
  { id: "sacatepequez", name: "Sacatepéquez" },
  { id: "san-marcos", name: "San Marcos" },
  { id: "santa-rosa", name: "Santa Rosa" },
  { id: "solola", name: "Sololá" },
  { id: "suchitepequez", name: "Suchitepéquez" },
  { id: "totonicapan", name: "Totonicapán" },
  { id: "zacapa", name: "Zacapa" },
] as const;

export const departmentSchema = z.enum(DEPARTMENTS.map((item) => item.id));

/** Only navigation links; the server never fetches an administrator-supplied URL. */
export function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    if (url.hostname === "maps.app.goo.gl") return url.pathname.length > 1;
    if (url.hostname === "goo.gl") return url.pathname.startsWith("/maps/");
    if (url.hostname === "maps.google.com") return true;
    return (
      ["google.com", "www.google.com"].includes(url.hostname) &&
      (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))
    );
  } catch {
    return false;
  }
}

export const locationFieldsSchema = z.object({
  company: z.enum(["greenbel", "cooperative"]),
  name: z.string().trim().min(2).max(100),
  department: departmentSchema,
  address: z
    .string()
    .trim()
    .max(400)
    .refine((value) => !value || value.length >= 5),
  hours: z.string().trim().max(180),
  latitude: z.number().finite().min(13.5).max(18).nullable(),
  longitude: z.number().finite().min(-92.4).max(-88).nullable(),
  mapsUrl: z.string().trim().max(2048).refine(isGoogleMapsUrl).nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

function coordinatePair(
  value: { latitude: number | null; longitude: number | null },
  ctx: z.RefinementCtx,
) {
  if ((value.latitude === null) !== (value.longitude === null))
    ctx.addIssue({
      code: "custom",
      message: "Indica ambas coordenadas o deja las dos vacías.",
      path: ["latitude"],
    });
}

export const locationEntrySchema = locationFieldsSchema
  .extend({ id: z.uuid() })
  .strict()
  .superRefine(coordinatePair);

export const saveLocationSchema = locationFieldsSchema
  .extend({
    id: z.uuid().optional(),
    revision: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine(coordinatePair);

export type LocationEntry = z.infer<typeof locationEntrySchema>;
export type PublicLocation = Pick<
  LocationEntry,
  | "id"
  | "company"
  | "name"
  | "department"
  | "address"
  | "hours"
  | "latitude"
  | "longitude"
  | "mapsUrl"
>;

/** Department presence supplied in the user's reference image, 29/10/2026.
 * These are not street addresses or a count of agencies. Only used when the
 * existing CMS payload has never configured locations; a saved [] stays empty.
 */
export const INITIAL_LOCATIONS: readonly LocationEntry[] = [
  ...(["guatemala", "quetzaltenango", "escuintla", "jutiapa"] as const).map(
    (department) => ({ company: "greenbel" as const, department }),
  ),
  ...(
    [
      "huehuetenango",
      "quiche",
      "totonicapan",
      "quetzaltenango",
      "solola",
      "chimaltenango",
      "guatemala",
    ] as const
  ).map((department) => ({ company: "cooperative" as const, department })),
].map((item, index) => ({
  ...item,
  id: `6eafb560-7ea2-4a83-a685-${String(index + 1).padStart(12, "0")}`,
  name: DEPARTMENTS.find((department) => department.id === item.department)!
    .name,
  address: "",
  hours: "",
  latitude: null,
  longitude: null,
  mapsUrl: null,
  active: true,
  sortOrder: index,
}));

export function initialLocations(): LocationEntry[] {
  return INITIAL_LOCATIONS.map((location) => ({ ...location }));
}

export function publicLocations(
  locations: readonly LocationEntry[],
  company: LocationEntry["company"],
): PublicLocation[] {
  return locations
    .filter((item) => item.company === company && item.active)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name, "es") ||
        a.id.localeCompare(b.id),
    )
    .map(
      ({
        id,
        company,
        name,
        department,
        address,
        hours,
        latitude,
        longitude,
        mapsUrl,
      }) => ({
        id,
        company,
        name,
        department,
        address,
        hours,
        latitude,
        longitude,
        mapsUrl,
      }),
    );
}

export function locationMapsHref(location: PublicLocation): string {
  if (location.mapsUrl && isGoogleMapsUrl(location.mapsUrl))
    return location.mapsUrl;
  const query =
    location.latitude !== null && location.longitude !== null
      ? `${location.latitude},${location.longitude}`
      : [
          location.address,
          DEPARTMENTS.find((item) => item.id === location.department)?.name,
          "Guatemala",
        ]
          .filter(Boolean)
          .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
