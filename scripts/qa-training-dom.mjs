/* Actual React components in jsdom. No claim of real-browser layout, playback or focus trapping. */
import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url),
  { JSDOM } = require("jsdom"),
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost:3000/admin/capacitaciones",
  });
for (const key of [
  "window",
  "document",
  "Node",
  "HTMLElement",
  "HTMLDialogElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "HTMLFormElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "FormData",
  "File",
])
  global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
HTMLElement.prototype.showPopover = function () {};
HTMLElement.prototype.hidePopover = function () {};
URL.createObjectURL = () => "blob:qa-preview";
URL.revokeObjectURL = () => {};
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
    { get: (_, key) => (key === "__esModule" ? false : key) },
  );
};
const React = require("react"),
  { act } = React,
  { createRoot } = require("react-dom/client"),
  h = React.createElement,
  Module = require("module"),
  originalLoad = Module._load;
const id = "11111111-1111-4111-8111-111111111111",
  path = id + "/22222222-2222-4222-8222-222222222222.mp4";
const training = {
  id,
  title: "Guía del equipo",
  slug: "guia-equipo",
  description: "Descripción guardada",
  video_url: null,
  video_storage_path: null,
  cover_path: null,
  publication_status: "draft",
  created_at: "2026-10-25T00:00:00Z",
};
let calls = [],
  rated = [],
  saved = [],
  uploads = 0,
  saveOverride,
  rateOverride,
  fetchOverride,
  uploadOverride,
  deleteOverride,
  deletions = [],
  refreshes = 0;
const router = {
  refresh() {
    refreshes++;
  },
};
const action = async (_old, data) => {
  calls.push(["save", data.get("id"), data.get("publicationStatus")]);
  if (saveOverride) return saveOverride(data);
  return {
    status: "success",
    message: "Guardado",
    training: {
      ...training,
      id: data.get("id") || id,
      title: data.get("title"),
      description: data.get("description") || null,
      video_url:
        data.get("videoOperation") === "url"
          ? data.get("videoUrl") || null
          : null,
      video_storage_path: calls.some((c) => c[0] === "confirm") ? path : null,
      publication_status: data.get("publicationStatus"),
    },
  };
};
Module._load = function (request, parent, main) {
  if (request === "next/navigation") return { useRouter: () => router };
  if (request === "next/link")
    return {
      __esModule: true,
      default: ({ children, ...props }) => h("a", props, children),
    };
  if (request.endsWith("/capacitaciones/rating-actions"))
    return {
      rateTraining: async (owner, _old, data) => {
        rated.push([owner, data.get("rating")]);
        return rateOverride
          ? rateOverride(data)
          : {
              status: "success",
              message: "Calificación guardada",
              rating: Number(data.get("rating")),
            };
      },
    };
  if (
    (request === "./actions" &&
      parent?.filename.includes("/admin/capacitaciones/")) ||
    request === "../capacitaciones/actions"
  )
    return {
      saveTrainingAction: action,
      deleteTrainingAction: async (_previous, data) => {
        deletions.push(Object.fromEntries(data));
        return deleteOverride
          ? deleteOverride(data)
          : {
              status: "success",
              message: "Capacitación eliminada correctamente.",
            };
      },
      saveTrainingRelationAction: async () => ({
        status: "success",
        message: "Asociado",
      }),
    };
  if (request === "./actions" && parent?.filename.includes("/admin/catalogo/"))
    return {
      deleteBrandAction() {
        throw Error("Unexpected brand deletion");
      },
      deleteCategoryAction() {
        throw Error("Unexpected category deletion");
      },
      deleteProductAction() {
        throw Error("Unexpected product deletion");
      },
    };
  if (request === "@/lib/trainings/upload-video")
    return {
      uploadTrainingVideo: async (_file, _ticket, progress, signal) => {
        if (uploadOverride) await uploadOverride(signal);
        uploads++;
        calls.push(["upload"]);
        progress(100);
      },
    };
  if (request.startsWith("@/"))
    return originalLoad.call(
      this,
      process.cwd() + "/src/" + request.slice(2),
      parent,
      main,
    );
  return originalLoad.call(this, request, parent, main);
};
const {
    TrainingEditor,
  } = require("../src/app/admin/capacitaciones/training-editor.tsx"),
  {
    TrainingAdmin,
  } = require("../src/app/admin/capacitaciones/training-admin.tsx"),
  {
    TrainingRatingForm,
  } = require("../src/presentation/components/training-rating-form.tsx"),
  {
    TrainingVideo,
  } = require("../src/presentation/components/training-video.tsx");
