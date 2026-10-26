/* Component interaction QA in jsdom, not a real-browser or visual test.
 * No application dependency added. Run with jsdom in an external QA directory:
 * NODE_PATH=/tmp/greenbel-picker-dom-qa/node_modules node --test scripts/qa-entity-picker-dom.mjs
 */
import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const loadModule = createRequire(import.meta.url);
const { JSDOM } = loadModule("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
});
for (const key of [
  "window",
  "document",
  "Node",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLFormElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "FormData",
])
  global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom does not implement the browser top layer; only observe calls, never claim visual QA.
HTMLElement.prototype.showPopover = function () {
  this.dataset.qaPopover = "open";
};
HTMLElement.prototype.hidePopover = function () {
  delete this.dataset.qaPopover;
};
loadModule.extensions[".tsx"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
loadModule.extensions[".css"] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_, key) => (key === "__esModule" ? false : key) },
  );
};
const React = loadModule("react");
const { act } = React;
const { createRoot } = loadModule("react-dom/client");
const { EntityPicker } = loadModule(
  "../src/app/admin/_components/entity-picker.tsx",
);
const h = React.createElement;
let root, host;
const categories = [
  { id: "foliar", label: "FOLIAR" },
  { id: "aspersion", label: "ASPERSIÓN" },
];
const requests = [];
const wait = async (ms = 280) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
async function mount(props = {}, options = {}) {
  requests.length = 0;
  global.fetch = async (url, config) => {
    requests.push({ url, config });
    return options.fetch
      ? options.fetch(url, config)
      : Response.json({ items: categories, hasMore: false });
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        "form",
        { onChange: options.onChange, onKeyDown: options.onKeyDown },
        h(
          "fieldset",
          { disabled: options.disabled },
          h(EntityPicker, {
            entity: "categories",
            name: "parentId",
            label: "Categoría superior",
            emptyLabel: "Sin categoría superior",
            ...props,
          }),
        ),
        h("button", { type: "button", id: "outside" }, "Otro campo"),
      ),
    ),
  );
  return {
    button: () => host.querySelector("[aria-haspopup='dialog']"),
    input: () => host.querySelector("input[type='search']"),
    field: () => host.querySelector("select"),
    option: (name) =>
      [...host.querySelectorAll("[role='option']")].find(
        (item) => item.textContent === name,
      ),
    form: () => host.querySelector("form"),
  };
}
async function click(element) {
  assert.ok(element, "Element exists");
  await act(async () => element.click());
}
async function type(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(input, key) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => input.dispatchEvent(event));
  return event;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  host?.remove();
});

test("one closed control; search appears inside its popup, focuses and queries on opening", async () => {
  const ui = await mount();
  assert.equal(ui.input(), null);
  assert.equal(host.querySelectorAll("label").length, 1);
  assert.equal(requests.length, 0);
  await click(ui.button());
  await wait(10);
  assert.ok(ui.input().closest("[popover='manual']"));
  assert.equal(document.activeElement, ui.input());
  assert.equal(ui.button().getAttribute("aria-expanded"), "true");
  assert.equal(requests.length, 1);
  assert.equal(
    new URL(requests[0].url, dom.window.location.href).searchParams.get(
      "entity",
    ),
    "categories",
  );
});

test("integrated search filters server results; selection bubbles native change and stores the ID", async () => {
  let changed;
  const ui = await mount(
    {},
    {
      onChange: (event) => {
        if (event.target instanceof HTMLSelectElement)
          changed = event.target.value;
      },
      fetch: async (url) =>
        Response.json({
          items: new URL(url, dom.window.location.href).searchParams.get("q")
            ? [categories[0]]
            : categories,
          hasMore: false,
        }),
    },
  );
  await click(ui.button());
  await wait(10);
  await type(ui.input(), "Foliar");
  assert.equal(
    ui.option("ASPERSIÓN"),
    undefined,
    "Old results cannot be selected while new query is pending",
  );
  await wait();
  assert.equal(host.querySelectorAll("[role='option']").length, 1);
  await click(ui.option("FOLIAR"));
  assert.equal(ui.input(), null);
  assert.equal(ui.field().value, "foliar");
  assert.equal(changed, "foliar");
  assert.equal(new FormData(ui.form()).get("parentId"), "foliar");
  assert.deepEqual([...new FormData(ui.form()).keys()], ["parentId"]);
  assert.match(ui.button().textContent, /FOLIAR/);
  assert.equal(document.activeElement, ui.button());
});

