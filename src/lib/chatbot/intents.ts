import type { ChatContext, ChatIntent } from "./types";

export function normalizeSpanish(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-GT")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const rules: [ChatIntent, RegExp][] = [
  [
    "greeting",
    /\b(hola|buenos dias|buenas tardes|buenas noches|que onda|buenas)\b/,
  ],
  ["farewell", /\b(gracias|adios|hasta luego|nos vemos)\b/],
  [
    "orders",
    /\b(pedido|pedidos|seguimiento|mi orden|mis ordenes|estado de compra)\b/,
  ],
  [
    "financing",
    /\b(financiamiento|financiar|financiado|financian|credito|cooperativa|prestamo)\b/,
  ],
  ["purchase", /\b(comprar|compro|cotizacion|cotizar|pdf|carrito)\b/],
  [
    "trainings",
    /\b(capacitacion|capacitaciones|video|videos|tutorial|tutoriales)\b/,
  ],
  [
    "payment",
    /\b(pagar|pago|pagos|efectivo|transferencia|tarjeta|cuenta bancaria)\b/,
  ],
  [
    "shipping",
    /\b(envio|envios|entrega|entregar|retiro|recoger|domicilio|mandar|mandan|mandarme|xela|quetzaltenango|departamento|departamentos|transportadora|cobertura)\b/,
  ],
  [
    "policies",
    /\b(garantia|devolucion|devolver|danado|defectuoso|rompio|problema|politica|cancelar|reembolso|reclamo)\b/,
  ],
  [
    "contact",
    /\b(contacto|comunicar|telefono|correo|whatsapp|asesor|persona|humano|ubicacion|direccion|horario|donde quedan|cuando atienden)\b/,
  ],
  [
    "promotions",
    /\b(promocion|promociones|oferta|ofertas|descuento|descuentos)\b/,
  ],
  [
    "prices",
    /\b(precio|precios|cuesta|cuestan|cuanto vale|cuanto valen|costo|barato|barata|baratos|economico|economica)\b/,
  ],
  [
    "inventory",
    /\b(inventario|existencia|existencias|stock|disponible|disponibles|agotado|tienen|hay)\b/,
  ],
  ["brands", /\b(marca|marcas|fabricante|fabricantes)\b/],
  ["categories", /\b(categoria|categorias|que venden|que productos venden)\b/],
  [
    "products",
    /\b(producto|productos|catalogo|busco|buscando|buscar|mostrar|muestra|ver|fertilizante|fertilizantes|abono|abonos|foliar|motosierra|motobomba|aspersor|desbrozadora|repuesto|insecticida|herbicida|fungicida|similar|similares|caracteristicas|especificaciones|detalle|incluye|opciones|recomendaciones|recomendacinoes|recomiendame)\b/,
  ],
  [
    "general",
    /\b(quienes son|que es greenbel|sobre greenbel|cultivo|cultivos)\b/,
  ],
];
const stop = new Set(
  "hola buenos dias buenas tardes noches que onda gracias por favor quiero quisiera estoy estamos buscando busco buscar busca tienen disponible disponibles existencia existencias stock producto productos catalogo cuanto cuesta cuestan vale valen precio precios cual cuales son es el la los las un una unos unas de del en a al para por con y o si me mi mis tu tus se lo esto este estos ese esos hay mas menos muy barato barata baratos economico economica mostrar muestra puedes puede podes ver similar similares algo tiene tiene necesito informacion sobre vender venden articulos como donde hacen envio envios entrega enviar domicilio pago pagar forma metodo transferencia efectivo tambien caracteristicas especificaciones detalle incluye mira dame damos tus otros otras profavro porfavor neseito opciones recomendacion recomendaciones recomendacinoes recomiendame necesito esta recomendado recomendados".split(
    " ",
  ),
);

export function analyzeMessage(message: string, context: ChatContext = {}) {
  const normalized = normalizeSpanish(message);
  const intents = rules
    .filter(([, rule]) => rule.test(normalized))
    .map(([intent]) => intent);
  const unsafeAdvice =
    /\b(dosis|dosificacion|mezclar|aplicar|por hectarea|mililitros|cura|curar|tratar plaga|tratar enfermedad|mejorar mis cultivos)\b/.test(
      normalized,
    );
  const cheapest =
    /\b(barat[oa]s?|economic[oa]s?|menor precio|mas barato)\b/.test(normalized);
  const similar = /\bsimilares?\b/.test(normalized);
  const query = normalized
    .split(" ")
    .filter((t) => t.length > 1 && !stop.has(t))
    .join(" ")
    .slice(0, 120);
  const more =
    /\b(mas opciones|otras opciones|otros productos|mas productos|otros equipos|ver mas)\b/.test(
      normalized,
    );
  const followup =
    !query &&
    (more ||
      cheapest ||
      similar ||
      intents.some((i) => ["prices", "inventory"].includes(i)));
  const catalogQuery = followup ? (context.query ?? "") : query;
  if (!intents.length) intents.push(query ? "products" : "unknown");
  return {
    normalized,
    intents,
    unsafeAdvice,
    cheapest,
    similar,
    more,
    query: catalogQuery,
    followup,
  };
}

export const knowledgeCategory: Partial<Record<ChatIntent, string>> = {
  purchase: "compras",
  trainings: "capacitaciones",
  payment: "pagos",
  shipping: "envios",
  financing: "financiamiento",
  policies: "posventa",
  contact: "contacto",
  general: "greenbel",
};

const synonyms: Record<string, string[]> = {
  fertilizante: ["foliar", "abono"],
  fertilizantes: ["foliar", "abono"],
  abono: ["foliar", "fertilizante"],
  aspersor: ["aspersion", "fumigadora"],
  fumigadora: ["aspersion", "aspersor"],
  bomba: ["motobomba"],
  motosiera: ["motosierra"],
  fertlizante: ["foliar", "fertilizante"],
  fertilisante: ["foliar", "fertilizante"],
};
export function relatedTerms(query: string) {
  if (/\b(organic[oa]|dosis|tratamiento)\b/.test(query)) return [];
  return [...new Set(query.split(" ").flatMap((t) => synonyms[t] ?? []))].slice(
    0,
    8,
  );
}
