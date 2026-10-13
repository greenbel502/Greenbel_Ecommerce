import Link from "next/link";
import { ArrowLeft, CloudOff, SearchX } from "lucide-react";
import { RetryPageButton } from "./retry-page-button";
import styles from "./page-status.module.css";

type Props = {
  kind: "unavailable" | "not-found";
  title?: string;
  description?: string;
};

export function PageStatus({ kind, title, description }: Props) {
  const unavailable = kind === "unavailable";
  const Icon = unavailable ? CloudOff : SearchX;

  return <section className={styles.shell} aria-labelledby="page-status-title">
    <div className={styles.card}>
      <span className={styles.icon}><Icon size={34} aria-hidden="true" /></span>
      <span className={styles.label}>{unavailable ? "Estamos aquí para ayudarte" : "Error 404"}</span>
      <h1 id="page-status-title">{title ?? (unavailable
        ? "Servicio temporalmente no disponible"
        : "No encontramos esta página")}</h1>
      <p>{description ?? (unavailable
        ? "No pudimos cargar la información en este momento. Puedes reintentar en unos minutos."
        : "El enlace puede haber cambiado o la página ya no está disponible. Puedes volver al inicio o explorar nuestros productos.")}</p>
      <div className={styles.actions}>
        {unavailable ? <RetryPageButton />
          : <Link href="/productos" className="primary-button">Explorar productos</Link>}
        <Link href="/" className="secondary-dark-button"><ArrowLeft size={18} aria-hidden="true" /> Volver al inicio</Link>
      </div>
      {unavailable && <Link href="/contacto" className={styles.contact}>Ver canales de contacto</Link>}
    </div>
  </section>;
}
