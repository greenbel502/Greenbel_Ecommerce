import "server-only";

import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Product } from "@/domain/entities/product";

export async function getCompatibleProductIds(product: Product): Promise<{
  status: "ready" | "unavailable" | "mock";
  ids: string[];
}> {
  if (product.isMockPrice || !product.kind || product.kind === "accessory" || product.kind === "agricultural") {
    return { status: "mock", ids: [] };
  }
  try {
    const client = createSupabasePublicClient();
    const equipment = product.kind === "equipment";
    const { data, error } = await client.from("product_compatibilities")
      .select("equipment_id,part_id")
      .eq(equipment ? "equipment_id" : "part_id", product.id)
      .limit(100);
    if (error) return { status: "unavailable", ids: [] };
    return {
      status: "ready",
      ids: [...new Set((data ?? []).map((item) => equipment ? item.part_id : item.equipment_id))]
    };
  } catch {
    return { status: "unavailable", ids: [] };
  }
}
