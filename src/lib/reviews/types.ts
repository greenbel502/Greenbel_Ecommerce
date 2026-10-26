export type ReviewSource = "product" | "whatsapp";
export type ReviewStatus = "pending" | "visible" | "hidden";
export type AdminReview = Readonly<{
  id: string;
  source: ReviewSource;
  customerName: string;
  subject: string;
  reference: string;
  rating: number;
  comment: string;
  createdAt: string;
  moderationStatus: ReviewStatus;
  moderationReason: string | null;
}>;
export const reviewStatusLabel: Record<ReviewStatus, string> = {
  pending: "Pendiente",
  visible: "Publicada",
  hidden: "Oculta",
};
export const reviewReasons = {
  spam: "Spam",
  personal_data: "Datos personales",
  offensive_content: "Contenido ofensivo",
} as const;
