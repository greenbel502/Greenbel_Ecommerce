export type ChatIntent =
  | "greeting"
  | "farewell"
  | "general"
  | "purchase"
  | "trainings"
  | "products"
  | "prices"
  | "inventory"
  | "brands"
  | "categories"
  | "promotions"
  | "payment"
  | "shipping"
  | "financing"
  | "orders"
  | "policies"
  | "contact"
  | "unknown";
export type ChatContext = {
  query?: string;
  categoryId?: string;
  productIds?: string[];
  shownIds?: string[];
  intent?: ChatIntent;
};
export type ChatLink = { href: string; label: string };
export type ChatProduct = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  price: number | null;
  regularPrice: number | null;
  availability: "available" | "unavailable" | "unknown";
  image: string;
};
export type ChatSource = {
  type: "knowledge" | "catalog" | "orders" | "navigation";
  id?: string;
  label: string;
  href: string;
};
export type ChatAnswer = {
  text: string;
  type: "catalog" | "knowledge" | "navigation" | "unknown" | "orders";
  products: ChatProduct[];
  links: ChatLink[];
  sources: ChatSource[];
  intents: ChatIntent[];
  retrieval: "sql" | "text" | "hybrid" | "rule";
  context: ChatContext;
  unknown: boolean;
  errorCode?: "data_unavailable";
  asOf?: string;
};
export type ChatMessage = {
  id: string;
  requestId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  answer?: Omit<ChatAnswer, "context">;
};
export type ChatSession = {
  conversationId: string | null;
  messages: ChatMessage[];
};
