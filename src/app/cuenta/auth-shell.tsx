import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./auth.module.css";

export function AuthShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.page}>
      <div className={styles.intro}>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link href="/productos" className="inline-link">Volver al catálogo</Link>
      </div>
      <div className={styles.card}>{children}</div>
    </section>
  );
}