test("keyboard chooses without submitting; Escape closes the dropdown without reaching the drawer", async () => {
  let escaped = 0,
    submitted = 0;
  const ui = await mount(
    {},
    {
      onKeyDown: (event) => {
        if (event.key === "Escape") escaped++;
      },
    },
  );
  ui.form().addEventListener("submit", (event) => {
    event.preventDefault();
    submitted++;
  });
  await key(ui.button(), "ArrowDown");
  await wait(10);
  await key(ui.input(), "ArrowDown");
  await key(ui.input(), "Enter");
  assert.equal(ui.field().value, "foliar");
  assert.equal(submitted, 0);
  await click(ui.button());
  await wait(10);
  const escape = await key(ui.input(), "Escape");
  assert.equal(
    escape.defaultPrevented,
    true,
    "Native dialog dismissal is prevented",
  );
  assert.equal(ui.input(), null);
  assert.equal(escaped, 0);
  assert.equal(document.activeElement, ui.button());
});

test("saved selection persists across searches; exclude hides self; optional choice clears parent", async () => {
  const ui = await mount({
    defaultId: "saved",
    defaultLabel: "Guardada",
    exclude: ["aspersion"],
  });
  await click(ui.button());
  await wait(10);
  assert.equal(ui.option("ASPERSIÓN"), undefined);
  assert.equal(ui.field().value, "saved");
  await type(ui.input(), "Foliar");
  await wait();
  assert.equal(ui.field().value, "saved");
  assert.equal(new FormData(ui.form()).get("parentId"), "saved");
  assert.equal(
    ui.option("Guardada"),
    undefined,
    "Saved nonmatching selection is not injected into results",
  );
  await key(ui.input(), "Escape");
  await click(ui.button());
  await wait(10);
  await click(ui.option("Sin categoría superior"));
  assert.equal(ui.field().value, "");
  assert.equal(new FormData(ui.form()).get("parentId"), "");
});

test("required validation targets the visible picker; disabled fieldset prevents opening", async () => {
  const ui = await mount({ required: true });
  await act(async () => {
    assert.equal(ui.form().checkValidity(), false);
  });
  assert.ok(ui.input());
  assert.equal(ui.button().dataset.invalid, "true");
  await wait(10);
  await click(ui.option("FOLIAR"));
  assert.equal(ui.form().checkValidity(), true);
  assert.equal(ui.button().dataset.invalid, undefined);
  await act(async () => {
    host.querySelector("fieldset").disabled = true;
  });
  await click(ui.button());
  assert.equal(ui.input(), null);
});

test("error retry, no matches and more-results states preserve selection and request constraints", async () => {
  let attempt = 0;
  const ui = await mount(
    {
      defaultId: "saved",
      defaultLabel: "Guardada",
      kind: "part",
      published: true,
      active: true,
    },
    {
      fetch: async () =>
        ++attempt === 1
          ? new Response(null, { status: 503 })
          : Response.json({ items: [], hasMore: false }),
    },
  );
  await click(ui.button());
  await wait(10);
  assert.match(
    host.querySelector("[role='alert']").textContent,
    /No se pudieron/,
  );
  await click(
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Reintentar",
    ),
  );
  await wait(10);
  assert.equal(ui.field().value, "saved");
  await type(ui.input(), "Ninguna");
  await wait();
  assert.match(
    host.querySelector("[role='status']").textContent,
    /Sin coincidencias/,
  );
  const params = new URL(requests.at(-1).url, dom.window.location.href)
    .searchParams;
  assert.equal(params.get("kind"), "part");
  assert.equal(params.get("published"), "true");
  assert.equal(params.get("active"), "true");
  global.fetch = async () =>
    Response.json({ items: categories, hasMore: true });
  await type(ui.input(), "Foliar");
  await wait();
  assert.match(
    host.querySelector("[role='status']").textContent,
    /más resultados/,
  );
});

