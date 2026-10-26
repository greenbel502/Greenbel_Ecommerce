"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { Toaster } from "sileo";
import { AlertCircle } from "lucide-react";
import { NOTIFICATION_POSITION } from "./notify";
import styles from "./notifications.module.css";

type Confirmation = { message: string; title?: string; confirmLabel?: string };
const Context = createContext<
  ((options: Confirmation) => Promise<boolean>) | null
>(null);
export function useConfirm() {
  const confirm = useContext(Context);
  if (!confirm) throw Error("NotificationProvider missing");
  return confirm;
}
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const confirm = useCallback((options: Confirmation) => {
    if (resolve.current) return Promise.resolve(false);
    return new Promise<boolean>((done) => {
      resolve.current = done;
      // A form action can be awaiting this decision inside a transition. Commit
      // the modal immediately; waiting for that transition would deadlock it.
      flushSync(() => setConfirmation(options));
    });
  }, []);
  const finish = useCallback((answer: boolean) => {
    resolve.current?.(answer);
    resolve.current = null;
    setConfirmation(null);
  }, []);
  useEffect(() => {
    // Native drawers are in the top layer: render the single Sileo viewport inside
    // the active dialog so notifications remain visible and accessible there.
    const update = () =>
      setHost(
        Array.from(document.querySelectorAll("dialog[open]")).at(-1) ??
          document.body,
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      observer.disconnect();
      resolve.current?.(false);
    };
  }, []);
  useEffect(() => {
    if (!confirmation || !dialog.current) return;
    const panel = dialog.current;
    const previous = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    panel.showModal();
    cancel.current?.focus();
    return () => {
      panel.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [confirmation]);
  return (
    <Context.Provider value={confirm}>
      {children}
      {host &&
        createPortal(
          <Toaster
            position={NOTIFICATION_POSITION}
            theme="light"
            offset={{ top: 20 }}
            options={{
              fill: "#E7E7CF",
              duration: 6000,
              roundness: 16,
              styles: {
                title: styles.title,
                description: styles.description,
                badge: styles.badge,
                button: styles.button,
              },
            }}
          />,
          host,
        )}
      {confirmation && (
        <dialog
          ref={dialog}
          className={styles.confirm}
          aria-labelledby="gb-confirm-title"
          aria-describedby="gb-confirm-message"
          onCancel={(event) => {
            event.preventDefault();
            finish(false);
          }}
        >
          <span className={styles.confirmIcon}>
            <AlertCircle size={25} aria-hidden="true" />
          </span>
          <h2 id="gb-confirm-title">
            {confirmation.title ?? "Confirmar cambios"}
          </h2>
          <p id="gb-confirm-message">{confirmation.message}</p>
          <div className={styles.actions}>
            <button ref={cancel} type="button" onClick={() => finish(false)}>
              Cancelar
            </button>
            <button type="button" onClick={() => finish(true)}>
              {confirmation.confirmLabel ?? "Continuar"}
            </button>
          </div>
        </dialog>
      )}
    </Context.Provider>
  );
}
