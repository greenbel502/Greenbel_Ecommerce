import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { PdfDocumentVisuals, PdfImage } from "./document-visuals";

let brand: Promise<Omit<PdfDocumentVisuals, "products">> | undefined;
async function png(bytes: Buffer, width: number): Promise<PdfImage> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 20_000_000 })
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    dataUrl: `data:image/png;base64,${data.toString("base64")}`,
    width: info.width,
    height: info.height,
  };
}
function branding() {
  return (brand ??= (async () => {
    const [logo, placeholder, regular, semibold, display] = await Promise.all([
      readFile(
        join(process.cwd(), "public/images/brand/greenbel-horizontal.svg"),
      ),
      readFile(join(process.cwd(), "public/images/product-placeholder.svg")),
      readFile(join(process.cwd(), "src/lib/pdf/fonts/poppins-regular.ttf")),
      readFile(join(process.cwd(), "src/lib/pdf/fonts/poppins-semibold.ttf")),
      readFile(join(process.cwd(), "src/lib/pdf/fonts/manrope-heavy.ttf")),
    ]);
    return {
      logo: await png(logo, 1400),
      placeholder: await png(placeholder, 180),
      fonts: {
        regular: regular.toString("base64"),
        semibold: semibold.toString("base64"),
        display: display.toString("base64"),
      },
    };
  })().catch((error) => {
    brand = undefined;
    throw error;
  }));
}

/** Only server-selected catalog IDs. Public RLS authorizes metadata before privileged Storage reads. */
export async function loadDocumentVisuals(
  selection: readonly { productId: string; sku: string }[],
): Promise<PdfDocumentVisuals> {
  const visuals = await branding();
  const products = new Map<string, PdfImage>();
  if (!selection.length) return { ...visuals, products };
  const publicClient = createSupabasePublicClient();
  const result = await publicClient
    .from("product_images")
    .select("product_id,storage_path")
    .in(
      "product_id",
      selection.map((s) => s.productId),
    )
    .eq("is_primary", true)
    .order("id")
    .abortSignal(AbortSignal.timeout(4000));
  if (result.error) return { ...visuals, products }; // Missing media must not change totals or prevent issuing a quote.
  const byId = new Map(selection.map((s) => [s.productId, s.sku]));
  const admin = createSupabaseAdminClient();
  const queue = [...(result.data ?? [])];
  const deadline = Date.now() + 5000;
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length && Date.now() < deadline) {
        const row = queue.shift()!;
        const sku = byId.get(row.product_id);
        if (!sku || products.has(sku)) continue;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const file = await Promise.race([
            admin.storage.from("product-images").download(row.storage_path),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(Error("image_timeout")), 4000);
            }),
          ]);
          if (
            file.error ||
            !file.data ||
            file.data.size > 8_000_000 ||
            !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
              file.data.type,
            )
          )
            continue;
          const bytes = Buffer.from(await file.data.arrayBuffer());
          const { data, info } = await sharp(bytes, {
            limitInputPixels: 20_000_000,
          })
            .rotate()
            .resize({
              width: 220,
              height: 220,
              fit: "inside",
              withoutEnlargement: true,
            })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 78 })
            .toBuffer({ resolveWithObject: true });
          products.set(sku, {
            dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`,
            width: info.width,
            height: info.height,
          });
        } catch {
          /* Explicit branded placeholder for missing, invalid or unavailable photographs. */
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }
    }),
  );
  return { ...visuals, products };
}