test("late responses cannot replace newer matches; dismiss on outside focus; clamp panel to 320px viewport", async () => {
  let resolveOld;
  const ui = await mount(
    {},
    {
      fetch: async (url) => {
        const q = new URL(url, dom.window.location.href).searchParams.get("q");
        if (q === "Antigua")
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        return Response.json({
          items: q ? [categories[0]] : categories,
          hasMore: false,
        });
      },
    },
  );
  await click(ui.button());
  await wait(10);
  await type(ui.input(), "Antigua");
  await wait();
  await type(ui.input(), "Foliar");
  await wait();
  await act(async () => {
    resolveOld(Response.json({ items: [categories[1]], hasMore: false }));
  });
  assert.ok(ui.option("FOLIAR"));
  assert.equal(ui.option("ASPERSIÓN"), undefined);
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 320,
  });
  ui.button().getBoundingClientRect = () => ({
    left: 180,
    right: 480,
    top: 620,
    bottom: 666,
    width: 300,
    height: 46,
  });
  await act(async () => window.dispatchEvent(new Event("resize")));
  const popup = host.querySelector("[popover]");
  assert.equal(popup.style.width, "296px");
  assert.equal(popup.style.left, "12px");
  assert.equal(popup.style.top, "auto");
  await act(async () => document.getElementById("outside").focus());
  assert.equal(ui.input(), null);
});

// Render the real product workspace with mocked server operations; no database/browser writes.
const Module = loadModule("node:module");
const originalLoad = Module._load;
let routerRefreshes = 0;
const routerMock = {
  refresh() {
    routerRefreshes++;
  },
};
let productSave = async () => ({
  status: "success",
  message: "Producto guardado.",
  productId: "00000000-0000-4000-8000-000000000001",
});
const actionMock = new Proxy(
  {},
  {
    get: (_, name) =>
      name === "saveProductAction"
        ? (...args) => productSave(...args)
        : async () => ({ status: "success", message: "Guardado." }),
  },
);
Module._load = function (request, parent, ...rest) {
  if (request === "@/lib/products/product-editor-data")
    return originalLoad.call(
      this,
      loadModule.resolve("../src/lib/products/product-editor-data.ts"),
      parent,
      ...rest,
    );
  if (request === "./actions" && parent?.filename.includes("/admin/catalogo/"))
    return actionMock;
  if (request === "next/navigation")
    return {
      useRouter: () => routerMock,
      useSearchParams: () => new URLSearchParams(window.location.search),
    };
  if (request === "next/image")
    return {
      __esModule: true,
      default: (props) =>
        h("img", {
          src: props.src,
          alt: props.alt,
          width: props.width,
          height: props.height,
          className: props.className,
        }),
    };
  return originalLoad.call(this, request, parent, ...rest);
};
const { ProductEditor } = loadModule(
  "../src/app/admin/catalogo/product-editor.tsx",
);
const { ProductsAdmin } = loadModule(
  "../src/app/admin/catalogo/products-admin.tsx",
);
Module._load = originalLoad;
const product = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Producto de QA",
  sku: "UPL1008",
  slug: "producto-qa",
  model: null,
  kind: "agricultural",
  brand_id: "upl",
  category_id: "insecticida",
  short_description: null,
  description: null,
  regular_price: "685.18",
  warranty_months: null,
  warranty_terms: null,
  publication_status: "draft",
  featured: false,
};
async function mountProduct(options = {}) {
  requests.length = 0;
  global.fetch = async (url) => {
    requests.push({ url });
    const params = new URL(url, dom.window.location.href).searchParams;
    const brands = [
      { id: "upl", label: "UPL" },
      { id: "other-brand", label: "Otra marca" },
    ];
    const categories = [
      { id: "insecticida", label: "INSECTICIDA" },
      { id: "other-category", label: "Otra categoría" },
    ];
    const values = params.get("entity") === "brands" ? brands : categories;
    return Response.json({
      items: params.get("q") ? values.slice(1) : values,
      hasMore: false,
    });
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      h(ProductEditor, {
        product,
        products: [product],
        brands: [{ id: "upl", name: "UPL" }],
        categories: [{ id: "insecticida", name: "INSECTICIDA" }],
        images: [],
        specs: [],
        inclusions: [],
        compatibilities: [],
        detailsReady: true,
        onBusyChange() {},
        onSaved() {},
        onCancel() {},
        ...options,
      }),
    ),
  );
}

