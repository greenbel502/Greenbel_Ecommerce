/* eslint-disable @next/next/no-img-element -- Controlled private media routes and local object URL previews. */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  GraduationCap,
  Play,
  Search,
  Video,
} from "lucide-react";
import { getTrainingLibrary } from "@/application/use-cases/getTrainings";
import { readPublicData } from "@/lib/server/public-data-result";
import { PageStatus } from "@/presentation/components/page-status";
import { TrainingStars } from "@/presentation/components/training-stars";
import { trainingRatings } from "@/lib/server/training-ratings";
import styles from "./training.module.css";
export const metadata: Metadata = {
  title: "Capacitaciones",
  description:
    "Aprende a usar y cuidar tus equipos con los videos de GreenBel.",
};
export const dynamic = "force-dynamic";
export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const requested = typeof params.page === "string" ? Number(params.page) : 1;
  const result = await readPublicData(() => getTrainingLibrary(q, requested));
  if (result.status === "unavailable") return <PageStatus kind="unavailable" />;
  const library = result.data;
  const ratings = await trainingRatings(library.items.map((t) => t.id));
  const href = (page: number) =>
    "/capacitaciones?" +
    new URLSearchParams({ ...(q ? { q } : {}), page: String(page) });
  return (
    <div className={styles.library}>
      <header className={styles.libraryHeader}>
        <div>
          <span className="eyebrow">
            <GraduationCap size={18} aria-hidden="true" /> Aprende con GreenBel
          </span>
          <h1>
            Conocimiento para
            <br />
            hacer crecer tu trabajo.
          </h1>
          <p>
            Videos de uso, mantenimiento y cuidado. Encuentra tu capacitación y
            aprende a tu ritmo.
          </p>
        </div>
        <div className={styles.headerIcon} aria-hidden="true">
          <GraduationCap size={56} />
        </div>
      </header>
      <section
        aria-labelledby="training-title"
        className={styles.libraryContent}
      >
        <div className={styles.libraryToolbar}>
          <div>
            <h2 id="training-title">
              Todas las capacitaciones <span>{library.total}</span>
            </h2>
            <p>Guías prácticas, en un solo lugar.</p>
          </div>
          <form action="/capacitaciones" className={styles.librarySearch}>
            <label htmlFor="training-search">Buscar capacitación</label>
            <div>
              <Search size={18} aria-hidden="true" />
              <input
                id="training-search"
                name="q"
                defaultValue={q}
                placeholder="¿Qué quieres aprender?"
                maxLength={120}
              />
              <button type="submit" aria-label="Buscar capacitaciones">
                <ArrowRight size={19} />
              </button>
            </div>
          </form>
        </div>
        {library.items.length ? (
          <div className={styles.grid}>
            {library.items.map((training) => {
              const rating = ratings?.find(
                (r) => r.training_id === training.id,
              );
              return (
                <article className={styles.card} key={training.id}>
                  <Link
                    className={styles.coverLink}
                    href={`/capacitaciones/${training.slug}`}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {training.hasCover ? (
                      <img
                        className={styles.cover}
                        src={`/api/training-covers/${training.id}`}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className={styles.coverFallback}>
                        <GraduationCap size={44} />
                        <span>GreenBel · Capacitaciones</span>
                      </span>
                    )}
                    <span className={styles.playBadge}>
                      <Play size={23} fill="currentColor" />
                    </span>
                    <span className={styles.videoBadge}>
                      <Video size={13} />
                      Video
                    </span>
                  </Link>
                  <div className={styles.cardBody}>
                    <h3>
                      <Link href={`/capacitaciones/${training.slug}`}>
                        {training.title}
                      </Link>
                    </h3>
                    <p>
                      {training.description ||
                        "Aprende con esta guía práctica de GreenBel."}
                    </p>
                    <TrainingStars
                      average={rating?.average_rating ?? null}
                      count={Number(rating?.rating_count ?? 0)}
                      unavailable={ratings === null}
                    />
                    <Link
                      href={`/capacitaciones/${training.slug}`}
                      className={styles.cardAction}
                    >
                      Ver capacitación <ArrowRight size={17} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <GraduationCap size={38} />
            <h3>
              {q
                ? "No encontramos esa capacitación"
                : "Estamos preparando nuevas capacitaciones"}
            </h3>
            <p>
              {q
                ? "Prueba con otro nombre o consulta todos los videos."
                : "Aquí encontrarás los videos que publique GreenBel para acompañarte en tu trabajo."}
            </p>
            <Link
              className="secondary-dark-button"
              href={q ? "/capacitaciones" : "/productos"}
            >
              {q ? "Ver todas las capacitaciones" : "Explorar productos"}
            </Link>
          </div>
        )}
        {library.pages > 1 && (
          <nav
            className={styles.pagination}
            aria-label="Páginas de capacitaciones"
          >
            {library.page > 1 ? (
              <Link href={href(library.page - 1)}>
                <ArrowLeft size={17} />
                Anterior
              </Link>
            ) : (
              <span>Anterior</span>
            )}
            <span>
              Página {library.page} de {library.pages}
            </span>
            {library.page < library.pages ? (
              <Link href={href(library.page + 1)}>
                Siguiente
                <ArrowRight size={17} />
              </Link>
            ) : (
              <span>Siguiente</span>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
