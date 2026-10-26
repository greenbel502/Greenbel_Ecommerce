/* Actual components in jsdom. Server/network and external navigation are controlled here. */
import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url),
  { JSDOM } = require("jsdom"),
  dom = new JSDOM("<html><body></body></html>", {
    url: "http://localhost:3000/carrito",
  });
for (const key of [
  "window",
  "document",
  "Node",
  "HTMLElement",
  "HTMLDialogElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLFormElement",
  "HTMLAnchorElement",
  "Event",
  "MouseEvent",
  "FormData",
])
  global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
// Browser Blob revocation is deferred to protect downloads; it must not hold a Node test process open.
const nativeTimeout = global.setTimeout;
global.setTimeout = (fn, delay, ...args) => {
  const timer = nativeTimeout(fn, delay, ...args);
  if (delay >= 60000) timer.unref();
  return timer;
};
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
let downloads = [],
  revoked = [],
  requests = [],
  actionCalls = [],
  fetchOverride,
  saveOverride,
  deleteOverride;
URL.createObjectURL = () => "blob:qa-pdf";
URL.revokeObjectURL = (v) => revoked.push(v);
HTMLAnchorElement.prototype.click = function () {
  if (this.download) downloads.push({ name: this.download, url: this.href });
  else
    this.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
};
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, file) =>
    m._compile(
      ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
        },
      }).outputText,
      file,
    );
require.extensions[".css"] = (m) => {
  m.exports = new Proxy(
    {},
    { get: (_, k) => (k === "__esModule" ? false : k) },
  );
};
const React = require("react"),
  { act } = React,
  { createRoot } = require("react-dom/client"),
  h = React.createElement,
  Module = require("module"),
  original = Module._load;
const id = "11111111-1111-4111-8111-111111111111",
  phone = "12025550100";
const preferences = { paymentMethod: "cash", deliveryMethod: "pickup" };
Module._load = function (request, parent, main) {
  if (request === "next/link")
    return {
      __esModule: true,
      default: ({ children, ...props }) => h("a", props, children),
    };
  if (request === "./actions" && parent?.filename.includes("/admin/contacto/"))
    return {
      saveContactAction: async (input) => {
        actionCalls.push(["save", input]);
        return saveOverride
          ? saveOverride(input)
          : {
              status: "success",
              message: "Contacto guardado.",
              settings: {
                revision: "2026-10-25T12:00:00Z",
                contacts: {
                  version: 1,
                  entries: [{ ...input, id, value: phone }],
                },
              },
            };
      },
      deleteContactAction: async (input) => {
        actionCalls.push(["delete", input]);
        return deleteOverride
          ? deleteOverride(input)
          : {
              status: "success",
              message: "Contacto eliminado.",
              settings: {
                revision: "2026-10-25T12:01:00Z",
                contacts: { version: 1, entries: [] },
              },
            };
      },
    };
  if (request.startsWith("@/"))
    return original.call(
      this,
      process.cwd() + "/src/" + request.slice(2),
      parent,
      main,
    );
  return original.call(this, request, parent, main);
};
const {
    WhatsAppPurchase,
  } = require("../src/presentation/components/whatsapp-purchase.tsx"),
  { ContactsAdmin } = require("../src/app/admin/contacto/contacts-admin.tsx"),
  {
    normalizePhone,
    contactsPayloadSchema,
    publicGreenbelContacts,
  } = require("../src/lib/contacts/model.ts"),
  {
    buildWhatsAppSelection,
    canRequestByWhatsApp,
    whatsAppSelectionUrl,
  } = require("../src/domain/cart/whatsapp-selection.ts");
