/* eslint-disable @next/next/no-img-element -- Controlled private media routes and local object URL previews. */
"use client";
import { useEffect, useState } from "react";
import { Play, ExternalLink, Film } from "lucide-react";
import { trainingVideoSource } from "@/lib/trainings/media";
import styles from "@/app/capacitaciones/training.module.css";
export function TrainingVideo({
  url,
  title,
  poster,
}: {
  url: string;
  title: string;
  poster?: string;
}) {
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    setPlaying(false);
    setError(false);
  }, [url]);
  const source = trainingVideoSource(url);
  if (source.kind === "file")
    return (
      <div className={styles.player}>
        <video
          aria-label={title}
          controls
          playsInline
          preload="metadata"
          poster={poster}
          src={source.url}
          onError={() => setError(true)}
        >
          Tu navegador no puede reproducir este video.
        </video>
        {error && (
          <p role="alert">
            No se pudo cargar el video. Actualiza la página para reintentar.
          </p>
        )}
      </div>
    );
  if (source.kind === "embed" && playing)
    return (
      <div className={styles.player}>
        <iframe
          src={source.url + "?autoplay=1"}
          title={title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  return (
    <div className={styles.videoPoster}>
      {poster && <img src={poster} alt="" />}
      {source.kind === "embed" ? (
        <button
          className={styles.playVideo}
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Reproducir ${title}`}
        >
          <Play size={32} fill="currentColor" />
          <span>Reproducir video</span>
        </button>
      ) : (
        <div className={styles.external}>
          <Film size={32} />
          <p>Este video se reproduce en su sitio de origen.</p>
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            Abrir video <ExternalLink size={18} />
          </a>
        </div>
      )}
    </div>
  );
}
