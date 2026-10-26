export const knowledgeCategories = {
  greenbel: "GreenBel",
  pagos: "Pagos",
  envios: "Entregas",
  financiamiento: "Financiamiento",
  posventa: "Posventa",
  contacto: "Contacto",
  compras: "Compras",
  capacitaciones: "Capacitaciones",
};
export type KnowledgeRow = {
  id: string;
  question: string;
  answer: string;
  category: keyof typeof knowledgeCategories;
  keywords: string;
  source_path: string;
  source_note: string;
  is_active: boolean;
  verified: boolean;
  embedding_status: "pending" | "ready" | "error";
  updated_at: string;
};
export type ConversationRow = {
  id: string;
  customer_name: string;
  title: string;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  has_unknown: boolean;
};
export type ChatMetrics = {
  conversations: number;
  messages: number;
  answered: number;
  unknown: number;
  errors: number;
  categories: { intent: string; total: number }[];
  products: { name: string; total: number }[];
  questions: { question: string; total: number }[];
};
