/* eslint-disable @next/next/no-img-element -- Controlled private media routes and local object URL previews. */
"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Check,
  CloudUpload,
  Film,
  ImageIcon,
  Link as LinkIcon,
  Save,
  Trash2,
} from "lucide-react";
import type { TrainingRecord } from "@/lib/trainings/types";
import {
  uploadTrainingVideo,
  type VideoUploadTicket,
} from "@/lib/trainings/upload-video";
import { MAX_TRAINING_VIDEO_BYTES } from "@/lib/trainings/media";
import { TrainingVideo } from "@/presentation/components/training-video";
import { saveTrainingAction } from "./actions";
import styles from "./training-admin.module.css";
const idle = { status: "idle" as const, message: "" };
function usePreview(file: File | null) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url;
}
function FileChoice({
  kind,
  file,
  onChange,
  disabled,
}: {
  kind: "cover" | "video";
  file: File | null;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null),
    [dragging, setDragging] = useState(false),
    [error, setError] = useState("");
  const types =
    kind === "cover"
      ? ["image/jpeg", "image/png", "image/webp", "image/avif"]
      : ["video/mp4", "video/webm"];
  function choose(file: File | undefined) {
    setError("");
    if (!file) return;
    if (
      file.size < 1 ||
      file.size > (kind === "cover" ? 8_000_000 : MAX_TRAINING_VIDEO_BYTES) ||
      !types.includes(file.type)
    ) {
      setError(
        kind === "cover"
          ? "Selecciona una imagen PNG, JPG, WebP o AVIF de hasta 8 MB."
          : "Selecciona un video MP4 o WebM de hasta 50 MB.",
      );
      return;
    }
    onChange(file);
  }
  return (
    <div>
      <div
        className={styles.dropZone}
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) choose(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          type="file"
          accept={types.join(",")}
          className={styles.hiddenFile}
          disabled={disabled}
          aria-label={
            kind === "cover" ? "Seleccionar portada" : "Seleccionar video"
          }
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className={styles.dropButton}
        >
          <CloudUpload size={27} />
          <strong>
            {kind === "cover"
              ? "Arrastra tu imagen de portada"
              : "Arrastra tu video aquí"}
          </strong>
          <span>o selecciona un archivo</span>
        </button>
        <small>
          {kind === "cover"
            ? "PNG, JPG, WebP o AVIF · Hasta 8 MB"
            : "MP4 o WebM · Hasta 50 MB"}
        </small>
      </div>
      {file && (
        <div className={styles.fileRow}>
          <Check size={18} />
          <span>
            <strong>{file.name}</strong>
            <small>
              {(file.size / 1_000_000).toLocaleString("es-GT", {
                maximumFractionDigits: 2,
              })}{" "}
              MB · Pendiente de guardar
            </small>
          </span>
          <button
            type="button"
            disabled={disabled}
            className={styles.iconButton}
            aria-label={`Quitar ${file.name}`}
            onClick={() => {
              onChange(null);
              if (input.current) input.current.value = "";
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function TrainingEditor({
  training,
  onSaved,
  onBusy,
  relations,
  onIdCreated,
}: {
  training?: TrainingRecord;
  onSaved: (row: TrainingRecord) => void;
  onBusy: (busy: boolean) => void;
  relations: ReactNode;
  onIdCreated: (training: TrainingRecord) => void;
}) {
  const [saved, setSaved] = useState(training),
    [title, setTitle] = useState(training?.title ?? ""),
    [description, setDescription] = useState(training?.description ?? ""),
    [url, setUrl] = useState(training?.video_url ?? ""),
    [mode, setMode] = useState<"file" | "url">(
      training?.video_url ? "url" : "file",
    ),
    [status, setStatus] = useState(training?.publication_status ?? "draft");
  const [cover, setCover] = useState<File | null>(null),
    [video, setVideo] = useState<File | null>(null),
    [pending, setPending] = useState(false),
    [progress, setProgress] = useState<string>(""),
    [percent, setPercent] = useState(0),
    [feedback, setFeedback] = useState<{
      error: boolean;
      message: string;
    } | null>(null);
  useNotificationFeedback(
    feedback ? (feedback.error ? "error" : "success") : "idle",
    feedback?.message,
  );
  const ticket = useRef<{
      file: File;
      ticket: VideoUploadTicket;
      uploaded: boolean;
      confirming: boolean;
    } | null>(null),
    saveLock = useRef(false);
  const uploadController = useRef<AbortController | null>(null),
    ownerId = useRef(training?.id);
  const discardTicket = useCallback(() => {
    const value = ticket.current,
      id = ownerId.current;
    if (value && id && !value.confirming)
      void fetch("/api/admin/training-videos", {
        method: "DELETE",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingId: id, path: value.ticket.path }),
      }).catch(() => {});
    ticket.current = null;
  }, []);
  useEffect(
    () => () => {
      uploadController.current?.abort();
      discardTicket();
    },
    [discardTicket],
  );
  const coverUrl = usePreview(cover),
    videoUrl = usePreview(video),
    formId = useId();
  const setBusy = useCallback(
    (value: boolean) => {
      setPending(value);
      onBusy(value);
    },
    [onBusy],
  );
  const previewCover =
    coverUrl ||
    (saved?.cover_path
      ? `/api/training-covers/${saved.id}?v=${encodeURIComponent(saved.cover_path)}`
      : undefined);
  const sourceChanges =
    mode === "url"
      ? Boolean(saved?.video_storage_path) || url !== (saved?.video_url ?? "")
      : Boolean(saved?.video_url);
  const changes =
    title !== (saved?.title ?? "") ||
    description !== (saved?.description ?? "") ||
    sourceChanges ||
    status !== (saved?.publication_status ?? "draft") ||
    Boolean(cover || video);
  useEffect(() => {
    if (!changes) return;
    function prevent(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [changes]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    saveLock.current = true;
    setBusy(true);
    setFeedback(null);
    setPercent(0);
    let current = saved;
    let detailsSaved = false;
    const controller = new AbortController();
    uploadController.current = controller;
    function data(publication: string) {
      const f = new FormData();
      Object.entries({
        id: current?.id ?? "",
        title,
        description,
        videoUrl: mode === "url" ? url : "",
        videoOperation: mode === "url" ? "url" : "keep",
        publicationStatus: publication,
      }).forEach(([k, v]) => f.set(k, v));
      return f;
    }
    try {
      if (
        mode === "file" &&
        !video &&
        !current?.video_storage_path &&
        (status === "published" || Boolean(current?.video_url))
      )
        throw Error("Selecciona el video que quieres adjuntar.");
      if (mode === "url" && !url.trim() && status === "published")
        throw Error("Agrega el enlace del video antes de publicar.");
      setProgress("Guardando los datos de la capacitación…");
      const phase =
        status === "published" && video
          ? (current?.publication_status ?? "draft")
          : status;
      const first = await saveTrainingAction(idle, data(phase));
      if (first.status !== "success" || !first.training)
        throw Error(first.message);
      current = first.training;
      detailsSaved = true;
      ownerId.current = current.id;
      controller.signal.throwIfAborted();
      setSaved(current);
      onIdCreated(current);
      if (video && mode === "file") {
        setProgress("Cargando video…");
        if (ticket.current?.file !== video) {
          const response = await fetch("/api/admin/training-videos", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trainingId: current.id,
              size: video.size,
              mime: video.type,
            }),
          });
          const payload = await response.json();
          if (!response.ok)
            throw Error(payload.error || "No se pudo iniciar el video.");
          ticket.current = {
            file: video,
            ticket: payload,
            uploaded: false,
            confirming: false,
          };
        }
        const pendingVideo = ticket.current!;
        if (!pendingVideo.uploaded) {
          await uploadTrainingVideo(
            video,
            pendingVideo.ticket,
            setPercent,
            controller.signal,
          );
          pendingVideo.uploaded = true;
        }
        setProgress("Confirmando el video…");
        pendingVideo.confirming = true;
        const response = await fetch("/api/admin/training-videos", {
          method: "PUT",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trainingId: current.id,
            path: pendingVideo.ticket.path,
            expectedPath: current.video_storage_path,
            expectedUrl: current.video_url,
          }),
        });
        const payload = await response.json();
        pendingVideo.confirming = false;
        if (!response.ok || payload.status !== "recorded")
          throw Error(payload.error || "No se pudo confirmar el video.");
        current = {
          ...current,
          video_storage_path: payload.path,
          video_url: null,
        };
        setSaved(current);
        setVideo(null);
        setUrl("");
        ticket.current = null;
      }
      if (cover) {
        setProgress("Guardando la portada…");
        const f = new FormData();
        f.set("trainingId", current.id);
        f.set("image", cover);
        const response = await fetch("/api/admin/training-covers", {
          method: "POST",
          signal: controller.signal,
          body: f,
        });
        const payload = await response.json();
        if (!response.ok || payload.status !== "recorded" || !payload.coverPath)
          throw Error(payload.error || "No se pudo guardar la portada.");
        current = { ...current, cover_path: payload.coverPath };
        setSaved(current);
        setCover(null);
      }
      if (current.publication_status !== status) {
        setProgress("Actualizando publicación…");
        const final = await saveTrainingAction(idle, data(status));
        if (final.status !== "success" || !final.training)
          throw Error(final.message);
        current = final.training;
        setSaved(current);
      }
      setFeedback({
        error: false,
        message:
          status === "published"
            ? "Capacitación publicada con sus cambios guardados."
            : "Todos los cambios de la capacitación se guardaron.",
      });
      if (mode === "url") {
        discardTicket();
        setVideo(null);
      }
      onSaved(current);
    } catch (error) {
      setFeedback({
        error: true,
        message:
          (detailsSaved
            ? "Los datos de la capacitación están guardados. "
            : "") +
          (error instanceof Error
            ? error.message
            : "No se pudo completar el guardado.") +
          " Conservamos tu selección para reintentar.",
      });
    } finally {
      setProgress("");
      setBusy(false);
      saveLock.current = false;
    }
  }
  return (
    <div className={styles.editorContent} data-dirty={changes}>
      <form id={formId} onSubmit={submit}>
        <fieldset disabled={pending}>
          <section className={styles.editorSection}>
            <h3>
              <BookOpen size={20} />
              Datos de la capacitación
            </h3>
            <label className={styles.field}>
              <span>Título *</span>
              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={240}
                placeholder="Ej. Uso y cuidado de tu equipo"
                required
              />
            </label>
            <label className={styles.field}>
              <span>Descripción del video</span>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={12000}
                rows={5}
                placeholder="Explica qué aprenderá el cliente en este video."
              />
            </label>
          </section>
          <section className={styles.editorSection}>
            <h3>
              <ImageIcon size={20} />
              Imagen de portada
            </h3>
            <p className={styles.help}>
              Será la imagen de la tarjeta y la presentación del video.
            </p>
            {previewCover && (
              <img
                src={previewCover}
                alt="Vista previa de la portada"
                className={styles.coverPreview}
              />
            )}
            <FileChoice
              kind="cover"
              file={cover}
              onChange={setCover}
              disabled={pending}
            />
          </section>
          <section className={styles.editorSection}>
            <h3>
              <Film size={20} />
              Video de la capacitación
            </h3>
            <div
              className={styles.sourceChoice}
              role="group"
              aria-label="Origen del video"
            >
              <button
                type="button"
                aria-pressed={mode === "file"}
                onClick={() => setMode("file")}
              >
                <CloudUpload size={17} />
                Subir archivo
              </button>
              <button
                type="button"
                aria-pressed={mode === "url"}
                onClick={() => setMode("url")}
              >
                <LinkIcon size={17} />
                Usar enlace
              </button>
            </div>
            {mode === "file" ? (
              <>
                <FileChoice
                  kind="video"
                  file={video}
                  onChange={(file) => {
                    discardTicket();
                    setVideo(file);
                  }}
                  disabled={pending}
                />
                {videoUrl ? (
                  <video
                    className={styles.videoPreview}
                    src={videoUrl}
                    poster={previewCover}
                    controls
                    preload="metadata"
                  />
                ) : saved?.video_storage_path ? (
                  <TrainingVideo
                    key={saved.video_storage_path}
                    url={`/api/training-videos/${saved.id}`}
                    title={title || "Video guardado"}
                    poster={previewCover}
                  />
                ) : (
                  <p className={styles.help}>
                    Elige el archivo que quieres que vea el cliente.
                  </p>
                )}
              </>
            ) : (
              <label className={styles.field}>
                <span>Enlace del video</span>
                <input
                  type="url"
                  name="videoUrl"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  maxLength={2000}
                />
                <small>
                  YouTube, Vimeo o enlace HTTPS de video. La vista pública
                  adapta el reproductor según la fuente.
                </small>
              </label>
            )}
          </section>
          <section className={styles.editorSection}>
            <h3>Publicación</h3>
            <label className={styles.field}>
              <span>Estado de la capacitación</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="draft">Borrador · solo administración</option>
                <option value="published">
                  Publicado · visible para clientes
                </option>
                <option value="archived">
                  Archivado · oculto de la biblioteca
                </option>
              </select>
            </label>
            <p className={styles.help}>
              El enlace de la capacitación se genera automáticamente. Las
              calificaciones se habilitan al publicar.
            </p>
          </section>
        </fieldset>
      </form>
      {saved && <fieldset disabled={pending}>{relations}</fieldset>}
      <footer className={styles.editorFooter}>
        {progress && (
          <div className={styles.progress} role="status">
            <span>{progress}</span>
            {progress === "Cargando video…" && (
              <>
                <progress max={100} value={percent} />
                <span>{percent}%</span>
              </>
            )}
          </div>
        )}
        {feedback && (
          <p
            role={feedback.error ? "alert" : "status"}
            className={feedback.error ? styles.error : styles.success}
          >
            {feedback.message}
          </p>
        )}
        <button
          type="submit"
          form={formId}
          className={styles.primary}
          disabled={pending || (!changes && !!saved)}
        >
          <Save size={18} />
          {pending
            ? "Guardando…"
            : saved
              ? "Guardar cambios"
              : "Crear capacitación"}
        </button>
        <p className={styles.footerHelp}>
          Guarda datos, portada, video y publicación. Las asociaciones se
          administran con sus propios botones.
        </p>
      </footer>
    </div>
  );
}
