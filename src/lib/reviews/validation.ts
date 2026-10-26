import { z } from "zod";

export const whatsAppReviewInput = z
  .object({
    invitationId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z
      .string()
      .trim()
      .min(1)
      .max(3000)
      .refine(
        (value) =>
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      ),
  })
  .strict();

export function publicReviewerName(value: string | null): string {
  const name = (value ?? "").trim().split(/\s+/)[0];
  return name && !name.includes("@") ? name.slice(0, 40) : "Cliente";
}
