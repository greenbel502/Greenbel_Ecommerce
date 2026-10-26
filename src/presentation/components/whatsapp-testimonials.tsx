import { MessageSquareQuote, Star } from "lucide-react";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { publicReviewerName } from "@/lib/reviews/validation";
import styles from "./whatsapp-testimonials.module.css";

export async function WhatsAppTestimonials() {
  const rows = await readPublicOpinions();
  if (!rows.length) return null;
  return <PublicOpinions rows={rows} />;
}

type Opinion = {
  id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
};
async function readPublicOpinions(): Promise<Opinion[]> {
  // These opinions have a separate origin and never affect product ratings.
  try {
    const { data, error } = await createSupabasePublicClient()
      .rpc("published_whatsapp_reviews")
      .abortSignal(AbortSignal.timeout(4000));
    return error || !Array.isArray(data) ? [] : data;
  } catch {
    return [];
  }
}
function PublicOpinions({ rows }: { rows: Opinion[] }) {
  return (
    <div className={styles.section}>
      <div className={styles.heading}>
        <MessageSquareQuote size={20} />
        <h3>Experiencias al solicitar por WhatsApp</h3>
      </div>
      <div className={styles.grid}>
        {rows.map((row) => (
          <article key={row.id} className={styles.card}>
            <div
              className={styles.stars}
              role="img"
              aria-label={`${row.rating} de 5 estrellas`}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  aria-hidden="true"
                  size={18}
                  fill={n <= row.rating ? "currentColor" : "none"}
                />
              ))}
            </div>
            <blockquote>{row.comment}</blockquote>
            <footer>
              <span className={styles.avatar} aria-hidden="true">
                {publicReviewerName(row.author_name).slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{publicReviewerName(row.author_name)}</strong>
                <small>Solicitud por WhatsApp</small>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
