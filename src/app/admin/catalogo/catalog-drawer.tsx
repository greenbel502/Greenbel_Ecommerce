"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./brands.module.css";

/** Native top-layer drawer: background inert, keyboard focus contained, no layout shrink. */
export function CatalogDrawer({
  id,
  title,
  kicker,
  closeLabel,
  busy,
  onClose,
  returnFocusId,
  children,
  className,
}: {
  id: string;
  title: string;
  kicker: string;
  closeLabel: string;
  busy: boolean;
  onClose: () => void;
  returnFocusId: string;
  children: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    const previousFocus = document.activeElement;
    const root = document.documentElement;
    const rootOverflow = root.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    if (!panel.open) panel.showModal();
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (panel.open) panel.close();
      root.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        previousFocus !== document.body
      )
        previousFocus.focus({ preventScroll: true });
      else
        document.getElementById(returnFocusId)?.focus({ preventScroll: true });
    };
  }, [returnFocusId]);
  return (
    <dialog
      ref={dialog}
      className={`${styles.editor} ${className ?? ""}`}
      id={id}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className={styles.editorHeading}>
        <div>
          <span className={styles.kicker}>{kicker}</span>
          <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className={styles.close}
          aria-label={closeLabel}
        >
          <X size={20} />
        </button>
      </div>
      <div className={styles.editorBody}>{children}</div>
    </dialog>
  );
}
