import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getActiveEnvironment } from "@/lib/server/environment";
/** Only public artwork URLs. Never include customer identifiers, grants or expiring signed URLs. */
export function financingBrandImages() {
  const base = new URL(
    "/storage/v1/object/public/email-assets/",
    getActiveEnvironment().supabase.url,
  );
  const asset = (name: string, bytes: Buffer) => {
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    return new URL(`${name}-${hash}.png`, base).href;
  };
  return {
    greenbel: asset(
      "greenbel",
      readFileSync(
        join(process.cwd(), "public/images/brand/greenbel-email.png"),
      ),
    ),
    cooperative: asset(
      "cooperative",
      readFileSync(
        join(process.cwd(), "public/images/cooperativa-concepcion-color.png"),
      ),
    ),
  };
}