test("product form has integrated brand/category pickers, image section first, one final save and understandable labels", async () => {
  await mountProduct();
  const sections = [...host.querySelectorAll("section")];
  assert.match(sections[0].querySelector("h3").textContent, /Imágenes/);
  const classification = sections.find(
    (section) =>
      section.querySelector("h3")?.textContent === "Marca y categoría",
  );
  assert.equal(
    classification.querySelectorAll("button[aria-haspopup='dialog']").length,
    2,
  );
  assert.equal(
    classification.querySelectorAll("input[type='search']").length,
    0,
  );
  assert.equal(host.querySelectorAll("form form").length, 0);
  const sku = host.querySelector("[name='sku']");
  assert.equal(host.querySelector("[name='slug']"), null);
  assert.ok(!host.textContent.includes("Nombre en el enlace"));
  assert.equal(
    host.querySelector(`label[for='${sku.id}']`).textContent.trim(),
    "Código del producto *",
  );
  assert.match(
    document.getElementById(sku.getAttribute("aria-describedby")).textContent,
    /UPL1008/,
  );
  const save = [...host.querySelectorAll("button")].filter(
    (button) => button.textContent === "Guardar cambios",
  );
  assert.equal(save.length, 1);
  assert.ok(save[0].closest("footer"));
  assert.equal(save[0].form, sku.form);
  const [brand, category] = classification.querySelectorAll(
    "button[aria-haspopup='dialog']",
  );
  await click(brand);
  await wait(10);
  await type(classification.querySelector("input[type='search']"), "Otra");
  await wait();
  await click(
    [...classification.querySelectorAll("[role='option']")].find(
      (item) => item.textContent === "Otra marca",
    ),
  );
  await click(category);
  await wait(10);
  await type(classification.querySelector("input[type='search']"), "Otra");
  await wait();
  await click(
    [...classification.querySelectorAll("[role='option']")].find(
      (item) => item.textContent === "Otra categoría",
    ),
  );
  const data = new FormData(sku.form);
  assert.equal(data.get("brandId"), "other-brand");
  assert.equal(data.get("categoryId"), "other-category");
  assert.equal(data.get("sku"), "UPL1008");
  assert.equal(data.has("slug"), false);
  assert.equal(data.get("regularPrice"), "685.18");
  assert.equal(data.get("kind"), "agricultural");
});

test("product footer submits the correct form, disables duplicates while pending, and preserves input on recoverable error", async () => {
  let finish,
    calls = 0,
    payload;
  productSave = async (_previous, data) => {
    calls++;
    payload = data;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  await mountProduct();
  const name = host.querySelector("[name='name']");
  await type(name, "Nombre conservado");
  const save = [...host.querySelectorAll("footer button")].find(
    (button) => button.type === "submit",
  );
  await click(save);
  assert.equal(calls, 1);
  assert.equal(payload.get("name"), "Nombre conservado");
  assert.equal(payload.get("sku"), "UPL1008");
  assert.equal(save.disabled, true);
  await click(save);
  assert.equal(calls, 1);
  await act(async () =>
    finish({ status: "error", message: "Reintenta el guardado." }),
  );
  assert.equal(save.disabled, false);
  assert.equal(name.value, "Nombre conservado");
  assert.match(
    host.querySelector("footer [role='alert']").textContent,
    /Reintenta/,
  );
});

function detailsFor(row = product) {
  return {
    product: row,
    images: [
      {
        id: "photo-" + row.id,
        product_id: row.id,
        alt_text: "Foto " + row.name,
        sort_order: 0,
        is_primary: true,
      },
    ],
    specs: [
      {
        id: "spec-" + row.id,
        product_id: row.id,
        label: "Material",
        value: "Detalle " + row.name,
        unit: null,
        sort_order: 0,
      },
    ],
    inclusions: [],
    compatibilities: [],
    relatedProducts: [],
    brands: [],
    categories: [],
  };
}
async function mountProducts(rows = [product]) {
  window.history.replaceState(null, "", "/admin/catalogo?view=products");
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      h(ProductsAdmin, {
        rows,
        products: rows,
        brands: [],
        categories: [],
        selectedId: "",
        images: [],
        specs: [],
        inclusions: [],
        compatibilities: [],
        controls: null,
        pager: null,
        count: rows.length,
      }),
    ),
  );
}

