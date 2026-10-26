"use client";
import { useActionState, useEffect, useContext, createContext } from "react";
import {
  saveTrainingRelationAction,
  type TrainingActionState,
} from "./actions";
import { EntityPicker } from "../_components/entity-picker";
import type {
  TrainingProductOption,
  TrainingCategoryOption,
  TrainingProductLink,
  TrainingCategoryLink,
} from "./training-admin";
import styles from "./training-admin.module.css";
const RelationsRefresh = createContext<() => void>(() => {});
const idle: TrainingActionState = { status: "idle", message: "" };
type RelationKind = "product" | "category";
type RelationOption = { id: string; label: string };
function RelationForm({
  trainingId,
  kind,
  operation,
  targetId,
  options,
}: {
  trainingId: string;
  kind: RelationKind;
  operation: "attach" | "detach";
  targetId?: string;
  options?: RelationOption[];
}) {
  void options;
  const changed = useContext(RelationsRefresh);
  const [state, action, pending] = useActionState(
    saveTrainingRelationAction,
    idle,
  );
  useEffect(() => {
    if (state.status === "success") {
      changed();
    }
  }, [state, changed]);

  return (
    <form action={action} className={styles.relationForm}>
      <input type="hidden" name="trainingId" value={trainingId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="operation" value={operation} />
      {operation === "attach" ? (
        <EntityPicker
          entity={kind === "product" ? "products" : "categories"}
          name="targetId"
          label={kind === "product" ? "Producto publicado" : "Categoría activa"}
          required
          published={kind === "product"}
          active={kind === "category"}
        />
      ) : (
        <input type="hidden" name="targetId" value={targetId} />
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Guardando…" : operation === "attach" ? "Asociar" : "Quitar"}
      </button>
      {state.status !== "idle" && (
        <p
          className={state.status === "error" ? styles.error : styles.success}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function TrainingRelations({
  trainingId,
  products,
  categories,
  productLinks,
  categoryLinks,
  onChanged,
}: {
  trainingId: string;
  onChanged: () => void;
  products: TrainingProductOption[];
  categories: TrainingCategoryOption[];
  productLinks: TrainingProductLink[];
  categoryLinks: TrainingCategoryLink[];
}) {
  const linkedProducts = productLinks.filter(
    (item) => item.training_id === trainingId,
  );
  const linkedCategories = categoryLinks.filter(
    (item) => item.training_id === trainingId,
  );
  const productNames = new Map(
    products.map((item) => [item.id, `${item.sku} · ${item.name}`]),
  );
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]));
  const availableProducts = products
    .filter(
      (item) => !linkedProducts.some((link) => link.product_id === item.id),
    )
    .map((item) => ({ id: item.id, label: `${item.sku} · ${item.name}` }));
  const availableCategories = categories
    .filter(
      (item) => !linkedCategories.some((link) => link.category_id === item.id),
    )
    .map((item) => ({ id: item.id, label: item.name }));

  return (
    <RelationsRefresh.Provider value={onChanged}>
      <div className={styles.relations}>
        <h3>Relaciones públicas</h3>
        <p className={styles.help}>
          Vincula productos publicados o categorías activas. En la ficha pública
          solo aparecerán productos que continúen publicados con sus
          clasificaciones activas.
        </p>
        <div className={styles.relationColumns}>
          <section aria-labelledby="training-products-title">
            <h4 id="training-products-title">Productos</h4>
            {linkedProducts.length === 0 ? (
              <p className={styles.help}>Sin productos vinculados.</p>
            ) : (
              <ul className={styles.relationList}>
                {linkedProducts.map((link) => (
                  <li key={link.product_id}>
                    <span>
                      {productNames.get(link.product_id) ??
                        "Producto ya no publicado"}
                    </span>
                    <RelationForm
                      trainingId={trainingId}
                      kind="product"
                      operation="detach"
                      targetId={link.product_id}
                    />
                  </li>
                ))}
              </ul>
            )}
            <RelationForm
              trainingId={trainingId}
              kind="product"
              operation="attach"
              options={availableProducts}
            />
          </section>
          <section aria-labelledby="training-categories-title">
            <h4 id="training-categories-title">Categorías</h4>
            {linkedCategories.length === 0 ? (
              <p className={styles.help}>Sin categorías vinculadas.</p>
            ) : (
              <ul className={styles.relationList}>
                {linkedCategories.map((link) => (
                  <li key={link.category_id}>
                    <span>
                      {categoryNames.get(link.category_id) ??
                        "Categoría ya no activa"}
                    </span>
                    <RelationForm
                      trainingId={trainingId}
                      kind="category"
                      operation="detach"
                      targetId={link.category_id}
                    />
                  </li>
                ))}
              </ul>
            )}
            <RelationForm
              trainingId={trainingId}
              kind="category"
              operation="attach"
              options={availableCategories}
            />
          </section>
        </div>
      </div>
    </RelationsRefresh.Provider>
  );
}
