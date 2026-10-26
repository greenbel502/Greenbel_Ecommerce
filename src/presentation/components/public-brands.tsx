import { getPublicBrands } from "@/lib/server/brand-catalog";
import { readPublicData } from "@/lib/server/public-data-result";
import { BrandsCarousel } from "./brands-carousel";

export async function PublicBrands() {
  const result = await readPublicData(getPublicBrands);
  return (
    <BrandsCarousel
      brands={result.status === "available" ? result.data : []}
      unavailable={result.status === "unavailable"}
    />
  );
}
