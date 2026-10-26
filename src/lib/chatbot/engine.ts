import { analyzeMessage, knowledgeCategory, relatedTerms } from "./intents";
import { optionalEmbedding, type EmbeddingEngine } from "./embeddings";
import type { ChatAnswer, ChatContext, ChatIntent, ChatProduct } from "./types";

export type KnowledgeMatch = {
  id: string;
  question: string;
  answer: string;
  category: string;
  source_path: string;
  score: number;
  retrieval: "text" | "hybrid" | "rule";
};
export type EngineData = {
  products: (
    query: string,
    related: string[],
    mode: string,
    ids?: string[],
    excluded?: string[],
  ) => Promise<ChatProduct[]>;
  knowledge: (
    query: string,
    category: string | undefined,
    embedding: number[] | null,
  ) => Promise<KnowledgeMatch[]>;
  categoryKnowledge: (category: string) => Promise<KnowledgeMatch | null>;
  categories: () => Promise<string[]>;
  brands?: () => Promise<string[]>;
  ownOrders: () => Promise<{
    authenticated: boolean;
    orders: { reference: string; stage: string; createdAt: string }[];
  }>;
  embeddings?: EmbeddingEngine;
};
const contact = { href: "/contacto", label: "Hablar con GreenBel" };
const base = (intents: ChatIntent[], context: ChatContext): ChatAnswer => ({
  text: "",
  type: "navigation",
  products: [],
  links: [],
  sources: [],
  intents,
  retrieval: "rule",
  context,
  unknown: false,
});
const unknown = (intents: ChatIntent[], context: ChatContext): ChatAnswer => ({
  ...base(intents, context),
  text: "No tengo información confirmada sobre esa consulta. Puedes comunicarte con el equipo de GreenBel para recibir ayuda.",
  type: "unknown",
  links: [contact],
  unknown: true,
});
const catalogIntents = new Set<ChatIntent>([
  "products",
  "prices",
  "inventory",
  "promotions",
  "categories",
]);
const stageLabels: Record<string, string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  completed: "Completado",
  cancelled: "Cancelado",
  shipping_quote_requested: "Envío por cotizar",
};

