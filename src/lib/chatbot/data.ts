import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngineData, KnowledgeMatch } from "./engine";
import type { ChatProduct } from "./types";

export function chatbotData(
  session: SupabaseClient,
  userId: string | null,
): EngineData {
  const publicClient = createSupabasePublicClient();
  return {
    async products(query, related, mode, ids, excluded) {
      const { data, error } = await publicClient
        .rpc("chatbot_search_products", {
          p_query: query,
          p_related: related,
          p_mode: mode,
          p_ids: ids ?? null,
          p_exclude: excluded ?? null,
        })
        .abortSignal(AbortSignal.timeout(6000));
      if (error) throw Error("catalog_unavailable");
      const products = (data ?? []).map(
        (p: {
          id: string;
          slug: string;
          sku: string;
          name: string;
          description: string;
          category: string;
          brand: string;
          price: number | string | null;
          regular_price: number | string | null;
          verified: boolean;
          available: boolean;
          image_id: string | null;
        }): ChatProduct => ({
          id: p.id,
          slug: p.slug,
          sku: p.sku,
          name: p.name,
          description: p.description,
          category: p.category,
          brand: p.brand,
          price: p.price === null ? null : Number(p.price),
          regularPrice:
            p.regular_price === null ? null : Number(p.regular_price),
          availability: p.verified
            ? p.available
              ? "available"
              : "unavailable"
            : "unknown",
          image: p.image_id
            ? `/api/product-images/${p.image_id}`
            : "/images/product-placeholder.svg",
        }),
      );
      if (products.length === 1) {
        const specs = await publicClient
          .from("product_specs")
          .select("label,value,unit")
          .eq("product_id", products[0].id)
          .order("sort_order")
          .order("id")
          .limit(6)
          .abortSignal(AbortSignal.timeout(3000));
        if (!specs.error && specs.data?.length)
          products[0].description = [
            products[0].description,
            ...specs.data.map(
              (s) => `${s.label}: ${s.value}${s.unit ? " " + s.unit : ""}`,
            ),
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 1600);
      }
      return products;
    },
    async knowledge(query, category, embedding) {
      const { data, error } = await publicClient
        .rpc("chatbot_search_knowledge", {
          p_query: query,
          p_category: category ?? null,
          p_embedding: embedding ? JSON.stringify(embedding) : null,
        })
        .abortSignal(AbortSignal.timeout(5000));
      if (error) throw Error("knowledge_unavailable");
      return (data ?? []) as KnowledgeMatch[];
    },
    async categoryKnowledge(category) {
      const { data, error } = await publicClient
        .from("chatbot_knowledge")
        .select("id,question,answer,category,source_path")
        .eq("category", category)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw Error("knowledge_unavailable");
      return data ? { ...data, score: 0, retrieval: "rule" } : null;
    },
    async brands() {
      const { data, error } = await publicClient
        .from("brands")
        .select("name")
        .eq("active", true)
        .order("name")
        .limit(100)
        .abortSignal(AbortSignal.timeout(5000));
      if (error) throw Error("catalog_unavailable");
      return (data ?? []).map((b) => b.name);
    },
    async categories() {
      const { data, error } = await publicClient
        .rpc("chatbot_catalog_categories")
        .abortSignal(AbortSignal.timeout(5000));
      if (error) throw Error("catalog_unavailable");
      return (data ?? []).map((p: { name: string }) => p.name);
    },
    async ownOrders() {
      if (!userId) return { authenticated: false, orders: [] };
      // Even a staff member asking through the public chat sees only their own orders.
      const { data, error } = await session
        .from("orders")
        .select("reference,stage,created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw Error("orders_unavailable");
      return {
        authenticated: true,
        orders: (data ?? []).map((o) => ({
          reference: o.reference,
          stage: o.stage,
          createdAt: o.created_at,
        })),
      };
    },
  };
}
