"use client";
import {
  notify,
  useNotificationFeedback,
} from "@/presentation/notifications/notify";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  deleteBrandAction,
  deleteCategoryAction,
  deleteProductAction,
} from "./actions";
import { deleteTrainingAction } from "../capacitaciones/actions";
import styles from "./brands.module.css";

export function CatalogDeleteDialog({
  kind,
  record,
  onClose,
  onDeleted,
}: {
  kind: "brand" | "category" | "product" | "training";
  record: { id: string; name: string };
  onClose: () => void;
  onDeleted: (id: string, message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useNotificationFeedback(error ? "error" : "idle", error);
  const noun = {
    brand: "marca",
    category: "categoría",
    product: "producto",
    training: "capacitación",
  }[kind];
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    const previousFocus = document.activeElement;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    panel.showModal();
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      if (panel.open) panel.close();
      root.style.overflow = overflow;
      document.body.style.overflow = bodyOverflow;
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        previousFocus !== document.body
      )
        previousFocus.focus({ preventScroll: true });
      else
        document
          .getElementById(
            kind === "brand"
              ? "brands-admin-title"
              : kind === "category"
                ? "categories-admin-title"
                : kind === "training"
                  ? "training-list-title"
                  : "products-admin-title",
          )
          ?.focus({ preventScroll: true });
    };
  }, [kind]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("id", record.id);
      data.set("expectedName", record.name);
      data.set("confirmation", "delete");
      const action =
        kind === "brand"
          ? deleteBrandAction
          : kind === "category"
            ? deleteCategoryAction
            : kind === "training"
              ? deleteTrainingAction
              : deleteProductAction;
      const response = await action({ status: "idle", message: "" }, data);
      if (response.status === "success") {
        notify.success("Eliminación completada", {
          description: response.message,
        });
        onDeleted(record.id, response.message);
      } else setError(response.message);
    } catch {
      setError(
        "No se confirmó la eliminación. Actualiza la lista antes de reintentar.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.deleteDialog}
      aria-labelledby="catalog-delete-title"
      aria-describedby="catalog-delete-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className={styles.deleteIcon}>
          <AlertTriangle size={24} aria-hidden="true" />
        </div>
        <h2 id="catalog-delete-title">Eliminar {noun}</h2>
        <p id="catalog-delete-description">
          ¿Deseas eliminar <strong>{record.name}</strong>? Esta acción no se
          puede deshacer.
        </p>
        <p className={styles.help}>
          {kind === "brand"
            ? "Se retirará del sitio junto con su logotipo. Solo se puede eliminar si no tiene productos asignados."
            : kind === "category"
              ? "Solo se puede eliminar si no tiene productos, subcategorías ni capacitaciones vinculadas."
              : kind === "training"
                ? "Se eliminarán la capacitación, su video, su portada y las calificaciones recibidas. También se quitarán sus asociaciones con productos y categorías."
                : "Solo se puede eliminar si no tiene información vinculada. Si conserva imágenes, detalles o movimientos, puedes archivarlo desde Editar para retirarlo del catálogo sin perder información."}
        </p>
        {error && (
          <p role="alert" className={`${styles.feedback} ${styles.error}`}>
            {error}
          </p>
        )}
        <div className={styles.footerActions}>
          <button
            ref={cancel}
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className={styles.danger} disabled={busy}>
            {busy ? (
              <Loader2 size={17} aria-hidden="true" />
            ) : (
              <Trash2 size={17} aria-hidden="true" />
            )}
            {busy ? "Eliminando…" : `Eliminar ${noun}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
