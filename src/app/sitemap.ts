import type { MetadataRoute } from "next";
import { isIndexableEnvironment, sitemapEntries } from "@/lib/seo";
import { getSitemapSlugs } from "@/lib/server/seo-sitemap";

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexableEnvironment()) return [];
  const { products, trainings } = await getSitemapSlugs();
  return sitemapEntries(products, trainings);
}