const product = {
  id,
  name: "Aspersor agrícola",
  sku: "AK-26TB",
  price: 123.45,
  isMockPrice: false,
  stock: null,
  availability: "unknown",
};
const lines = [{ product, quantity: 2 }];
let root, host;
async function mount(element, account = { name: "QA" }) {
  downloads = [];
  revoked = [];
  requests = [];
  actionCalls = [];
  fetchOverride = undefined;
  saveOverride = undefined;
  deleteOverride = undefined;
  global.fetch = async (url, options) => {
    if (url === "/api/account/session") return Response.json({ account });
    requests.push([url, options]);
    if (fetchOverride) return fetchOverride(url, options);
    return new Response(new Blob(["%PDF-qa"]), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition":
          'attachment; filename="Seleccion-GreenBel-GB-QA.pdf"',
        "X-Greenbel-WhatsApp-Url": whatsAppSelectionUrl(
          phone,
          "GB-QA",
          2,
          "Seleccion-GreenBel-GB-QA.pdf",
          preferences,
          24690,
        ),
      },
    });
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
});
async function click(node) {
  assert.ok(node);
  await act(async () => node.click());
}
async function type(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2));
  });
}
async function choosePreferences() {
  for (const [index, value] of [
    [0, "cash"],
    [1, "pickup"],
  ]) {
    const select = host.querySelectorAll("select")[index];
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
}
const button = (text) =>
  [...host.querySelectorAll("button,a")].find(
    (n) => n.textContent.trim() === text,
  );
test("public projection excludes every cooperative and non-primary contact; international phones and duplicate primary entries are validated", () => {
  assert.equal(normalizePhone("+502 1234-5678"), "50212345678");
  assert.equal(normalizePhone("555"), null);
  assert.equal(normalizePhone("https://evil.test"), null);
  const entries = [
    {
      id,
      company: "greenbel",
      kind: "phone",
      value: phone,
      primary: true,
      label: "Ventas",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      company: "cooperative",
      kind: "email",
      value: "private@example.invalid",
      primary: true,
      label: "Financiamiento",
    },
  ];
  assert.deepEqual(publicGreenbelContacts({ version: 1, entries }), {
    whatsappNumber: phone,
    email: null,
  });
  assert.equal(
    contactsPayloadSchema.safeParse({
      version: 1,
      entries: [
        ...entries,
        {
          ...entries[0],
          id: "33333333-3333-4333-8333-333333333333",
          value: "12025550101",
        },
      ],
    }).success,
    false,
  );
});
test("selection supports priced products with unknown stock for adviser review, rejects unavailable or unpriced lines and calculates exact cents", () => {
  assert.equal(canRequestByWhatsApp(product), true);
  assert.equal(canRequestByWhatsApp({ ...product, price: null }), false);
  assert.equal(
    canRequestByWhatsApp({ ...product, availability: "unavailable" }),
    false,
  );
  const doc = buildWhatsAppSelection(
    [{ productId: id, quantity: 3 }],
    [product],
    "GB-QA",
    "2026-10-25T12:00:00Z",
    preferences,
  );
  assert.equal(doc.subtotalCents, 37035);
  assert.equal(doc.lines[0].availabilityPending, true);
  assert.throws(
    () =>
      buildWhatsAppSelection(
        [{ productId: id, quantity: 4 }],
        [{ ...product, stock: 2 }],
        "GB-QA",
        doc.issuedAt,
        preferences,
      ),
    /cantidad/,
  );
  assert.throws(
    () =>
      buildWhatsAppSelection(
        [
          { productId: id, quantity: 1 },
          { productId: id, quantity: 1 },
        ],
        [product],
        "GB-QA",
        doc.issuedAt,
        preferences,
      ),
    /cantidades/,
  );
});
test("canceling the modal aborts preparation without downloading a PDF or opening a chat", async () => {
  await mount(h(WhatsAppPurchase, { lines, ready: true }));
  let signal;
  fetchOverride = (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  await choosePreferences();
  await click(button("Comprar por WhatsApp"));
  assert.ok(host.querySelector("dialog").open);
  assert.match(host.textContent, /Por favor, adjunta el PDF/);
  assert.equal(button("Continuar").disabled, true);
  assert.equal(document.activeElement.textContent, "Cancelar");
  await click(button("Cancelar"));
  assert.equal(host.querySelector("dialog"), null);
  assert.equal(signal.aborted, true);
  assert.equal(downloads.length, 0);
});
test("Continue downloads the prepared PDF and carries a genuine external WhatsApp link; duplicate clicks do not duplicate the download", async () => {
  await mount(h(WhatsAppPurchase, { lines, ready: true }));
  await choosePreferences();
  await click(button("Comprar por WhatsApp"));
  await flush();
  const link = button("Continuar");
  assert.equal(link.tagName, "A");
  assert.match(link.href, /^https:\/\/wa.me\/12025550100\?/);
  assert.equal(link.target, "_blank");
  assert.equal(link.rel, "noopener noreferrer");
  assert.equal(downloads.length, 0);
  link.addEventListener("click", (e) => e.preventDefault());
  await act(async () => {
    link.click();
    link.click();
  });
  await flush();
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "Seleccion-GreenBel-GB-QA.pdf");
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    lines: [{ productId: id, quantity: 2 }],
    preferences,
  });
  assert.match(host.textContent, /Se inició la descarga/);
  await click(button("Descargar PDF de nuevo"));
  assert.equal(downloads.length, 2);
});
test("failed PDF preparation cannot enable Continue or trigger a download; retry can recover", async () => {
  await mount(h(WhatsAppPurchase, { lines, ready: true }));
  fetchOverride = async () =>
    Response.json(
      { error: "WhatsApp aún no está configurado" },
      { status: 503 },
    );
  await choosePreferences();
  await click(button("Comprar por WhatsApp"));
  await flush();
  assert.match(host.querySelector('[role="alert"]').textContent, /configurado/);
  assert.equal(button("Continuar").disabled, true);
  assert.equal(downloads.length, 0);
  fetchOverride = undefined;
  await click(button("Reintentar"));
  await flush();
  assert.equal(button("Continuar").tagName, "A");
});
test("incomplete restoration or missing prices disables the WhatsApp purchase trigger", async () => {
  await mount(h(WhatsAppPurchase, { lines, ready: false }));
  assert.equal(button("Comprar por WhatsApp").disabled, true);
  await act(async () =>
    root.render(
      h(WhatsAppPurchase, {
        lines: [{ ...lines[0], product: { ...product, price: null } }],
        ready: true,
      }),
    ),
  );
  assert.equal(button("Comprar por WhatsApp").disabled, true);
});
test("admin has distinct GreenBel/cooperative contact groups and saves a number from the final drawer button", async () => {
  await mount(
    h(ContactsAdmin, {
      initial: { revision: null, contacts: { version: 1, entries: [] } },
    }),
  );
  assert.equal(
    host.querySelectorAll('button[aria-label^="Agregar"]').length,
    4,
  );
  await click(
    host.querySelector('button[aria-label="Agregar teléfono de GreenBel"]'),
  );
  assert.ok(host.querySelector("dialog").open);
  assert.equal(host.querySelector('input[type="checkbox"]').checked, true);
  await type(host.querySelector('input[type="tel"]'), "+1 202 555 0100");
  await click(button("Guardar contacto"));
  await flush();
  assert.equal(actionCalls.length, 1);
  assert.equal(actionCalls[0][1].company, "greenbel");
  assert.equal(actionCalls[0][1].kind, "phone");
  assert.equal(host.querySelector("dialog"), null);
  assert.match(host.textContent, /12025550100/);
});
test("deleting the principal contact requires confirmation; cancel keeps it and confirmed removal does not silently choose another destination", async () => {
  await mount(
    h(ContactsAdmin, {
      initial: {
        revision: "2026-10-25T12:00:00Z",
        contacts: {
          version: 1,
          entries: [
            {
              id,
              company: "greenbel",
              kind: "phone",
              value: phone,
              label: "Ventas",
              primary: true,
            },
          ],
        },
      },
    }),
  );
  await click(host.querySelector(`button[aria-label="Eliminar ${phone}"]`));
  assert.match(
    host.querySelector("dialog").textContent,
    /quedarán sin un número/,
  );
  await click(button("Cancelar"));
  assert.equal(actionCalls.length, 0);
  assert.ok(host.querySelector(`button[aria-label="Eliminar ${phone}"]`));
  await click(host.querySelector(`button[aria-label="Eliminar ${phone}"]`));
  await click(button("Eliminar contacto"));
  assert.equal(actionCalls.length, 1);
  assert.deepEqual(actionCalls[0][1], {
    id,
    revision: "2026-10-25T12:00:00Z",
    confirmation: "delete",
  });
  assert.match(host.textContent, /Selecciona un número principal/);
});