/** Retrieval and deterministic answers. This function never executes model-generated code or SQL. */
export async function answerChat(
  message: string,
  context: ChatContext,
  data: EngineData,
): Promise<ChatAnswer> {
  const a = analyzeMessage(message, context);
  const reply = base(a.intents, context);
  if (a.unsafeAdvice)
    return {
      ...unknown(a.intents, context),
      text: "Para recomendar un tratamiento, una dosis o una mezcla se necesita orientación técnica y datos del cultivo. No tengo una recomendación agronómica validada para tu caso. Consulta al equipo de GreenBel.",
    };
  if (a.intents.includes("orders")) {
    const result = await data.ownOrders();
    if (!result.authenticated)
      return {
        ...reply,
        text: "Inicia sesión para consultar tus pedidos privados. Las solicitudes por WhatsApp se coordinan con GreenBel y no se convierten automáticamente en pedidos web.",
        links: [{ href: "/cuenta/ingresar", label: "Iniciar sesión" }],
        sources: [
          { type: "navigation", href: "/cuenta/pedidos", label: "Mis pedidos" },
        ],
      };
    return {
      ...reply,
      type: "orders",
      retrieval: "sql",
      text: result.orders.length
        ? "Estos son los pedidos web de tu cuenta:\n" +
          result.orders
            .map(
              (o) =>
                `${o.reference}: ${stageLabels[o.stage] ?? "Consulta el detalle para ver su avance"}.`,
            )
            .join("\n")
        : "No encuentro pedidos web en tu cuenta. Si enviaste una solicitud por WhatsApp, consulta su atención con GreenBel; abrir el chat no crea un pedido web.",
      links: [{ href: "/cuenta/pedidos", label: "Ver mis pedidos" }, contact],
      sources: [
        {
          type: "orders",
          href: "/cuenta/pedidos",
          label: "Pedidos de tu cuenta",
        },
      ],
    };
  }
  if (a.intents.includes("brands")) {
    const names = (await data.brands?.()) ?? [];
    return {
      ...reply,
      type: "catalog",
      retrieval: "sql",
      text: names.length
        ? `Estas son las marcas activas de GreenBel: ${names.join(", ")}. Puedes elegir una para explorar sus productos.`
        : "No encontré marcas activas para mostrar en este momento.",
      links: names.slice(0, 8).map((name) => ({
        href: `/productos?busqueda=${encodeURIComponent(name)}`,
        label: name,
      })),
      sources: [
        {
          type: "catalog",
          href: "/productos",
          label: "Marcas activas del catálogo",
        },
      ],
      context: { intent: "brands" },
    };
  }
  const categories = a.intents.includes("categories");
  const institutional = a.intents.filter((i) => knowledgeCategory[i]);
  const hasCatalog = a.intents.some((i) => catalogIntents.has(i));
  if (
    hasCatalog &&
    (!institutional.length ||
      a.intents.some((i) => ["products", "prices", "promotions"].includes(i)))
  ) {
    if (categories) {
      const names = await data.categories();
      return {
        ...reply,
        type: "catalog",
        retrieval: "sql",
        text: names.length
          ? `En el catálogo publicado puedes explorar: ${names.join(", ")}. ¿Qué producto buscas?`
          : "No hay categorías publicadas disponibles para consultar ahora.",
        links: [{ href: "/productos", label: "Explorar catálogo" }],
        sources: [
          { type: "catalog", href: "/productos", label: "Catálogo vigente" },
        ],
        context: { intent: "categories" },
      };
    }
    if (
      !a.query &&
      !a.cheapest &&
      !a.intents.includes("promotions") &&
      (!a.intents.includes("products") || a.intents.includes("prices")) &&
      !context.productIds?.length
    )
      return {
        ...reply,
        text: "Indícame el nombre o código del producto para consultar su precio y disponibilidad actuales.",
        links: [{ href: "/productos", label: "Ver productos" }],
      };
    const mode = a.intents.includes("promotions")
      ? "promotions"
      : a.cheapest
        ? "cheapest"
        : "relevance";
    const ids =
      !a.query && !a.cheapest && !a.more && a.followup
        ? context.productIds
        : undefined;
    const products = await data.products(
      a.query,
      relatedTerms(a.query),
      mode,
      ids,
      a.more ? (context.shownIds ?? context.productIds) : undefined,
    );
    const extra = institutional.length
      ? await reviewed(message, a.intents, data)
      : null;
    if (!products.length) {
      const fallback = extra ?? (await reviewed(message, [], data));
      if (fallback)
        return {
          ...reply,
          ...fallback,
          text:
            (a.query
              ? "No encontré un producto publicado que coincida con esa búsqueda.\n\n"
              : "") + fallback.text,
        };
      if (mode === "promotions")
        return {
          ...reply,
          type: "catalog",
          retrieval: "sql",
          text: "No encontré promociones vigentes para esa búsqueda en el catálogo publicado.",
          links: [{ href: "/productos", label: "Ver catálogo" }],
          sources: [
            { type: "catalog", href: "/productos", label: "Ofertas vigentes" },
          ],
        };
      return {
        ...unknown(a.intents, context),
        text: "No encontré un producto publicado que coincida con esa consulta. Prueba con su nombre o código; también puedes pedir ayuda al equipo de GreenBel.",
        links: [
          { href: "/productos", label: "Buscar en el catálogo" },
          contact,
        ],
      };
    }
    let text = a.intents.includes("greeting") ? "¡Hola! " : "";
    text +=
      mode === "cheapest"
        ? "Estas son las opciones de menor precio en tu búsqueda actual:"
        : mode === "promotions"
          ? "Estas son las promociones vigentes que encontré:"
          : "Encontré estas opciones en el catálogo vigente:";
    if (
      a.intents.includes("inventory") &&
      products.some((p) => p.availability === "unknown")
    )
      text +=
        " La existencia de los productos indicados está por confirmar con GreenBel.";
    if (!extra && products.length === 1 && products[0].description)
      text += "\n\n" + products[0].description;
    return {
      ...reply,
      text: text + (extra ? "\n\n" + extra.text : ""),
      type: "catalog",
      retrieval: "sql",
      products,
      links: [
        { href: "/productos", label: "Ver catálogo completo" },
        ...(extra?.links ?? []),
      ],
      sources: [
        ...products.map((p) => ({
          type: "catalog" as const,
          id: p.id,
          href: `/productos/${p.slug}`,
          label: p.sku,
        })),
        ...(extra?.sources ?? []),
      ],
      context: {
        query: a.query,
        productIds: products.map((p) => p.id),
        shownIds: [
          ...new Set([
            ...(a.more ? (context.shownIds ?? context.productIds ?? []) : []),
            ...products.map((p) => p.id),
          ]),
        ].slice(-30),
        intent: a.cheapest ? "prices" : "products",
      },
    };
  }
  if (a.intents.every((i) => ["greeting", "farewell"].includes(i)))
    return {
      ...reply,
      text: a.intents.includes("greeting")
        ? "¡Hola! Soy Bell, el asistente virtual de GreenBel. Puedo ayudarte a consultar productos, precios y la información confirmada de la tienda. ¿Qué deseas encontrar?"
        : "¡Con gusto! Si necesitas algo más, puedes volver a escribir aquí.",
      links: [{ href: "/productos", label: "Explorar productos" }, contact],
    };
  const result = await reviewed(message, a.intents, data);
  return result
    ? {
        ...reply,
        ...result,
        text: (a.intents.includes("greeting") ? "¡Hola! " : "") + result.text,
        context: { ...context, intent: institutional[0] ?? "general" },
      }
    : unknown(a.intents, context);
}

async function reviewed(
  message: string,
  intents: ChatIntent[],
  data: EngineData,
): Promise<Pick<
  ChatAnswer,
  "text" | "type" | "retrieval" | "links" | "sources"
> | null> {
  const vector = await optionalEmbedding(message, "query", data.embeddings);
  const institutional = intents.filter((i) => knowledgeCategory[i]);
  const category = institutional.length
    ? knowledgeCategory[institutional[0]]
    : undefined;
  let matches = await data.knowledge(message, category, vector);
  if (!matches.length && category) {
    const match = await data.categoryKnowledge(category);
    if (match) matches = [match];
  }
  if (!matches.length) return null;
  const first = matches[0];
  const second =
    institutional.length > 1
      ? await data.categoryKnowledge(knowledgeCategory[institutional[1]]!)
      : null;
  const chosen =
    second &&
    second.id !== first.id &&
    first.answer.length + second.answer.length + 2 <= 4000
      ? [first, second]
      : [first];
  return {
    text: chosen.map((m) => m.answer).join("\n\n"),
    type: "knowledge",
    retrieval: first.retrieval,
    links: [
      ...new Map(
        chosen.map((m) => [
          m.source_path,
          { href: m.source_path, label: "Consultar información" },
        ]),
      ).values(),
    ],
    sources: chosen.map((m) => ({
      type: "knowledge",
      id: m.id,
      label: m.question,
      href: m.source_path,
    })),
  };
}
