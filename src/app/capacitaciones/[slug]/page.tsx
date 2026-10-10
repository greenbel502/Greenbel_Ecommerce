import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, GraduationCap } from "lucide-react";
import { getPublicTrainingBySlug, getTrainingRelatedProducts } from "@/application/use-cases/getTrainings";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
import styles from "../training.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const training = await getPublicTrainingBySlug(slug);
  return training
    ? { title: training.title, description: training.description ?? "Capacitación pública GreenBel." }
    : { title: "Capacitación no encontrada" };
}

export default async function TrainingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const training = await getPublicTrainingBySlug(slug);
  if (!training) notFound();
  const relatedProducts = await getTrainingRelatedProducts(training.id);
  const pathname = new URL(training.videoUrl).pathname.toLowerCase();
  const directlyPlayable = /\.(?:mp4|webm|ogg)$/.test(pathname);

  return (
    <section className="section" aria-labelledby="training-detail-title">
      <Link className={styles.back} href="/capacitaciones"><ArrowLeft size={17} /> Todas las capacitaciones</Link>
      <Reveal as="span" className="eyebrow">Video de capacitación</Reveal>
      <AnimatedTitle as="h1" id="training-detail-title" lines={[training.title]} />
      {training.description && <p className={styles.intro}>{training.description}</p>}
      {training.hasCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.detailCover} src={`/api/training-covers/${training.id}`} alt={`Portada: ${training.title}`} />
      )}
      {directlyPlayable ? (
        <video className={styles.video} controls preload="metadata" src={training.videoUrl}>
          Tu navegador no puede reproducir este video.
        </video>
      ) : (
        <div className={styles.external}>
          <GraduationCap size={40} aria-hidden="true" />
          <p>Este video se reproduce en su sitio de origen.</p>
          <a href={training.videoUrl} target="_blank" rel="noopener noreferrer">Abrir video <ExternalLink size={17} /></a>
        </div>
      )}
      {relatedProducts.length > 0 && <section className={styles.related} aria-labelledby="training-related-title">
        <h2 id="training-related-title">Productos relacionados</h2>
        <p>Estos productos están publicados actualmente en el catálogo.</p>
        <div className={styles.relatedGrid}>{relatedProducts.map((product) => <article key={product.id} className={styles.relatedCard}>
          <small>{product.sku}</small>
          <h3>{product.name}</h3>
          {product.shortDescription && <p>{product.shortDescription}</p>}
          <Link href={`/productos/${product.slug}`}>Ver producto</Link>
        </article>)}</div>
      </section>}
    </section>
  );
}
