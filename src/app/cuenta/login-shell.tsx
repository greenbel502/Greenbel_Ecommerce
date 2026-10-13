import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, PackageCheck, ShoppingBag, UserRound } from "lucide-react";
import styles from "./auth.module.css";

export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <section className={styles.loginPage} aria-label="Acceso a GreenBel">
      <div className={styles.loginStory}>
        <Image src="/images/greenbel-login-agricola-v1.webp" alt="" fill sizes="(max-width: 760px) 100vw, 50vw" priority className={styles.loginPhoto} />
        <div className={styles.storyContent}>
          <span className={styles.storyEyebrow}>TU CUENTA GREENBEL</span>
          <h1>Equipa tu campo.<br /><span>Compra más fácil.</span></h1>
          <p>Encuentra equipos y repuestos, guarda tus datos de compra y consulta tus pedidos cuando lo necesites.</p>
          <ul className={styles.loginBenefits}>
            <li><ShoppingBag aria-hidden="true" /><span>Continúa<br />tu compra</span></li>
            <li><PackageCheck aria-hidden="true" /><span>Tus pedidos<br />a la mano</span></li>
            <li><UserRound aria-hidden="true" /><span>Tus datos<br />guardados</span></li>
          </ul>
          <Link href="/productos" className={styles.catalogBack}><ArrowLeft size={17} aria-hidden="true" /> Explorar el catálogo</Link>
        </div>
      </div>
      <div className={styles.loginFormPanel}>
        <div className={`${styles.card} ${styles.loginCard}`}>{children}</div>
        <p className={styles.loginFootnote}>Equipos y soluciones para seguir creciendo.</p>
      </div>
    </section>
  );
}
