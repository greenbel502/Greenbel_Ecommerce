import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  abuseSourceHash,
  isAllowedSubmissionOrigin,
  readLimitedBody,
} from "@/lib/server/public-submission";
import { getActiveEnvironment } from "@/lib/server/environment";
import {
  CHAT_COOKIE,
  ChatFailure,
  readChatIdentity,
} from "@/lib/chatbot/session";
import { chatInput } from "@/lib/chatbot/validation";
import { answerChat } from "@/lib/chatbot/engine";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { chatbotData } from "@/lib/chatbot/data";
import type { ChatAnswer, ChatContext } from "@/lib/chatbot/types";

export const runtime = "nodejs",
  dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
type Identity = Awaited<ReturnType<typeof readChatIdentity>>;
function json(value: unknown, status = 200, identity?: Identity) {
  const response = NextResponse.json(value, { status, headers });
  if (identity)
    response.cookies.set(CHAT_COOKIE, identity.token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production" ||
        !!getActiveEnvironment().appUrl?.startsWith("https://"),
      path: "/api/chat",
      maxAge: 30 * 86400,
    });
  return response;
}
function failure(error: unknown, identity?: Identity) {
  if (error instanceof ChatFailure)
    return json({ error: error.publicMessage }, error.status, identity);
  console.warn("greenbel_chat_unavailable", { code: "request_failed" });
  return json(
    {
      error:
        "El chat no está disponible en este momento. Puedes escribir desde Contacto.",
    },
    503,
    identity,
  );
}
export async function GET(request: Request) {
  let identity: Identity | undefined;
  try {
    if (request.headers.get("origin") && !isAllowedSubmissionOrigin(request))
      throw new ChatFailure(403, "Origen no permitido.");
    identity = await readChatIdentity();
    const id = new URL(request.url).searchParams.get("conversationId");
    if (!id) return json({ conversationId: null, messages: [] }, 200, identity);
    if (!z.uuid().safeParse(id).success)
      throw new ChatFailure(400, "Conversación inválida.");
    const { data, error } = await createSupabaseAdminClient().rpc(
      "chatbot_history",
      { p_id: id, p_hash: identity.hash, p_user: identity.userId },
    );
    if (error?.code === "42501")
      return json({ conversationId: null, messages: [] }, 200, identity);
    if (error) throw Error("history_unavailable");
    return json({ conversationId: id, messages: data }, 200, identity);
  } catch (error) {
    return failure(error, identity);
  }
}
export async function POST(request: Request) {
  let identity: Identity | undefined;
  try {
    if (!isAllowedSubmissionOrigin(request))
      throw new ChatFailure(403, "Origen no permitido.");
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new ChatFailure(415, "Formato de mensaje inválido.");
    const raw = await readLimitedBody(request, 8192);
    if (raw === null)
      throw new ChatFailure(413, "El mensaje es demasiado largo.");
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new ChatFailure(400, "No pudimos leer el mensaje.");
    }
    const parsed = chatInput.safeParse(input);
    if (!parsed.success)
      throw new ChatFailure(
        400,
        "Escribe un mensaje de hasta 1,000 caracteres.",
      );
    identity = await readChatIdentity();
    const source = abuseSourceHash(request, "chat");
    if (!source)
      throw new ChatFailure(503, "El chat no está disponible en este momento.");
    // A first request's UUID is its conversation UUID: retrying cannot mint a duplicate conversation.
    const id = parsed.data.conversationId ?? parsed.data.requestId;
    const admin = createSupabaseAdminClient();
    const started = await admin.rpc("chatbot_begin", {
      p_id: id,
      p_new: !parsed.data.conversationId,
      p_hash: identity.hash,
      p_user: identity.userId,
      p_request: parsed.data.requestId,
      p_message: parsed.data.message,
      p_source: source,
      p_identity: identity.identityHash,
    });
    if (started.error) {
      if (started.error.code === "42501")
        throw new ChatFailure(
          403,
          "No tienes acceso a esa conversación. Inicia una nueva.",
        );
      if (started.error.code === "P4290")
        throw new ChatFailure(
          429,
          "Has enviado varios mensajes. Espera un minuto; si el historial está lleno, inicia una nueva conversación.",
        );
      if (started.error.code === "P4090")
        throw new ChatFailure(
          409,
          "El mensaje cambió durante el envío. Inicia un nuevo mensaje.",
        );
      throw Error("chat_start_unavailable");
    }
    const begin = started.data as {
      status: string;
      messageId?: string;
      answer?: Omit<ChatAnswer, "context">;
      context?: ChatContext;
    };
    if (begin.status === "busy")
      throw new ChatFailure(
        409,
        "Tu mensaje anterior todavía se está procesando. Reintenta en unos segundos.",
      );
    if (begin.status === "ready" && begin.answer)
      return json(
        {
          conversationId: id,
          requestId: parsed.data.requestId,
          answer: begin.answer,
          repeated: true,
        },
        200,
        identity,
      );
    if (begin.status !== "started" || !begin.messageId)
      throw Error("chat_start_unconfirmed");
    let answer: ChatAnswer;
    try {
      let currentContext = begin.context ?? {};
      const productPage = parsed.data.pagePath?.match(
        /^\/productos\/([a-z0-9-]+)$/,
      );
      if (!currentContext.productIds?.length && productPage) {
        const pageProduct = await createSupabasePublicClient()
          .from("catalog_products")
          .select("id,sku")
          .eq("slug", productPage[1])
          .limit(1)
          .abortSignal(AbortSignal.timeout(3000))
          .maybeSingle();
        if (pageProduct.data)
          currentContext = {
            query: pageProduct.data.sku,
            productIds: [pageProduct.data.id],
          };
      }
      answer = await answerChat(
        parsed.data.message,
        currentContext,
        chatbotData(identity.client, identity.userId),
      );
    } catch {
      answer = {
        text: "No pude consultar la información actual de GreenBel. Inténtalo nuevamente o comunícate con su equipo desde Contacto.",
        type: "unknown",
        products: [],
        links: [{ href: "/contacto", label: "Contactar a GreenBel" }],
        sources: [],
        intents: ["unknown"],
        retrieval: "rule",
        unknown: true,
        context: begin.context ?? {},
        errorCode: "data_unavailable",
      };
    }
    answer.asOf = new Date().toISOString();
    const { context, ...payload } = answer;
    const finished = await admin.rpc("chatbot_finish", {
      p_id: id,
      p_hash: identity.hash,
      p_user: identity.userId,
      p_message_id: begin.messageId,
      p_answer: payload,
      p_context: context,
    });
    if (finished.error || !finished.data) throw Error("chat_save_unconfirmed");
    return json(
      {
        conversationId: id,
        requestId: parsed.data.requestId,
        answer: finished.data,
      },
      200,
      identity,
    );
  } catch (error) {
    return failure(error, identity);
  }
}