test("anonymous buyers see login and registration links and cannot prepare a PDF", async () => {
  await mount(h(WhatsAppPurchase, { lines, ready: true }), null);
  assert.equal(button("Comprar por WhatsApp"), undefined);
  assert.match(button("Iniciar sesión para comprar").href, /next=%2Fcheckout/);
  assert.ok(button("Crear una cuenta"));
  assert.equal(host.querySelector("dialog"), null);
  assert.equal(requests.length, 0);
});
test("authenticated buyers must choose both preferences before preparing a PDF", async () => {
  await mount(h(WhatsAppPurchase, { lines, ready: true }));
  await click(button("Comprar por WhatsApp"));
  assert.match(host.querySelector('[role="alert"]').textContent, /Selecciona/);
  assert.equal(requests.length, 0);
  assert.equal(document.activeElement, host.querySelector("select"));
  await choosePreferences();
  await click(button("Comprar por WhatsApp"));
  await flush();
  assert.ok(host.querySelector("dialog"));
  assert.deepEqual(JSON.parse(requests[0][1].body).preferences, preferences);
});
test("a session rejected by PDF endpoint closes the purchase and requires login", async () => {
  await mount(h(WhatsAppPurchase, { lines, ready: true }));
  fetchOverride = async () =>
    Response.json({ error: "Inicia sesión" }, { status: 401 });
  await choosePreferences();
  await click(button("Comprar por WhatsApp"));
  await flush();
  assert.equal(host.querySelector("dialog"), null);
  assert.ok(button("Iniciar sesión para comprar"));
  assert.equal(downloads.length, 0);
});
