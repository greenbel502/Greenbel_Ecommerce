import assert from "node:assert/strict";
import { test } from "node:test";
import { saveBrandChanges } from "../src/lib/brands/save-brand-changes.ts";
import { saveBrandLogo } from "../src/lib/brands/brand-logo-request.ts";
const id = "11111111-1111-4111-8111-111111111111";
const logo = id + "/22222222-2222-4222-8222-222222222222.webp";
const empty = { id: null, name: "", slug: "", active: false, logoPath: null };
const file = new File(["image"], "logo.png", { type: "image/png" });
const draft = {
  name: "Marca",
  slug: "marca",
  active: true,
  logoOperation: "upload",
  file,
};
test("un solo guardado incluye nombre, archivo y visibilidad; solo confirma el resultado completo", async () => {
  const calls = [];
  const r = await saveBrandChanges(empty, draft, {
    details: async (owner) => {
      calls.push(["details", owner]);
      return { status: "success", brandId: id, message: "" };
    },
    logo: async (owner, expected, values) => {
      calls.push(["logo", owner, expected, values.file]);
      return { ok: true, logoPath: logo };
    },
    visibility: async (owner, active) => {
      calls.push(["visibility", owner, active]);
      return { status: "success", message: "" };
    },
  });
  assert.equal(r.status, "success");
  assert.deepEqual(calls, [
    ["details", null],
    ["logo", id, null, file],
    ["visibility", id, true],
  ]);
  assert.equal(r.saved.logoPath, logo);
  assert.equal(r.saved.active, true);
});
test("un fallo de imagen conserva el ID creado; reintentar no crea otra marca ni publica antes de guardar el logo", async () => {
  let created = 0,
    activated = 0,
    images = 0;
  const deps = {
    details: async () => {
      created++;
      return { status: "success", brandId: id, message: "" };
    },
    logo: async () =>
      ++images === 1
        ? { ok: false, message: "Imagen inválida" }
        : { ok: true, logoPath: logo },
    visibility: async () => {
      activated++;
      return { status: "success", message: "" };
    },
  };
  const failed = await saveBrandChanges(empty, draft, deps);
  assert.equal(failed.status, "error");
  assert.equal(failed.saved.id, id);
  assert.equal(failed.logoCompleted, false);
  assert.equal(activated, 0);
  assert.equal(draft.file, file);
  const retry = await saveBrandChanges(failed.saved, draft, deps);
  assert.equal(retry.status, "success");
  assert.equal(created, 1);
  assert.equal(activated, 1);
});
test("si falla la visibilidad, el logo ya confirmado no se vuelve a subir al reintentar", async () => {
  let uploads = 0,
    visibility = 0;
  const deps = {
    details: async () => ({ status: "success", brandId: id, message: "" }),
    logo: async () => {
      uploads++;
      return { ok: true, logoPath: logo };
    },
    visibility: async () =>
      ++visibility === 1
        ? { status: "error", message: "Reintenta" }
        : { status: "success", message: "" },
  };
  const failed = await saveBrandChanges(empty, draft, deps);
  assert.equal(failed.logoCompleted, true);
  assert.equal(failed.saved.active, false);
  assert.equal(failed.saved.logoPath, logo);
  const retry = await saveBrandChanges(
    failed.saved,
    { ...draft, file: null, logoOperation: "keep" },
    deps,
  );
  assert.equal(retry.status, "success");
  assert.equal(uploads, 1);
});
test("una respuesta sin puntero confirmado nunca anuncia éxito ni activa la marca", async () => {
  let activated = false;
  const r = await saveBrandChanges(empty, draft, {
    details: async () => ({ status: "success", brandId: id, message: "" }),
    logo: async () => ({ ok: true }),
    visibility: async () => {
      activated = true;
      return { status: "success", message: "" };
    },
  });
  assert.equal(r.status, "error");
  assert.equal(r.uncertain, true);
  assert.equal(r.saved.logoPath, null);
  assert.equal(activated, false);
});
test("el envío del archivo usa la API protegida y verifica el puntero devuelto", async () => {
  const request = async (url, options) => {
    assert.equal(url, "/api/admin/brand-logos");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("image").name, "logo.png");
    assert.equal(options.body.get("brandId"), id);
    assert.equal(options.body.get("operation"), "upload");
    return Response.json(
      { status: "recorded", logoPath: logo },
      { status: 201 },
    );
  };
  assert.equal((await saveBrandLogo(id, null, draft, request)).logoPath, logo);
  await assert.rejects(
    () =>
      saveBrandLogo(id, null, draft, async () =>
        Response.json({ status: "recorded" }),
      ),
    /Unconfirmed/,
  );
  const stale = await saveBrandLogo(id, null, draft, async () =>
    Response.json({ error: "Recarga la marca" }, { status: 409 }),
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.uncertain, true);
});
