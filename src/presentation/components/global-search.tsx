"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { products } from "@/infrastructure/mock/products";
import { formatCurrency } from "@/application/use-cases/cartCalculations";

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products.slice(0, 4);
    return products.filter((product) => [product.name, product.sku, product.brand, product.category, ...product.searchTerms, ...product.specs.map((spec) => spec.value)].join(" ").toLowerCase().includes(value)).slice(0, 6);
  }, [query]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="search-modal" role="dialog" aria-modal="true" aria-label="Buscar productos" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><span className="eyebrow">Búsqueda técnica</span><h2>¿Qué equipo necesitas?</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar búsqueda"><X /></button></div>
        <label className="global-search-input"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, marca, capacidad, PSI..." /></label>
        <div className="quick-searches"><span>Prueba con:</span>{["Honda", "25 litros", "700 PSI", "bomba de agua"].map((term) => <button key={term} onClick={() => setQuery(term)}>{term}</button>)}</div>
        <div className="search-results">
          {matches.length === 0 && <div className="mini-empty"><strong>Sin coincidencias</strong><span>Prueba con otra capacidad, marca o categoría.</span></div>}
          {matches.map((product) => <Link key={product.id} href={`/productos/${product.slug}`} onClick={onClose}><span className="search-thumb"><Image src={product.image} alt="" fill unoptimized={product.image.startsWith("/api/product-images/")} sizes="64px" /></span><span><strong>{product.name}</strong><small>{product.brand} · {product.sku}</small></span><b>{product.price === null ? "Precio próximamente" : formatCurrency(product.price)}</b></Link>)}
        </div>
      </section>
    </div>
  );
}
