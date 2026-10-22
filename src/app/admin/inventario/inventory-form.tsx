"use client";
import { DraftForm } from "../_components/managed-form";
import { EntityPicker } from "../_components/entity-picker";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  recordInventoryChangeAction,
  type InventoryActionState,
} from "./actions";
import styles from "./inventory.module.css";

export type InventoryProductOption = Readonly<{
  id: string;
  sku: string;
  name: string;
}>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" type="submit" disabled={pending}>
      {pending ? "Registrando…" : "Registrar movimiento"}
    </button>
  );
}

export function InventoryForm({
  products,
  initialKey,
}: {
  products: readonly InventoryProductOption[];
  initialKey: string;
}) {
  void products;
  const [state, action] = useActionState(recordInventoryChangeAction, {
    status: "idle",
    message: "",
    idempotencyKey: initialKey,
  } satisfies InventoryActionState);

  return (
    <DraftForm status={state.status} action={action} className={styles.form}>
      <input type="hidden" name="idempotencyKey" value={state.idempotencyKey} />
      <EntityPicker
        entity="products"
        name="productId"
        label="Producto"
        required
      />
      <label>
        Tipo de movimiento
        <select name="kind" required defaultValue="stock_entry">
          <option value="stock_entry">Entrada verificada</option>
          <option value="adjustment">Ajuste con motivo</option>
          <option value="physical_sale">
            Venta física: solo salida de inventario
          </option>
        </select>
      </label>
      <label>
        Cambio de unidades
        <input
          name="quantityDelta"
          type="number"
          step="0.001"
          required
          placeholder="Ej.: 5 o -2"
        />
      </label>
      <p className={styles.help}>
        Usa un número positivo para entrada y uno negativo para salida física.
        Un ajuste puede tener cualquiera de los dos signos. Esta acción no
        registra un pago.
      </p>
      <label>
        Motivo
        <textarea
          name="reason"
          required
          minLength={1}
          maxLength={500}
          rows={3}
          placeholder="Motivo verificable del movimiento"
        />
      </label>
      <label>
        Referencia interna, si existe
        <input
          name="reference"
          maxLength={200}
          placeholder="Documento o referencia de la operación"
        />
      </label>
      {state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? styles.error : styles.success}
        >
          {state.message}
        </p>
      )}
      <SubmitButton />
    </DraftForm>
  );
}
