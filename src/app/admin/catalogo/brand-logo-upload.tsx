"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  CloudUpload,
  FileImage,
  ImageIcon,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { BRAND_LOGO_MAX_INPUT, brandLogoUrl } from "@/lib/brand-logo";
import styles from "./brands.module.css";

export function BrandLogoUpload({
  id,
  name,
  logoPath,
  file,
  removing,
  busy,
  ready,
  onFile,
  onRemove,
  onError,
}: {
  id: string | null;
  name: string;
  logoPath: string | null;
  file: File | null;
  removing: boolean;
  busy: boolean;
  ready: boolean;
  onFile: (file: File | null) => void;
  onRemove: (remove: boolean) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      if (input.current) input.current.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(files: FileList | null) {
    if (busy || !ready || !files?.length) return;
    if (files.length !== 1) {
      onError("Selecciona un solo logotipo.");
      return;
    }
    const selected = files[0];
    if (!selected.size || selected.size > BRAND_LOGO_MAX_INPUT) {
      onError("Selecciona una imagen de hasta 5 MB.");
      if (input.current) input.current.value = "";
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
        selected.type,
      )
    ) {
      onError("Usa una imagen PNG, JPG, WebP o AVIF.");
      if (input.current) input.current.value = "";
      return;
    }
    onError("");
    onRemove(false);
    onFile(selected);
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    select(event.dataTransfer.files);
  }
  const stored =
    id && logoPath && !removing ? brandLogoUrl(id, logoPath, true) : null;
  const source = preview || stored;
  return (
    <section
      className={styles.editorSection}
      aria-labelledby="brand-logo-title"
    >
      <h3 id="brand-logo-title">
        <ImageIcon size={18} /> Logotipo de la marca
      </h3>
      <div
        className={styles.dropZone}
        data-dragging={dragging && !busy && ready}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && ready) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={drop}
      >
        <input
          className={styles.fileHidden}
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={busy || !ready}
          onChange={(event) => select(event.target.files)}
          aria-label="Archivo del logotipo"
        />
        <button
          className={styles.dropButton}
          type="button"
          disabled={busy || !ready}
          onClick={() => input.current?.click()}
        >
          <span className={styles.uploadIcon}>
            <CloudUpload size={28} />
          </span>
          <strong>Arrastra tu logotipo aquí</strong>
          <span>
            o <u>selecciona una imagen</u>
          </span>
        </button>
        <p>PNG, JPG, WebP o AVIF · Hasta 5 MB</p>
      </div>
      {source && (
        <div className={styles.logoCard}>
          <div className={styles.preview}>
            <Image
              src={source}
              alt={`Vista previa del logotipo de ${name || "la marca"}`}
              width={280}
              height={108}
              unoptimized
            />
          </div>
          <div className={styles.fileRow}>
            <FileImage size={22} aria-hidden="true" />
            <div>
              <strong>{file?.name || "Logotipo actual"}</strong>
              <small>
                {file
                  ? `${(file.size / 1_000_000).toFixed(2)} MB · Pendiente de guardar`
                  : "Guardado"}
              </small>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              disabled={busy}
              aria-label={
                file ? "Descartar imagen seleccionada" : "Quitar logotipo"
              }
              onClick={() => (file ? onFile(null) : onRemove(true))}
            >
              {file ? <X size={18} /> : <Trash2 size={18} />}
            </button>
          </div>
        </div>
      )}
      {removing && (
        <div className={styles.removalNotice}>
          <span>El logotipo se quitará al guardar los cambios.</span>
          <button type="button" disabled={busy} onClick={() => onRemove(false)}>
            <RotateCcw size={15} /> Deshacer
          </button>
        </div>
      )}
      <p className={styles.help}>
        {file
          ? "Imagen seleccionada: todavía no está guardada. Pulsa Guardar cambios al final."
          : "Se muestra en Inicio y Nosotros cuando la marca está activa. Se conserva su proporción, sin recortes."}
      </p>
      {!ready && (
        <p className={styles.feedback} role="status">
          La carga de logotipos no está disponible. Puedes guardar los datos de
          la marca.
        </p>
      )}
    </section>
  );
}