let root, host;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function mount(element) {
  calls = [];
  rated = [];
  saved = [];
  uploads = 0;
  refreshes = 0;
  saveOverride = undefined;
  rateOverride = undefined;
  fetchOverride = undefined;
  uploadOverride = undefined;
  deleteOverride = undefined;
  deletions = [];
  window.history.replaceState({}, "", "/admin/capacitaciones");
  window.confirm = () => true;
  global.fetch = async (url, options = {}) => {
    calls.push([url, options.method]);
    if (fetchOverride) return fetchOverride(url, options);
    if (url.startsWith("/api/admin/trainings/"))
      return Response.json({
        training,
        products: [],
        categories: [],
        productLinks: [],
        categoryLinks: [],
      });
    if (url === "/api/admin/training-videos" && options.method === "POST")
      return Response.json(
        {
          endpoint:
            "https://example.supabase.co/storage/v1/upload/resumable/sign",
          token: "qa",
          path,
        },
        { status: 201 },
      );
    if (url === "/api/admin/training-videos" && options.method === "PUT") {
      calls.push(["confirm"]);
      return Response.json({ status: "recorded", path });
    }
    if (url === "/api/admin/training-covers")
      return Response.json(
        {
          status: "recorded",
          coverPath: id + "/33333333-3333-4333-8333-333333333333.png",
        },
        { status: 201 },
      );
    return Response.json({ status: "removed", items: [] });
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
  assert.ok(node, "click target");
  await act(async () => node.click());
}
async function type(node, value) {
  assert.ok(node);
  const proto =
    node.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : node.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    node.dispatchEvent(
      new Event(node.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function choose(label, file) {
  const node = host.querySelector(`input[aria-label='${label}']`);
  Object.defineProperty(node, "files", { value: [file], configurable: true });
  await act(async () =>
    node.dispatchEvent(new Event("change", { bubbles: true })),
  );
}
const editor = () =>
  h(TrainingEditor, {
    onBusy() {},
    onSaved: (r) => saved.push(r),
    onIdCreated() {},
    relations: h("div", null, "Asociaciones"),
  });
const saveButton = () => host.querySelector('footer button[type="submit"]');
test("rating uses five native radio choices; saves one value and allows updating without disabling permanently", async () => {
  await mount(
    h(TrainingRatingForm, { id, viewer: { status: "ready", rating: null } }),
  );
  assert.equal(host.querySelectorAll('input[type="radio"]').length, 5);
  assert.equal(host.querySelector('button[type="submit"]').disabled, true);
  await click(host.querySelector('input[value="5"]'));
  assert.equal(host.querySelector('button[type="submit"]').disabled, false);
  await click(host.querySelector('button[type="submit"]'));
  await flush();
  assert.deepEqual(rated, [[id, "5"]]);
  assert.match(host.textContent, /guardada: 5 de 5/);
  assert.equal(host.querySelector('button[type="submit"]').disabled, true);
  await click(host.querySelector('input[value="2"]'));
  await click(host.querySelector('button[type="submit"]'));
  await flush();
  assert.deepEqual(rated.at(-1), [id, "2"]);
  assert.match(host.textContent, /guardada: 2 de 5/);
});
test("rating errors preserve selection and pending disables duplicate submissions", async () => {
  await mount(
    h(TrainingRatingForm, { id, viewer: { status: "ready", rating: 3 } }),
  );
  let finish;
  rateOverride = () =>
    new Promise((r) => {
      finish = r;
    });
  await click(host.querySelector('input[value="4"]'));
  await click(host.querySelector('button[type="submit"]'));
  assert.ok(host.querySelector("fieldset").disabled);
  await click(host.querySelector('button[type="submit"]'));
  assert.equal(rated.length, 1);
  await act(async () => finish({ status: "error", message: "Reintenta" }));
  assert.equal(host.querySelector('input[value="4"]').checked, true);
  assert.equal(host.querySelector('button[type="submit"]').disabled, false);
  assert.match(host.querySelector('[role="alert"]').textContent, /Reintenta/);
});
test("visitors get a real login link and cannot send a rating form", async () => {
  await mount(
    h(TrainingRatingForm, {
      id,
      viewer: { status: "unauthenticated", rating: null },
    }),
  );
  assert.equal(
    host.querySelector("a").getAttribute("href"),
    "/cuenta/ingresar",
  );
  assert.equal(host.querySelector("form"), null);
});
test("editor has no manual slug, no nested forms, and one final save attached to its own form", async () => {
  await mount(editor());
  assert.equal(host.querySelector('[name="slug"]'), null);
  assert.equal(host.querySelectorAll("form form").length, 0);
  assert.ok(saveButton().closest("footer"));
  assert.equal(saveButton().form, host.querySelector("form"));
  await type(host.querySelector('[name="title"]'), "Capacitación nueva");
  await click(saveButton());
  await flush();
  assert.equal(saved.length, 1);
  assert.equal(calls.filter((c) => c[0] === "save" && c[1] === "").length, 1);
});
test("one save uploads video/cover before publishing and reports complete success only at the end", async () => {
  await mount(editor());
  await type(host.querySelector('[name="title"]'), "Capacitación nueva");
  await choose(
    "Seleccionar video",
    new File(["video"], "qa.mp4", { type: "video/mp4" }),
  );
  await choose(
    "Seleccionar portada",
    new File(["image"], "qa.png", { type: "image/png" }),
  );
  await type(host.querySelector("select"), "published");
  await click(saveButton());
  await flush();
  assert.equal(saved.length, 1);
  assert.equal(uploads, 1);
  const order = calls.filter((c) =>
    ["save", "upload", "confirm", "/api/admin/training-covers"].includes(c[0]),
  );
  assert.equal(order[0][0], "save");
  assert.equal(order[0][2], "draft");
  assert.ok(
    order.findIndex((c) => c[0] === "confirm") <
      order.findIndex((c) => c[0] === "/api/admin/training-covers"),
  );
  assert.equal(order.at(-1)[2], "published");
  assert.match(host.textContent, /publicada con sus cambios guardados/);
});
test("a failed cover save preserves the created ID and file, retry never duplicates the training or reuploads a confirmed video", async () => {
  await mount(editor());
  let covers = 0;
  const defaultFetch = global.fetch;
  fetchOverride = async (url, options) => {
    if (url === "/api/admin/training-covers" && ++covers === 1)
      return Response.json({ error: "Portada no disponible" }, { status: 503 });
    fetchOverride = undefined;
    const response = await defaultFetch(url, options);
    fetchOverride = handler;
    return response;
  };
  const handler = fetchOverride;
  await type(host.querySelector('[name="title"]'), "Capacitación nueva");
  await choose(
    "Seleccionar video",
    new File(["video"], "qa.mp4", { type: "video/mp4" }),
  );
  await choose(
    "Seleccionar portada",
    new File(["image"], "qa.png", { type: "image/png" }),
  );
  await click(saveButton());
  await flush();
  assert.equal(saved.length, 0);
  assert.match(
    host.querySelector('[role="alert"]').textContent,
    /Portada no disponible/,
  );
  assert.match(host.textContent, /qa.png/);
  await click(saveButton());
  await flush();
  assert.equal(saved.length, 1);
  assert.equal(uploads, 1);
  assert.equal(calls.filter((c) => c[0] === "save" && c[1] === "").length, 1);
});
test("editing opens the actual lateral dialog immediately; failed association read offers retry and preserves typed fields", async () => {
  await mount(
    h(TrainingAdmin, {
      trainings: [training],
      listRows: [training],
      selectedId: "",
      controls: null,
      pager: null,
      products: [],
      categories: [],
      productLinks: [],
      categoryLinks: [],
      ratings: {
        stats: [],
        overview: { average_rating: null, rating_count: 0, rated_trainings: 0 },
      },
      publicCatalogConnected: true,
      limitedRecords: false,
    }),
  );
  fetchOverride = async () =>
    Response.json({ error: "Carga no disponible" }, { status: 503 });
  await click(host.querySelector(`[id='edit-training-${id}']`));
  assert.ok(host.querySelector("dialog").open);
  assert.equal(host.querySelector('[name="title"]').value, training.title);
  await type(host.querySelector('[name="title"]'), "Edición conservada");
  assert.match(host.textContent, /Carga no disponible/);
  fetchOverride = undefined;
  await click(
    [...host.querySelectorAll("button")].find(
      (n) => n.textContent === "Reintentar",
    ),
  );
  await flush();
  assert.equal(
    host.querySelector('[name="title"]').value,
    "Edición conservada",
  );
  assert.equal(refreshes, 0);
  assert.ok(window.location.search.includes(id));
});
test("YouTube embeds wait for explicit play and use the privacy host", async () => {
  await mount(
    h(TrainingVideo, {
      url: "https://youtu.be/aqz-KE-bpKQ",
      title: "Video de uso",
    }),
  );
  assert.equal(host.querySelector("iframe"), null);
  await click(host.querySelector("button"));
  assert.equal(
    host.querySelector("iframe").getAttribute("src"),
    "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1",
  );
});

test("new training retains the same editor, selected files and upload signal while its created ID and associations are loading", async () => {
  await mount(
    h(
      React.StrictMode,
      null,
      h(TrainingAdmin, {
        trainings: [],
        listRows: [],
        selectedId: "",
        controls: null,
        pager: null,
        products: [],
        categories: [],
        productLinks: [],
        categoryLinks: [],
        ratings: null,
        publicCatalogConnected: true,
        limitedRecords: false,
      }),
    ),
  );
  let finishRead, finishUpload, uploadSignal;
  fetchOverride = async (url, options) => {
    if (url.startsWith("/api/admin/trainings/"))
      return new Promise((resolve) => {
        finishRead = resolve;
      });
    if (url === "/api/admin/training-videos" && options.method === "POST")
      return Response.json(
        {
          endpoint:
            "https://example.supabase.co/storage/v1/upload/resumable/sign",
          token: "qa",
          path,
        },
        { status: 201 },
      );
    if (url === "/api/admin/training-videos" && options.method === "PUT") {
      calls.push(["confirm"]);
      return Response.json({ status: "recorded", path });
    }
    if (url === "/api/admin/training-covers")
      return Response.json(
        {
          status: "recorded",
          coverPath: id + "/33333333-3333-4333-8333-333333333333.png",
        },
        { status: 201 },
      );
    return Response.json({ status: "removed" });
  };
  uploadOverride = (signal) => {
    uploadSignal = signal;
    return new Promise((resolve, reject) => {
      finishUpload = resolve;
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  };
  await click(host.querySelector("#new-training"));
  await type(
    host.querySelector('[name="title"]'),
    "Nueva capacitación con archivos",
  );
  await choose(
    "Seleccionar video",
    new File(["video"], "nueva.mp4", { type: "video/mp4" }),
  );
  await choose(
    "Seleccionar portada",
    new File(["image"], "nueva.png", { type: "image/png" }),
  );
  const originalForm = host.querySelector("dialog form");
  await click(saveButton());
  await flush();
  assert.ok(uploadSignal, "the upload has started");
  assert.equal(
    uploadSignal.aborted,
    false,
    "changing new to a persisted ID must not abort the upload",
  );
  assert.equal(
    host.querySelector("dialog form"),
    originalForm,
    "keep the mounted editor before associations respond",
  );
  assert.ok(window.location.search.includes(id));
  assert.match(host.textContent, /nueva.png/);
  await act(async () =>
    finishRead(
      Response.json({
        training,
        products: [],
        categories: [],
        productLinks: [],
        categoryLinks: [],
      }),
    ),
  );
  assert.equal(host.querySelector("dialog form"), originalForm);
  assert.equal(
    host.querySelector('[name="title"]').value,
    "Nueva capacitación con archivos",
  );
  await act(async () => finishUpload());
  await flush();
  assert.equal(uploads, 1);
  assert.equal(calls.filter((c) => c[0] === "confirm").length, 1);
  assert.equal(
    calls.filter((c) => c[0] === "/api/admin/training-covers").length,
    1,
  );
  assert.equal(calls.filter((c) => c[0] === "save" && c[1] === "").length, 1);
  assert.match(
    host.textContent,
    /Todos los cambios de la capacitación se guardaron/,
  );
});

const adminList = () =>
  h(TrainingAdmin, {
    trainings: [training],
    listRows: [training],
    selectedId: "",
    controls: null,
    pager: null,
    products: [],
    categories: [],
    productLinks: [],
    categoryLinks: [],
    ratings: null,
    publicCatalogConnected: true,
    limitedRecords: false,
  });
test("training deletion requires an explicit named confirmation; Cancel and Escape never call the action", async () => {
  await mount(adminList());
  const remove = () =>
    host.querySelector(`button[aria-label='Eliminar ${training.title}']`);
  await act(async () => remove().focus());
  await click(remove());
  let dialog = host.querySelector("dialog");
  assert.ok(dialog.open);
  assert.equal(dialog.getAttribute("aria-labelledby"), "catalog-delete-title");
  assert.match(dialog.textContent, new RegExp(training.title));
  assert.match(dialog.textContent, /video, su portada y las calificaciones/);
  assert.equal(document.activeElement.textContent, "Cancelar");
  assert.equal(deletions.length, 0);
  await click(
    [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancelar",
    ),
  );
  assert.equal(host.querySelector("dialog"), null);
  assert.ok(
    document.activeElement === remove(),
    "cancel restores focus to the triggering button",
  );
  assert.equal(deletions.length, 0);
  await act(async () => remove().focus());
  await click(remove());
  dialog = host.querySelector("dialog");
  await act(async () =>
    dialog.dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  assert.equal(host.querySelector("dialog"), null);
  assert.equal(deletions.length, 0);
});
test("training confirmation blocks duplicate/cancel requests while pending, then removes the row only on confirmed success", async () => {
  await mount(adminList());
  let finish;
  deleteOverride = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await click(
    host.querySelector(`button[aria-label='Eliminar ${training.title}']`),
  );
  const confirm = host.querySelector('dialog button[type="submit"]');
  await click(confirm);
  assert.equal(deletions.length, 1);
  assert.deepEqual(deletions[0], {
    id,
    expectedName: training.title,
    confirmation: "delete",
  });
  assert.ok(confirm.disabled);
  assert.ok(host.querySelector('dialog button[type="button"]').disabled);
  await click(confirm);
  await act(async () =>
    host
      .querySelector("dialog")
      .dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  assert.equal(deletions.length, 1);
  assert.ok(host.querySelector("dialog").open);
  assert.ok(host.querySelector(`[id='edit-training-${id}']`));
  await act(async () =>
    finish({
      status: "success",
      message: "Capacitación eliminada correctamente.",
    }),
  );
  assert.equal(host.querySelector("dialog"), null);
  assert.equal(host.querySelector(`[id='edit-training-${id}']`), null);
  assert.match(
    host.querySelector('[role="status"]').textContent,
    /eliminada correctamente/,
  );
  assert.equal(refreshes, 1);
  assert.equal(document.activeElement.id, "training-list-title");
});
test("training deletion error keeps the row and modal open and restores retry controls", async () => {
  await mount(adminList());
  deleteOverride = async () => ({
    status: "error",
    message: "La capacitación cambió. Actualiza la lista.",
  });
  await click(
    host.querySelector(`button[aria-label='Eliminar ${training.title}']`),
  );
  await click(host.querySelector('dialog button[type="submit"]'));
  assert.ok(host.querySelector("dialog").open);
  assert.match(
    host.querySelector('[role="alert"]').textContent,
    /capacitación cambió/,
  );
  assert.ok(host.querySelector(`[id='edit-training-${id}']`));
  assert.equal(
    host.querySelector('dialog button[type="submit"]').disabled,
    false,
  );
  assert.equal(refreshes, 0);
});
