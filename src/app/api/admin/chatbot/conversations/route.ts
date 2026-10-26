import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    await requireStaffActor(["admin"]);
    const id = new URL(request.url).searchParams.get("id");
    if (!z.uuid().safeParse(id).success)
      return NextResponse.json(
        { error: "Conversación inválida." },
        { status: 400, headers },
      );
    const { data, error } = await createSupabaseAdminClient()
      .from("chatbot_messages")
      .select("id,role,content,created_at,response_type,payload")
      .eq("conversation_id", id)
      .order("created_at")
      .order("role", { ascending: false })
      .limit(100);
    if (error) throw Error("unavailable");
    return NextResponse.json(
      {
        messages: (data ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          answer: m.payload,
        })),
      },
      { headers },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo consultar esta conversación." },
      {
        status:
          e instanceof StaffAuthorizationError
            ? e.reason === "unauthenticated"
              ? 401
              : 403
            : 503,
        headers,
      },
    );
  }
}
