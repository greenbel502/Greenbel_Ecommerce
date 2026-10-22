import assert from "node:assert/strict";
import test from "node:test";
import { listState, listHref, searchTerm } from "../src/lib/admin-list.ts";
const config = {
  search: ["name"],
  sorts: { created_at: "Fecha", name: "Nombre" },
  filters: { draft: "Borrador" },
};
test("parámetros de lista acotados y columnas solo de la lista permitida", () => {
  for (const page of ["0", "-1", "1.5", "Infinity", "100001"]) {
    const state = listState(
      { page, size: "100000", sort: "__proto__", filter: "constructor" },
      "",
      config,
    );
    assert.equal(state.page, 1);
    assert.equal(state.size, 10);
    assert.equal(state.sort, "created_at");
    assert.equal(state.filter, "");
  }
  assert.equal(listState({ page: ["2", "3"] }, "", config).page, 1);
  assert.equal(
    listState(
      { page: "3", size: "25", sort: "name", filter: "draft", dir: "asc" },
      "",
      config,
    ).size,
    25,
  );
});
test("paginación conserva búsqueda, filtros y otras listas sin reintroducir resultados de acción", () => {
  const state = listState(
    {
      products_q: "equipo agrícola",
      products_filter: "draft",
      products_sort: "name",
      products_dir: "asc",
      products_size: "25",
      products_page: "2",
      brands_page: "3",
      view: "products",
      result: "saved",
    },
    "products_",
    config,
  );
  const url = new URL(
    listHref("/admin/catalogo", state, { page: 3 }),
    "http://localhost",
  );
  assert.equal(url.searchParams.get("products_q"), "equipo agrícola");
  assert.equal(url.searchParams.get("products_filter"), "draft");
  assert.equal(url.searchParams.get("products_sort"), "name");
  assert.equal(url.searchParams.get("products_size"), "25");
  assert.equal(url.searchParams.get("products_page"), "3");
  assert.equal(url.searchParams.get("brands_page"), "3");
  assert.equal(url.searchParams.get("view"), "products");
  assert.equal(url.searchParams.has("result"), false);
});
test("búsqueda de listas conserva texto local y elimina delimitadores de consulta", () => {
  assert.equal(
    searchTerm("  López   QA-01 correo@example.invalid  "),
    "López QA-01 correo@example.invalid",
  );
  assert.equal(/[(),%_"\\]/.test(searchTerm('equipo),id.gt.0%_"\\')), false);
});
