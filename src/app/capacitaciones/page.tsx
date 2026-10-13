import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { getPublicTrainings } from "@/application/use-cases/getTrainings";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
import styles from "./training.module.css";
import { readPublicData } from "@/lib/server/public-data-result";
import { PageStatus } from "@/presentation/components/page-status";

export const metadata: Metadata = {
  title: "Capacitaciones",
  description: "Videos públicos para aprender a usar y cuidar los equipos GreenBel."
};

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const result = await readPublicData(getPublicTrainings);
  if (result.status === "unavailable") return <PageStatus kind="unavailable" />;
  const trainings = result.data;
  if (trainings.length > 0) {
    return (
      <section className="section" aria-labelledby="training-title">
        <Reveal as="span" className="eyebrow">Videos de uso y cuidado</Reveal>
        <AnimatedTitle as="h1" id="training-title" lines={["Capacitaciones"]} />
        <p className={styles.intro}>Consulta los videos publicados por GreenBel.</p>
        <div className={styles.grid}>
          {trainings.map((training) => (
            <article className={styles.card} key={training.id}>
              {training.hasCover ? (
                // The route checks publication before serving the private Storage object.
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.cover} src={`/api/training-covers/${training.id}`} alt={`Portada: ${training.title}`} />
              ) : <span className={styles.icon}><GraduationCap size={28} aria-hidden="true" /></span>}
              <h2>{training.title}</h2>
              {training.description && <p>{training.description}</p>}
              <Link href={`/capacitaciones/${training.slug}`}>Ver capacitación <ArrowRight size={17} /></Link>
            </article>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="empty-state" aria-labelledby="training-title">
      <GraduationCap size={42} aria-hidden="true" />
      <Reveal as="span" className="eyebrow">Videos de uso y cuidado</Reveal>
      <AnimatedTitle as="h1" id="training-title" lines={["Capacitaciones"]} />
      <Reveal as="p" delay={0.16}>
        Aún no hay videos de capacitación disponibles en este sitio. Aquí podrás consultar guías públicas para usar y cuidar los equipos.
      </Reveal>
      <Reveal delay={0.24}>
        <Link href="/productos" className="primary-button">Explorar productos</Link>
      </Reveal>
    </section>
  );
}
