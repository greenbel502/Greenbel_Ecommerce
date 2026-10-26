import { z } from "zod";
const content = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const chatInput = z
  .object({
    message: content,
    requestId: z.uuid(),
    conversationId: z.uuid().nullable(),
    pagePath: z
      .string()
      .max(180)
      .regex(/^\/[a-zA-Z0-9/_-]*(?:#[a-zA-Z0-9_-]+)?$/)
      .optional(),
  })
  .strict();
export const knowledgeInput = z
  .object({
    id: z.uuid().optional(),
    question: z.string().trim().min(5).max(240),
    answer: z.string().trim().min(10).max(4000),
    category: z.enum([
      "greenbel",
      "pagos",
      "envios",
      "financiamiento",
      "posventa",
      "contacto",
      "compras",
      "capacitaciones",
    ]),
    keywords: z.string().trim().max(500),
    sourcePath: z
      .string()
      .regex(
        /^\/(?:contacto|financiamiento|productos|nosotros|carrito|capacitaciones|legal\/(?:privacidad|terminos|garantias))(?:#[a-z0-9_-]+)?$/,
      ),
    sourceNote: z.string().trim().min(5).max(500),
    active: z.boolean(),
    verified: z.boolean(),
  })
  .strict();
