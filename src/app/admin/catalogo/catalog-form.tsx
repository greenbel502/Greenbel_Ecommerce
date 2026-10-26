"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useActionState,
  type ReactNode,
} from "react";
import { DraftForm } from "../_components/managed-form";
import type { CatalogActionState } from "./actions";
import styles from "./catalog.module.css";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
type CatalogAction = (
  previous: CatalogActionState,
  formData: FormData,
) => Promise<CatalogActionState>;
const idle: CatalogActionState = { status: "idle", message: "" };
export const CatalogOperations = createContext<
  ((id: string, busy: boolean) => void) | null
>(null);
export const CatalogRefresh = createContext<(() => void) | null>(null);
export function useCatalogOperation(busy: boolean) {
  const notify = useContext(CatalogOperations),
    id = useId();
  useEffect(() => {
    notify?.(id, busy);
    return () => notify?.(id, false);
  }, [id, notify, busy]);
}

export function ActionForm({
  action,
  children,
  submitLabel,
  disabled = false,
  compact = false,
  confirmMessage,
  formId,
  hideSubmit = false,
  onResult,
}: {
  action: CatalogAction;
  children: ReactNode;
  submitLabel: string;
  disabled?: boolean;
  compact?: boolean;
  confirmMessage?: string;
  formId?: string;
  hideSubmit?: boolean;
  onResult?: (state: CatalogActionState) => void;
}) {
  const confirm = useConfirm();
  const [state, formAction, pending] = useActionState(
    async (previous: CatalogActionState, data: FormData) => {
      if (confirmMessage && !(await confirm({ message: confirmMessage })))
        return previous;
      return action(previous, data);
    },
    idle,
  );
  useNotificationFeedback(state.status, state.message);
  const refreshDetails = useContext(CatalogRefresh);
  useCatalogOperation(pending);
  const reported = useRef<CatalogActionState | null>(null);
  useEffect(() => {
    if (state.status !== "idle" && reported.current !== state) {
      reported.current = state;
      onResult?.(state);
      if (state.status === "success" && !onResult) refreshDetails?.();
    }
  }, [state, onResult, refreshDetails]);
  return (
    <DraftForm
      status={state.status}
      id={formId}
      action={formAction}
      className={compact ? styles.compactForm : styles.form}
    >
      <fieldset disabled={pending || disabled}>
        {children}
        {!hideSubmit && (
          <button
            type="submit"
            className={compact ? styles.smallButton : styles.button}
          >
            {pending ? "Guardando..." : submitLabel}
          </button>
        )}
      </fieldset>
      {!hideSubmit && state.status !== "idle" && (
        <p
          className={state.status === "error" ? styles.error : styles.success}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </DraftForm>
  );
}

export function Field({
  label,
  name,
  defaultValue = "",
  required = false,
  type = "text",
  placeholder,
  min,
  max,
  step,
  help,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  step?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      <input
        name={name}
        id={id}
        aria-describedby={help ? `${id}-help` : undefined}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
      />
      {help && (
        <small id={`${id}-help`} className={styles.fieldHelp}>
          {help}
        </small>
      )}
    </div>
  );
}
