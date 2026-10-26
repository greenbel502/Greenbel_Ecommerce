import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { listState, type AdminParams, type ListConfig } from "@/lib/admin-list";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import type {
  KnowledgeRow,
  ConversationRow,
  ChatMetrics,
} from "@/lib/chatbot/admin-types";
import { ChatbotAdmin } from "./chatbot-admin";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bell · Asistente",
  robots: { index: false, follow: false },
};
const knowledgeConfig: ListConfig = {
  search: ["question", "answer", "keywords"],
  sorts: { updated_at: "Actualización", question: "Pregunta" },
  filterLabel: "Indexación",
  filterColumn: "embedding_status",
  filters: { pending: "Pendiente", ready: "Indexado", error: "Con error" },
};
const conversationConfig: ListConfig = {
  search: ["title", "customer_name"],
  sorts: { last_activity_at: "Última actividad", created_at: "Fecha" },
  filterLabel: "Atención",
  filterColumn: "has_unknown",
  filters: {
    true: "Con consultas sin respuesta",
    false: "Consultas respondidas",
  },
};
export default async function ChatbotPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  try {
    await requireStaffActor(["admin"]);
  } catch (e) {
    if (e instanceof StaffAuthorizationError && e.reason === "unauthenticated")
      redirect("/cuenta/ingresar");
    if (e instanceof StaffAuthorizationError && e.reason === "forbidden")
      notFound();
    throw e;
  }
  const params = await searchParams,
    tab = params.tab === "conversations" ? "conversations" : "knowledge",
    config = tab === "knowledge" ? knowledgeConfig : conversationConfig,
    state = listState(params, "", config),
    admin = createSupabaseAdminClient(),
    session = await createSupabaseReadClient();
  const [listed, metrics] = await Promise.all([
    tab === "knowledge"
      ? queryAdminList<KnowledgeRow>(
          admin,
          "chatbot_admin_knowledge",
          "id,question,answer,category,keywords,source_path,source_note,is_active,verified,embedding_status,updated_at",
          state,
          config,
        )
      : queryAdminList<ConversationRow>(
          admin,
          "chatbot_admin_conversations",
          "id,customer_name,title,created_at,last_activity_at,message_count,has_unknown",
          state,
          config,
        ),
    session.rpc("chatbot_admin_metrics"),
  ]);
  if (metrics.error) throw Error("Chatbot metrics unavailable");
  return (
    <ChatbotAdmin
      tab={tab}
      knowledge={tab === "knowledge" ? (listed.data as KnowledgeRow[]) : []}
      conversations={
        tab === "conversations" ? (listed.data as ConversationRow[]) : []
      }
      metrics={metrics.data as ChatMetrics}
      controls={
        <ListTools
          state={state}
          config={config}
          path="/admin/chatbot"
          label={tab === "knowledge" ? "respuestas" : "conversaciones"}
        />
      }
      pager={<ListPager state={state} path="/admin/chatbot" />}
      empty={
        <ListEmpty
          state={state}
          path="/admin/chatbot"
          noun={tab === "knowledge" ? "respuestas" : "conversaciones"}
        />
      }
    />
  );
}
