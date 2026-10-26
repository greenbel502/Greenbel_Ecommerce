import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  GraduationCap,
  Package,
  Video,
} from "lucide-react";
import {
  getPublicTrainingBySlug,
  getTrainingRelatedProducts,
} from "@/application/use-cases/getTrainings";
import { readPublicData } from "@/lib/server/public-data-result";
import { PageStatus } from "@/presentation/components/page-status";
import { TrainingVideo } from "@/presentation/components/training-video";
import { TrainingStars } from "@/presentation/components/training-stars";
import { TrainingRatingForm } from "@/presentation/components/training-rating-form";
import {
  trainingRatings,
  trainingRatingViewer,
} from "@/lib/server/training-ratings";
import styles from "../training.module.css";
import { breadcrumbStructuredData, pageMetadata, serializeStructuredData } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await readPublicData(() => getPublicTrainingBySlug(slug));
  return r.status === "unavailable"
    ? {
        title: "Capacitación temporalmente no disponible",
        robots: { index: false },
      }
    : r.data
      ? pageMetadata({
          title: r.data.title,
          description: r.data.description ?? "Capacitación pública GreenBel.",
          path: `/capacitaciones/${encodeURIComponent(r.data.slug)}`,
          ...(r.data.hasCover ? { image: `/api/training-covers/${r.data.id}` } : {}),
        })
      : { title: "Capacitación no encontrada", robots: { index: false } };
}
export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await readPublicData(() => getPublicTrainingBySlug(slug));
  if (r.status === "unavailable") return <PageStatus kind="unavailable" />;
  const training = r.data;
  if (!training) notFound();
  const [related, ratings, viewer] = await Promise.all([
    readPublicData(() => getTrainingRelatedProducts(training.id)),
    trainingRatings([training.id]),
    trainingRatingViewer(training.id),
  ]);
  const rating = ratings?.[0];
  return (
    <div className={styles.detailShell}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(breadcrumbStructuredData([
        { name: "Inicio", path: "/" },
        { name: "Capacitaciones", path: "/capacitaciones" },
        { name: training.title, path: `/capacitaciones/${encodeURIComponent(training.slug)}` },
      ])) }} />
      <Link className={styles.back} href="/capacitaciones">
        <ArrowLeft size={17} />
        Todas las capacitaciones
      </Link>
      <div className={styles.detailLayout}>
        <div className={styles.detailMain}>
          <TrainingVideo
            title={training.title}
            url={training.videoUrl}
            poster={
              training.hasCover
                ? `/api/training-covers/${training.id}`
                : undefined
            }
          />
          <header className={styles.detailHeading}>
            <span className="eyebrow">
              <Video size={16} />
              Video de capacitación
            </span>
            <h1>{training.title}</h1>
            <TrainingStars
              average={rating?.average_rating ?? null}
              count={Number(rating?.rating_count ?? 0)}
              unavailable={ratings === null}
            />
          </header>
          <section
            className={styles.description}
            aria-labelledby="training-description-title"
          >
            <h2 id="training-description-title">
              <BookOpen size={21} />
              Acerca de este video
            </h2>
            <p>
              {training.description ||
                "GreenBel comparte esta capacitación para acompañarte en el uso y cuidado de tus equipos."}
            </p>
          </section>
          <TrainingRatingForm id={training.id} viewer={viewer} />
        </div>
        <aside className={styles.detailAside}>
          <section className={styles.learningNote}>
            <span className={styles.learningIcon}>
              <GraduationCap size={29} />
            </span>
            <span className="eyebrow">Aprende a tu ritmo</span>
            <h2>Conocimiento que se pone en práctica.</h2>
            <p>
              Pausa, vuelve a ver el video y consulta los detalles cuando lo
              necesites.
            </p>
            <Link href="/capacitaciones">
              Explorar más videos <ArrowRight size={17} />
            </Link>
          </section>
          <section
            className={styles.related}
            aria-labelledby="training-related-title"
          >
            <h2 id="training-related-title">
              <Package size={20} />
              Productos relacionados
            </h2>
            {related.status === "unavailable" ? (
              <p role="status">
                No se pudieron cargar los productos relacionados.
              </p>
            ) : related.data.length ? (
              <div className={styles.relatedGrid}>
                {related.data.map((p) => (
                  <article className={styles.relatedCard} key={p.id}>
                    <small>{p.sku}</small>
                    <h3>{p.name}</h3>
                    {p.shortDescription && <p>{p.shortDescription}</p>}
                    <Link href={`/productos/${p.slug}`}>
                      Ver producto <ArrowRight size={15} />
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <p>No hay productos vinculados a esta capacitación.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
