"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Grid2X2,
  List,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Product } from "@/domain/entities/product";
import { ProductCard } from "./product-card";
import { CatalogDrawer } from "@/app/admin/catalogo/catalog-drawer";
import styles from "./product-catalog.module.css";
import { paginateCatalog } from "@/lib/products/catalog-pagination";

type SortOption = "featured" | "price-asc" | "price-desc" | "name" | "warranty";

export function ProductCatalog({
  products,
  initialQuery = "",
  initialCategory = "Todos",
}: {
  products: Product[];
  initialQuery?: string;
  initialCategory?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [brand, setBrand] = useState("Todas");
  const [operation, setOperation] = useState("Todos");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("featured");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [requestedPage, setPage] = useState(1);
  const resultsHeading = useRef<HTMLDivElement>(null);
  const categoryOptions = useMemo(
    () => [
      "Todos",
      ...new Set(products.map((product) => product.category).filter(Boolean)),
    ],
    [products],
  );
  const brandOptions = useMemo(
    () => [
      "Todas",
      ...new Set(products.map((product) => product.brand).filter(Boolean)),
    ],
    [products],
  );
  const operationOptions = useMemo(
    () => [
      ...new Set(
        products
          .map((product) => product.operation)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    [products],
  );
  const hasPublishedWarranty = products.some(
    (product) => product.warrantyMonths !== null,
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = products.filter((product) => {
      const haystack = [
        product.name,
        product.sku,
        product.brand,
        product.category,
        ...product.searchTerms,
        ...product.specs.map((spec) => `${spec.label} ${spec.value}`),
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!normalizedQuery || haystack.includes(normalizedQuery)) &&
        (category === "Todos" || product.category === category) &&
        (brand === "Todas" || product.brand === brand) &&
        (operation === "Todos" || product.operation === operation) &&
        (!availableOnly ||
          (product.availability
            ? product.availability === "available"
            : product.stock !== null && product.stock > 0))
      );
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

  const pagination = paginateCatalog(filteredProducts, requestedPage);
  const pageNumbers = [
    ...new Set([
      1,
      pagination.page - 1,
      pagination.page,
      pagination.page + 1,
      pagination.totalPages,
    ]),
  ]
    .filter((page) => page >= 1 && page <= pagination.totalPages)
    .sort((a, b) => a - b);

  function changePage(page: number) {
    setPage(page);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({
      block: "start",
      behavior: "auto",
    });
  }

  function changeCategory(value: string) {
    setCategory(value);
    setPage(1);
  }

  const activeCount =
    Number(category !== "Todos") +
    Number(brand !== "Todas") +
    Number(operation !== "Todos") +
    Number(availableOnly);
  const clearFilters = () => {
    setCategory("Todos");
    setBrand("Todas");
    setOperation("Todos");
    setAvailableOnly(false);
    setQuery("");
    setPage(1);
  };

  const filters = (instance: string) => (
    <>
      <div className="filter-title">
        <Filter size={18} />
        <strong>Filtrar catálogo</strong>
        {activeCount > 0 && <span>{activeCount}</span>}
      </div>
      <fieldset>
        <legend>Categoría</legend>
        {categoryOptions.map((item) => (
          <label className="radio-filter" key={item}>
            <input
              type="radio"
              name={`category-${instance}`}
              checked={category === item}
              onChange={() => changeCategory(item)}
            />
            <span>{item}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Marca</legend>
        <select
          aria-label="Marca"
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setPage(1);
          }}
        >
          {brandOptions.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </fieldset>
      {operationOptions.length > 0 && (
        <fieldset>
          <legend>Funcionamiento</legend>
          <select
            aria-label="Funcionamiento"
            value={operation}
            onChange={(event) => {
              setOperation(event.target.value);
              setPage(1);
            }}
          >
            <option>Todos</option>
            {operationOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </fieldset>
      )}
      <label className="check-filter">
        <input
          type="checkbox"
          checked={availableOnly}
          onChange={(event) => {
            setAvailableOnly(event.target.checked);
            setPage(1);
          }}
        />
        <span>
          <Check size={14} /> Solo disponibles
        </span>
      </label>
      {activeCount > 0 && (
        <button className="clear-button" onClick={clearFilters}>
          Limpiar filtros
        </button>
      )}
      <div className="advisor-note">
        <strong>¿No sabes cuál elegir?</strong>
        <p>
          Cuéntanos qué necesitas y recibe orientación del equipo de GreenBel.
        </p>
        <a href="/contacto">Consultar por un producto</a>
      </div>
    </>
  );

  return (
    <section className={`catalog-shell ${styles.catalog}`}>
      <div className="catalog-toolbar">
        <label className="catalog-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Buscar productos</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar producto, marca o código"
          />
        </label>
        <button
          className="mobile-filter-button"
          id="catalog-filters-open"
          aria-haspopup="dialog"
          aria-expanded={mobileFilters}
          onClick={() => setMobileFilters(true)}
        >
          <SlidersHorizontal size={18} /> Filtros{" "}
          {activeCount > 0 && <span>{activeCount}</span>}
        </button>
        <label className="sort-box">
          <span className="sr-only">Ordenar productos</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortOption);
              setPage(1);
            }}
          >
            <option value="featured">Recomendados</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
            <option value="name">Nombre</option>
            {hasPublishedWarranty && (
              <option value="warranty">Mayor garantía</option>
            )}
          </select>
        </label>
        <div className="view-switch" aria-label="Cambiar vista">
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
            aria-label="Vista en cuadrícula"
          >
            <Grid2X2 size={17} />
          </button>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
            aria-label="Vista en lista"
          >
            <List size={18} />
          </button>
        </div>
      </div>
      <div
        className={styles.categories}
        role="group"
        aria-label="Categorías del catálogo"
      >
        {categoryOptions.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => changeCategory(item)}
          >
            {item === "Todos" ? "Todas las categorías" : item}
          </button>
        ))}
      </div>
      <div className="catalog-content">
        <aside className="filter-panel">{filters("desktop")}</aside>
        <div className="catalog-main">
          <div
            className={`results-heading ${styles.resultsHeading}`}
            ref={resultsHeading}
            tabIndex={-1}
          >
            <span role="status" aria-live="polite">
              {filteredProducts.length} resultados
              {filteredProducts.length > 0 && (
                <small className={styles.resultRange}>
                  Mostrando {pagination.first}–{pagination.last}
                </small>
              )}
            </span>
            {activeCount > 0 && (
              <button onClick={clearFilters}>
                Limpiar todo <X size={14} />
              </button>
            )}
          </div>
          {filteredProducts.length === 0 ? (
            <div className="empty-state compact">
              <Search size={36} />
              <h2>No encontramos coincidencias</h2>
              <p>Prueba con otra marca, capacidad o código de equipo.</p>
              <button className="primary-button" onClick={clearFilters}>
                Ver todo el catálogo
              </button>
            </div>
          ) : (
            <div
              className={`product-grid ${view === "list" ? "list-view" : ""}`}
            >
              {pagination.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
          {pagination.totalPages > 1 && (
            <nav
              className={styles.pagination}
              aria-label="Paginación de productos"
            >
              <p>
                Mostrando {pagination.first}–{pagination.last} de{" "}
                {pagination.total} productos
              </p>
              <div className={styles.pageControls}>
                <button
                  type="button"
                  onClick={() => changePage(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                  <span className={styles.pageButtonText}>Anterior</span>
                </button>
                <span className={styles.mobilePage}>
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <div className={styles.pageNumbers}>
                  {pageNumbers.map((page, index) => (
                    <span key={page} className={styles.pageNumberGroup}>
                      {index > 0 && page - pageNumbers[index - 1] > 1 && (
                        <span aria-hidden="true" className={styles.ellipsis}>
                          …
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => changePage(page)}
                        aria-label={`Ir a página ${page}`}
                        aria-current={
                          page === pagination.page ? "page" : undefined
                        }
                      >
                        {page}
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => changePage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  aria-label="Página siguiente"
                >
                  <span className={styles.pageButtonText}>Siguiente</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </nav>
          )}
        </div>
      </div>
      {mobileFilters && (
        <CatalogDrawer
          id="catalog-filters"
          title="Filtrar productos"
          kicker="Catálogo GreenBel"
          closeLabel="Cerrar filtros"
          busy={false}
          onClose={() => setMobileFilters(false)}
          returnFocusId="catalog-filters-open"
        >
          <div className={`filter-drawer ${styles.filterContents}`}>
            {filters("mobile")}
          </div>
          <div className={styles.filterFooter}>
            <button
              className="primary-button full-width"
              onClick={() => setMobileFilters(false)}
            >
              Ver {filteredProducts.length} resultados
            </button>
          </div>
        </CatalogDrawer>
      )}
    </section>
  );
}
