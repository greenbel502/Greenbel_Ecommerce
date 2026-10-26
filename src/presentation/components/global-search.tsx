"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProductSearchItem } from "@/lib/products/public-search";
import { formatCurrency } from "@/application/use-cases/cartCalculations";

export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/catalog/search?${new URLSearchParams({ q: query.trim() })}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok || !result || !Array.isArray(result.products))
          throw Error("catalog_unavailable");
        if (!controller.signal.aborted) setMatches(result.products);
      } catch {
        if (!controller.signal.aborted) {
          setMatches([]);
          setError(
            "No se pudo consultar el catálogo. Vuelve a buscar o abre la página de productos.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar productos"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Búsqueda de productos</span>
            <h2>¿Qué producto necesitas?</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar búsqueda"
          >
            <X />
          </button>
        </div>
        <label className="global-search-input">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            placeholder="Nombre, código, marca o categoría..."
            aria-label="Buscar productos"
          />
        </label>
        <div className="quick-searches">
          <span>Sugerencias:</span>
          {["Aspersión", "Motobomba", "Fertilizante", "Repuestos"].map(
            (term) => (
              <button key={term} onClick={() => setQuery(term)}>
                {term}
              </button>
            ),
          )}
        </div>
        <div className="search-results" aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className="mini-empty">
              <strong>Buscando productos…</strong>
            </div>
          ) : error ? (
            <div className="mini-empty" role="alert">
              <span>{error}</span>
              <Link href="/productos" onClick={onClose}>
                Ver catálogo
              </Link>
            </div>
          ) : matches.length === 0 ? (
            <div className="mini-empty">
              <strong>Sin coincidencias</strong>
              <span>Busca por otro nombre, código, marca o categoría.</span>
            </div>
          ) : (
            matches.map((product) => (
              <Link
                key={product.id}
                href={`/productos/${product.slug}`}
                onClick={onClose}
              >
                <span className="search-thumb">
                  <Image
                    src={product.image}
                    alt=""
                    fill
                    unoptimized={product.image.startsWith(
                      "/api/product-images/",
                    )}
                    sizes="64px"
                  />
                </span>
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    {product.brand} · {product.sku}
                    {product.isMockPrice ? " · Demostración" : ""}
                  </small>
                </span>
                <b>
                  {product.price === null
                    ? "Precio próximamente"
                    : formatCurrency(product.price)}
                </b>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
