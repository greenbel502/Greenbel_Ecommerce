"use client";

import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { calculateCartTotals } from "@/application/use-cases/cartCalculations";
import { MAX_CART_LINES, MAX_CART_QUANTITY, parseCartSelection, resolveCartSelection, selectionQuantity, type StoredCartLine } from "@/domain/cart/cartSelection";
import type { CartLine, CartTotals } from "@/domain/entities/cart";
import type { Product } from "@/domain/entities/product";

type RestoreStatus = "loading" | "ready" | "error" | "incomplete" | "storage-error";
type CartState = {
  lines: CartLine[];
  selection: StoredCartLine[];
  initialized: boolean;
  storageReadable: boolean;
  restoreStatus: RestoreStatus;
};
type CartAction =
  | { type: "initialize"; selection: StoredCartLine[] | null }
  | { type: "resolved"; products: Product[] }
  | { type: "restore-error" }
  | { type: "storage-error" }
  | { type: "retry" }
  | { type: "add"; product: Product; quantity: number }
  | { type: "update"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "clear" };

type CartContextValue = {
  lines: CartLine[];
  totals: CartTotals;
  itemCount: number;
  restoreStatus: RestoreStatus;
  storageError: boolean;
  retryRestore: () => void;
  addItem: (product: Product, quantity?: number) => boolean;
  decrementItem: (productId: string) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
};
const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "greenbel-cart";
const initialState: CartState = {
  lines: [],
  selection: [],
  initialized: false,
  storageReadable: true,
  restoreStatus: "loading"
};

function upsertSelection(selection: StoredCartLine[], productId: string, quantity: number): StoredCartLine[] {
  const existing = selection.find((line) => line.productId === productId);
  if (existing) return selection.map((line) => line.productId === productId ? { ...line, quantity } : line);
  return selection.length >= MAX_CART_LINES ? selection : [...selection, { productId, quantity }];
}

function reducer(state: CartState, action: CartAction): CartState {
  if (action.type === "initialize") {
    if (state.initialized) return state;
    if (action.selection === null) {
      return { ...state, initialized: true, storageReadable: false, restoreStatus: "storage-error" };
    }
    let selection = action.selection;
    for (const line of state.lines) {
      const previous = selection.find((item) => item.productId === line.product.id);
      selection = upsertSelection(
        selection,
        line.product.id,
        Math.min(MAX_CART_QUANTITY, (previous?.quantity ?? 0) + line.quantity)
      );
    }
    return { ...state, selection, initialized: true, restoreStatus: selection.length ? "loading" : "ready" };
  }
  if (action.type === "resolved") {
    const { lines, missingIds } = resolveCartSelection(state.selection, action.products);
    return { ...state, lines, restoreStatus: missingIds.length ? "incomplete" : "ready" };
  }
  if (action.type === "restore-error") return { ...state, restoreStatus: "error" };
  if (action.type === "storage-error") return { ...state, storageReadable: false };
  if (action.type === "retry") {
    if (!state.initialized || !state.storageReadable) return state;
    return { ...state, restoreStatus: state.selection.length ? "loading" : "ready" };
  }
  if (action.type === "clear") {
    return { lines: [], selection: [], initialized: true, storageReadable: true, restoreStatus: "ready" };
  }
  if (action.type === "remove") {
    const selection = state.selection.filter((line) => line.productId !== action.productId);
    return {
      ...state,
      lines: state.lines.filter((line) => line.product.id !== action.productId),
      selection,
      restoreStatus: selection.length ? state.restoreStatus : "ready"
    };
  }
  if (action.type === "update") {
    const product = state.lines.find((line) => line.product.id === action.productId)?.product;
    if (!product) return state;
    const quantity = selectionQuantity(action.quantity, product.stock);
    return {
      ...state,
      lines: state.lines.map((line) => line.product.id === action.productId ? { ...line, quantity } : line),
      selection: upsertSelection(state.selection, action.productId, quantity)
    };
  }
  const existing = state.selection.find((line) => line.productId === action.product.id);
  if (!existing && state.selection.length >= MAX_CART_LINES) return state;
  const quantity = selectionQuantity((existing?.quantity ?? 0) + action.quantity, action.product.stock);
  const selection = upsertSelection(state.selection, action.product.id, quantity);
  const lines = state.lines.some((line) => line.product.id === action.product.id)
    ? state.lines.map((line) => line.product.id === action.product.id ? { product: action.product, quantity } : line)
    : [...state.lines, { product: action.product, quantity }];
  return { ...state, lines, selection };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      dispatch({ type: "initialize", selection: raw === null ? [] : parseCartSelection(JSON.parse(raw)) });
    } catch {
      dispatch({ type: "initialize", selection: null });
    }
  }, []);

  useEffect(() => {
    if (!state.initialized || state.restoreStatus !== "loading") return;
    if (state.selection.length === 0) {
      dispatch({ type: "resolved", products: [] });
      return;
    }
    const controller = new AbortController();
    async function restoreCart() {
      try {
        const response = await fetch("/api/cart/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: state.selection }),
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("El catálogo no está disponible.");
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null || !("products" in payload) || !Array.isArray(payload.products)) {
          throw new Error("Respuesta de catálogo inválida.");
        }
        if (!controller.signal.aborted) dispatch({ type: "resolved", products: payload.products as Product[] });
      } catch {
        if (!controller.signal.aborted) dispatch({ type: "restore-error" });
      }
    }
    void restoreCart();
    return () => controller.abort();
  }, [state.initialized, state.restoreStatus, state.selection]);

  useEffect(() => {
    if (!state.initialized || !state.storageReadable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.selection));
    } catch {
      dispatch({ type: "storage-error" });
    }
  }, [state.initialized, state.selection, state.storageReadable]);

  const value = useMemo<CartContextValue>(() => ({
    lines: state.lines,
    totals: calculateCartTotals(state.lines),
    itemCount: state.selection.reduce((sum, line) => sum + line.quantity, 0),
    restoreStatus: state.restoreStatus,
    storageError: !state.storageReadable,
    retryRestore: () => dispatch({ type: "retry" }),
    addItem: (product, quantity = 1) => {
      const existing = state.selection.find((line) => line.productId === product.id);
      if (!existing && state.selection.length >= MAX_CART_LINES) return false;
      const nextQuantity = selectionQuantity((existing?.quantity ?? 0) + quantity, product.stock);
      if (existing && nextQuantity <= existing.quantity) return false;
      dispatch({ type: "add", product, quantity });
      return true;
    },
    decrementItem: (productId) => {
      const selected = state.selection.find((line) => line.productId === productId);
      if (selected) dispatch(selected.quantity <= 1
        ? { type: "remove", productId }
        : { type: "update", productId, quantity: selected.quantity - 1 });
    },
    removeItem: (productId) => dispatch({ type: "remove", productId }),
    updateQuantity: (productId, quantity) => dispatch({ type: "update", productId, quantity }),
    clearCart: () => dispatch({ type: "clear" })
  }), [state.lines, state.restoreStatus, state.selection, state.storageReadable]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart debe usarse dentro de CartProvider");
  return context;
}
