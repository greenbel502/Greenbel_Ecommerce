"use client";
import { sileo, type SileoOptions } from "sileo";
import { useEffect, useRef } from "react";

type Options = Omit<SileoOptions, "title" | "position">;
export const NOTIFICATION_POSITION = "top-center" as const;
/** One application API; no provider or business state is inferred from a notification. */
export const notify = {
  success: (title: string, options: Options = {}) =>
    sileo.success({ ...options, title, position: NOTIFICATION_POSITION }),
  error: (title: string, options: Options = {}) =>
    sileo.error({
      duration: 8000,
      ...options,
      title,
      position: NOTIFICATION_POSITION,
    }),
  warning: (title: string, options: Options = {}) =>
    sileo.warning({ ...options, title, position: NOTIFICATION_POSITION }),
  info: (title: string, options: Options = {}) =>
    sileo.info({ ...options, title, position: NOTIFICATION_POSITION }),
};

/** Keep field feedback in place; announce completed operations once through Sileo. */
export function useNotificationFeedback(
  status: string | undefined,
  message: string | undefined | null,
) {
  const shown = useRef("");
  useEffect(() => {
    if (!message || !status || status === "idle") {
      shown.current = "";
      return;
    }
    const key = `${status}:${message}`;
    if (shown.current === key) return;
    shown.current = key;
    if (status === "success")
      notify.success("Operación completada", { description: message });
    else if (status === "error")
      notify.error("Revisa la operación", { description: message });
    else if (status === "warning")
      notify.warning("Atención", { description: message });
    else notify.info("GreenBel", { description: message });
  }, [status, message]);
}
