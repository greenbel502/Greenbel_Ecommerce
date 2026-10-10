import type { MetadataRoute } from "next";
import { products } from "@/infrastructure/mock/products";
export default function sitemap(): MetadataRoute.Sitemap { const base = "https://greenbel.gt"; return ["", "/productos", "/financiamiento", "/nosotros", "/contacto"].map((path) => ({ url: `${base}${path}`, changeFrequency: "weekly" as const, priority: path === "" ? 1 : .8 })).concat(products.map((product) => ({ url: `${base}/productos/${product.slug}`, changeFrequency: "weekly" as const, priority: .7 }))); }
