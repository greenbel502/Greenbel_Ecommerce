import type { MetadataRoute } from "next";
import { isIndexableEnvironment, siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableEnvironment())
    return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/api/product-images/",
        "/api/training-covers/",
        "/api/training-videos/",
      ],
      disallow: [
        "/admin",
        "/cuenta",
        "/carrito",
        "/checkout",
        "/api/",
        "/auth/",
        "/loader-demo",
        "/references/",
      ],
    },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