test("product Edit completes image/details loading with one targeted read and no router refresh", async () => {
  let finish,
    calls = 0;
  routerRefreshes = 0;
  global.fetch = async (url) => {
    calls++;
    assert.equal(url, "/api/admin/products/" + product.id);
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  await mountProducts();
  assert.equal(host.querySelector("#editor-producto"), null);
  await click(
    host.querySelector(`button[aria-label="Editar ${product.name}"]`),
  );
  assert.equal(host.querySelector("#editor-producto").open, true);
  assert.ok(host.querySelector("#editor-producto [name='sku']"));
  assert.match(
    host.querySelector("#editor-producto [role='status']").textContent,
    /Cargando fotografías/,
  );
  await act(async () => finish(Response.json(detailsFor())));
  assert.ok(host.querySelector("#editor-producto input[name='image']"));
  assert.ok(
    [...host.querySelectorAll("#editor-producto input[name='value']")].some(
      (field) => field.value === "Detalle " + product.name,
    ),
  );
  assert.ok(
    host.querySelector(
      `img[src="/api/admin/product-images/photo-${product.id}"]`,
    ),
  );
  assert.equal(
    host
      .querySelector("#editor-producto")
      .textContent.includes("Cargando fotografías"),
    false,
  );
  assert.equal(calls, 1);
  assert.equal(routerRefreshes, 0);
  await click(
    host.querySelector("button[aria-label='Cerrar editor de producto']"),
  );
  assert.equal(host.querySelector("#editor-producto"), null);
  assert.equal(
    new URLSearchParams(window.location.search).get("product"),
    null,
  );
});

test("failed product details load offers retry, recovers and preserves edits in basic fields", async () => {
  let attempt = 0;
  global.fetch = async () =>
    ++attempt === 1
      ? new Response(null, { status: 503 })
      : Response.json(detailsFor());
  await mountProducts();
  await click(
    host.querySelector(`button[aria-label="Editar ${product.name}"]`),
  );
  assert.match(
    host.querySelector("#editor-producto [role='alert']").textContent,
    /No se pudieron cargar/,
  );
  const name = host.querySelector("#editor-producto [name='name']");
  await type(name, "Cambios sin perder");
  const retry = [...host.querySelectorAll("#editor-producto button")].find(
    (button) => button.textContent === "Reintentar carga",
  );
  await click(retry);
  assert.equal(attempt, 2);
  assert.equal(name.value, "Cambios sin perder");
  assert.ok(host.querySelector("#editor-producto input[name='image']"));
  assert.equal(host.querySelector("#editor-producto [role='alert']"), null);
});

test("switching products ignores late responses and closing/reopening performs a fresh targeted read", async () => {
  const second = {
    ...product,
    id: "00000000-0000-4000-8000-000000000002",
    name: "Segundo producto",
    sku: "QA2",
  };
  let finishFirst,
    firstCalls = 0;
  global.fetch = async (url) => {
    if (url.endsWith(product.id) && ++firstCalls === 1)
      return new Promise((resolve) => {
        finishFirst = resolve;
      });
    return Response.json(
      detailsFor(url.endsWith(second.id) ? second : product),
    );
  };
  await mountProducts([product, second]);
  await click(
    host.querySelector(`button[aria-label="Editar ${product.name}"]`),
  );
  await click(
    host.querySelector("button[aria-label='Cerrar editor de producto']"),
  );
  await click(host.querySelector(`button[aria-label="Editar ${second.name}"]`));
  await act(async () => finishFirst(Response.json(detailsFor())));
  assert.equal(
    host.querySelector("#editor-producto [name='sku']").value,
    "QA2",
  );
  assert.ok(
    [...host.querySelectorAll("#editor-producto input[name='value']")].some(
      (field) => field.value === "Detalle Segundo producto",
    ),
  );
  assert.equal(
    host.querySelector(
      `img[src="/api/admin/product-images/photo-${product.id}"]`,
    ),
    null,
  );
  await click(
    host.querySelector("button[aria-label='Cerrar editor de producto']"),
  );
  await click(
    host.querySelector(`button[aria-label="Editar ${product.name}"]`),
  );
  assert.equal(firstCalls, 2);
  assert.ok(host.querySelector("#editor-producto input[name='image']"));
});

test("successful detail operation asks the targeted loader to refresh its data", async () => {
  let refreshes = 0;
  await mountProduct({
    onDetailsRefresh: () => {
      refreshes++;
    },
    specs: detailsFor().specs,
  });
  const form = host.querySelector("input[name='label']").form;
  await click(
    [...form.querySelectorAll("button")].find(
      (button) => button.type === "submit",
    ),
  );
  assert.equal(refreshes, 1);
});
