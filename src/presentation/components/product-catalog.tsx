"use client";

import { useMemo, useState } from "react";
import { Check, Filter, Grid2X2, List, Search, SlidersHorizontal, X } from "lucide-react";
import type { Product } from "@/domain/entities/product";
import { ProductCard } from "./product-card";

type SortOption = "featured" | "price-asc" | "price-desc" | "name" | "warranty";

export function ProductCatalog({ products, initialQuery = "", initialCategory = "Todos" }: { products: Product[]; initialQuery?: string; initialCategory?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [brand, setBrand] = useState("Todas");
  const [operation, setOperation] = useState("Todos");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("featured");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const categoryOptions = useMemo(() => ["Todos", ...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  const brandOptions = useMemo(() => ["Todas", ...new Set(products.map((product) => product.brand).filter(Boolean))], [products]);
  const operationOptions = useMemo(() => [...new Set(products.map((product) => product.operation).filter((value): value is string => Boolean(value)))], [products]);
  const hasPublishedWarranty = products.some((product) => product.warrantyMonths !== null);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = products.filter((product) => {
      const haystack = [product.name, product.sku, product.brand, product.category, ...product.searchTerms, ...product.specs.map((spec) => `${spec.label} ${spec.value}`)].join(" ").toLowerCase();
      return (!normalizedQuery || haystack.includes(normalizedQuery)) && (category === "Todos" || product.category === category) && (brand === "Todas" || product.brand === brand) && (operation === "Todos" || product.operation === operation) && (!availableOnly || (product.availability ? product.availability === "available" : product.stock !== null && product.stock > 0));
    });
    return result.sort((a, b) => {
      if (sort === "price-asc" || sort === "price-desc") {
        if (a.price === null) return b.price === null ? 0 : 1;
        if (b.price === null) return -1;
        return sort === "price-asc" ? a.price - b.price : b.price - a.price;
      }
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "warranty") {
        if (a.warrantyMonths === null) return b.warrantyMonths === null ? 0 : 1;
        if (b.warrantyMonths === null) return -1;
        return b.warrantyMonths - a.warrantyMonths;
      }
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [availableOnly, brand, category, operation, products, query, sort]);

  const activeCount = Number(category !== "Todos") + Number(brand !== "Todas") + Number(operation !== "Todos") + Number(availableOnly);
  const clearFilters = () => { setCategory("Todos"); setBrand("Todas"); setOperation("Todos"); setAvailableOnly(false); setQuery(""); };

  const filters = <><div className="filter-title"><Filter size={18} /><strong>Filtrar catálogo</strong>{activeCount > 0 && <span>{activeCount}</span>}</div><fieldset><legend>Categoría</legend>{categoryOptions.map((item) => <label className="radio-filter" key={item}><input type="radio" name="category" checked={category === item} onChange={() => setCategory(item)} /><span>{item}</span></label>)}</fieldset><fieldset><legend>Marca</legend><select value={brand} onChange={(event) => setBrand(event.target.value)}>{brandOptions.map((item) => <option key={item}>{item}</option>)}</select></fieldset>{operationOptions.length > 0 && <fieldset><legend>Funcionamiento</legend><select value={operation} onChange={(event) => setOperation(event.target.value)}><option>Todos</option>{operationOptions.map((item) => <option key={item}>{item}</option>)}</select></fieldset>}<label className="check-filter"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /><span><Check size={14} /> Solo disponibles</span></label>{activeCount > 0 && <button className="clear-button" onClick={clearFilters}>Limpiar filtros</button>}<div className="advisor-note"><strong>¿No sabes cuál elegir?</strong><p>El formulario confirma en pantalla si tu consulta quedó registrada. Los correos siguen pausados.</p><a href="/contacto">Consultar por un producto</a></div></>;

  return <section className="catalog-shell">
    <div className="catalog-toolbar"><label className="catalog-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por equipo, código, marca o especificación" /></label><button className="mobile-filter-button" onClick={() => setMobileFilters(true)}><SlidersHorizontal size={18} /> Filtros {activeCount > 0 && <span>{activeCount}</span>}</button><label className="sort-box"><span className="sr-only">Ordenar productos</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="featured">Recomendados</option><option value="price-asc">Precio: menor a mayor</option><option value="price-desc">Precio: mayor a menor</option><option value="name">Nombre</option>{hasPublishedWarranty && <option value="warranty">Mayor garantía</option>}</select></label><div className="view-switch" aria-label="Cambiar vista"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Vista en cuadrícula"><Grid2X2 size={17} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Vista en lista"><List size={18} /></button></div></div>
    <div className="catalog-content"><aside className="filter-panel">{filters}</aside><div className="catalog-main"><div className="results-heading"><span>{filteredProducts.length} resultados</span>{activeCount > 0 && <button onClick={clearFilters}>Limpiar todo <X size={14} /></button>}</div>{filteredProducts.length === 0 ? <div className="empty-state compact"><Search size={36} /><h2>No encontramos coincidencias</h2><p>Prueba con otra marca, capacidad o código de equipo.</p><button className="primary-button" onClick={clearFilters}>Ver todo el catálogo</button></div> : <div className={`product-grid ${view === "list" ? "list-view" : ""}`}>{filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>}</div></div>
    {mobileFilters && <div className="drawer-backdrop" onMouseDown={() => setMobileFilters(false)}><aside className="filter-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-heading"><h2>Filtros</h2><button className="icon-button" aria-label="Cerrar filtros" onClick={() => setMobileFilters(false)}><X /></button></div>{filters}<button className="primary-button full-width" onClick={() => setMobileFilters(false)}>Ver {filteredProducts.length} resultados</button></aside></div>}
  </section>;
}
