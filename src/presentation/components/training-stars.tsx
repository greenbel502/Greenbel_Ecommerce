import { Star } from "lucide-react";
import styles from "./training-stars.module.css";
export function TrainingStars({
  average,
  count,
  unavailable = false,
}: {
  average: number | null;
  count: number;
  unavailable?: boolean;
}) {
  if (unavailable)
    return <span className={styles.empty}>Calificaciones no disponibles</span>;
  const label =
    count && average !== null
      ? `${average.toLocaleString("es-GT", { maximumFractionDigits: 2 })} de 5 · ${count} ${count === 1 ? "calificación" : "calificaciones"}`
      : "Sin calificaciones";
  return (
    <div className={styles.summary} role="img" aria-label={label}>
      <span className={styles.stars} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={styles.star}>
            <Star size={18} />
            <span
              style={{
                width: `${Math.max(0, Math.min(1, (average ?? 0) - i)) * 100}%`,
              }}
            >
              <Star size={18} fill="currentColor" />
            </span>
          </span>
        ))}
      </span>
      <span className={styles.caption}>
        {count && average !== null ? (
          <>
            <strong>
              {average.toLocaleString("es-GT", { maximumFractionDigits: 2 })}
            </strong>
            <span> ({count})</span>
          </>
        ) : (
          "Sin calificaciones"
        )}
      </span>
    </div>
  );
}
