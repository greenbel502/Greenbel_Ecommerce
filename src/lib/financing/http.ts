import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAllowedSubmissionOrigin,
  readLimitedBody,
} from "@/lib/server/public-submission";
import { FinancingError, FINANCING_LOGIN } from "./workflow";
import { CustomerProfileError } from "@/lib/server/customer-profile";
export function financingJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function financeInput<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!isAllowedSubmissionOrigin(request)) throw new FinancingError("P4030");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new FinancingError("P4000");
  try {
    const raw = await readLimitedBody(request, 4096);
    return schema.parse(JSON.parse(raw ?? ""));
  } catch {
    throw new FinancingError("P4000");
  }
}
export function financingFailure(error: unknown) {
  if (error instanceof CustomerProfileError)
    return financingJson(
      {
        error:
          error.status === 401
            ? "Inicia sesión para enviar tu solicitud de financiamiento. Tu carrito se conservará."
            : error.status === 403
              ? "Esta cuenta no está habilitada para enviar solicitudes."
              : "No pudimos comprobar tu sesión. Reintenta.",
        ...(error.status === 401 ? { loginUrl: FINANCING_LOGIN } : {}),
      },
      error.status,
    );
  const code = error instanceof FinancingError ? error.code : "P5030";
  const errors: Record<string, [number, string]> = {
    P4000: [400, "Revisa los datos de la solicitud."],
    P4030: [403, "No puedes acceder a esta solicitud con la cuenta actual."],
    P4090: [
      409,
      "Revisa el consentimiento y los datos de la solicitud antes de enviar.",
    ],
    P4120: [
      412,
      "El destinatario configurado cambió. Inicia una solicitud nueva para confirmar el envío.",
    ],
    P4290: [
      429,
      "Espera antes de reintentar. Hay un límite temporal de solicitudes.",
    ],
  };
  const [status, message] = errors[code] ?? [
    503,
    "El servicio no está disponible ahora. Tu solicitud permanece guardada.",
  ];
  return financingJson({ error: message }, status);
}
