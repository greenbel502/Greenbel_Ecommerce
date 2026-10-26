"use client";
import { useActionState, useEffect, useRef, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import type { AdminFormResult } from "@/lib/server/admin-operation-result";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
type Snapshot = { name: string; value: string; checked?: boolean };
export function DraftForm({
  status,
  children,
  ...props
}: Omit<ComponentProps<"form">, "ref"> & { status: string }) {
  const ref = useRef<HTMLFormElement>(null),
    saved = useRef<Snapshot[]>([]);
  useEffect(() => {
    if (status !== "error" || !ref.current) return;
    for (const item of saved.current) {
      const controls = ref.current.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input,select,textarea");
      for (const control of controls)
        if (
          control.name === item.name &&
          (control.type !== "hidden" || control.name === "idempotencyKey") &&
          (!(control instanceof HTMLInputElement) ||
            !["checkbox", "radio"].includes(control.type) ||
            control.value === item.value)
        ) {
          if (
            control instanceof HTMLInputElement &&
            (control.type === "checkbox" || control.type === "radio")
          )
            control.checked = item.checked || false;
          else control.value = item.value;
        }
    }
  }, [status, children]);
  return (
    <form
      {...props}
      ref={ref}
      onReset={(event) => event.preventDefault()}
      onSubmitCapture={(event) => {
        saved.current = Array.from(
          event.currentTarget.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >("input,select,textarea"),
        )
          .filter((c) => c.name && c.type !== "file" && c.type !== "password")
          .map((c) => ({
            name: c.name,
            value: c.value,
            ...(c instanceof HTMLInputElement ? { checked: c.checked } : {}),
          }));
        props.onSubmitCapture?.(event);
      }}
    >
      {children}
    </form>
  );
}
export function ManagedForm({
  action,
  children,
  className,
  confirmMessage,
}: {
  action: (data: FormData) => Promise<AdminFormResult>;
  children: React.ReactNode;
  className?: string;
  confirmMessage?: string;
}) {
  const confirm = useConfirm();
  const [state, submit, pending] = useActionState<AdminFormResult, FormData>(
    async (previous, data) => {
      if (confirmMessage && !(await confirm({ message: confirmMessage })))
        return previous;
      return action(data);
    },
    { status: "idle", message: "" },
  );
  const router = useRouter();
  useNotificationFeedback(state.status, state.message);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
  return (
    <DraftForm status={state.status} action={submit} className={className}>
      <fieldset disabled={pending} className="admin-form-fieldset">
        {children}
      </fieldset>
      {pending && <p role="status">Guardando…</p>}
      {state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`admin-form-message ${state.status}`}
        >
          {state.message}
        </p>
      )}
    </DraftForm>
  );
}
