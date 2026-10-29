import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Module = require("module"),
  original = Module._load;
require.extensions[".ts"] = (module, path) =>
  module._compile(
    ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    path,
  );

const locationId = "11111111-1111-4111-8111-111111111111";
const contactId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const revision = "2026-10-29T12:00:00.000Z";
const location = {
  id: locationId,
  company: "greenbel",
  name: "Sede de prueba local",
  department: "guatemala",
  address: "Dirección de prueba local, Guatemala",
  hours: "Lunes a viernes, 8:00–17:00",
  latitude: 14.6349,
  longitude: -90.5069,
  mapsUrl: null,
  active: true,
  sortOrder: 0,
};
const contact = {
  id: contactId,
  company: "greenbel",
  kind: "email",
  label: "Prueba local",
  value: "contacto@example.invalid",
  primary: true,
};
let current,
  unauthorized,
  concurrentChange,
  writes,
  reads,
  invalidations,
  authRoles;

Module._load = function (request, parent, main) {
  if (request === "next/cache")
    return { revalidatePath: (...args) => invalidations.push(args) };
  if (request === "@/lib/server/staff-authorization")
    return {
      requireStaffActor: async (roles) => {
        authRoles.push(roles);
        if (unauthorized) throw Error("PRIVATE auth failure");
        return { userId: actorId };
      },
    };
  if (request === "@/lib/server/contact-settings")
    return {
      readContactSettings: async () => {
        reads++;
        return structuredClone(current);
      },
    };
  if (request === "@/lib/supabase/admin")
    return {
      createSupabaseAdminClient: () => ({
        from: (table) => {
          assert.equal(table, "site_content");
          let payload, mode;
          const filters = new Map();
          const query = {
            insert(value) {
              mode = "insert";
              payload = value;
              return query;
            },
            update(value) {
              mode = "update";
              payload = value;
              return query;
            },
            eq(key, value) {
              filters.set(key, value);
              return query;
            },
            select(value) {
              assert.equal(value, "updated_at");
              return query;
            },
            async maybeSingle() {
              writes.push({ payload: structuredClone(payload), filters, mode });
              if (
                concurrentChange ||
                (mode === "update" &&
                  filters.get("updated_at") !== current.revision)
              )
                return { data: null, error: null };
              if (mode === "insert") assert.equal(payload.key, "contact");
              else assert.equal(filters.get("key"), "contact");
              assert.equal(payload.edited_by, actorId);
              assert.equal(payload.publication_status, "draft");
              current = {
                contacts: structuredClone(payload.payload),
                revision: "2026-10-29T12:00:01.000Z",
              };
              return { data: { updated_at: current.revision }, error: null };
            },
          };
          return query;
        },
      }),
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
  contactsPayloadSchema,
  publicGreenbelContacts,
  EMPTY_CONTACTS,
} = require("../src/lib/contacts/model.ts");
const {
  DEPARTMENTS,
  isGoogleMapsUrl,
  locationEntrySchema,
  saveLocationSchema,
  publicLocations,
  locationMapsHref,
} = require("../src/lib/contacts/locations.ts");
const {
  saveLocationAction,
  deleteLocationAction,
  saveContactAction,
  deleteContactAction,
} = require("../src/app/admin/contacto/actions.ts");
const saveInput = (overrides = {}) => {
  const fields = { ...location };
  delete fields.id;
  return { ...fields, revision, ...overrides };
};

beforeEach(() => {
  current = {
    revision,
    contacts: {
      version: 1,
      entries: [structuredClone(contact)],
      locations: [structuredClone(location)],
    },
  };
  unauthorized = false;
  concurrentChange = false;
  writes = [];
  reads = 0;
  invalidations = [];
  authRoles = [];
});

test("legacy contact payloads use only the 11 reference departments authorized by the user", () => {
  const parsed = contactsPayloadSchema.parse({
    version: 1,
    entries: [contact],
  });
  assert.equal(parsed.locations.length, 11);
  assert.deepEqual(
    parsed.locations
      .filter((entry) => entry.company === "greenbel")
      .map((entry) => entry.department)
      .sort(),
    ["escuintla", "guatemala", "jutiapa", "quetzaltenango"],
  );
  assert.deepEqual(
    parsed.locations
      .filter((entry) => entry.company === "cooperative")
      .map((entry) => entry.department)
      .sort(),
    [
      "chimaltenango",
      "guatemala",
      "huehuetenango",
      "quetzaltenango",
      "quiche",
      "solola",
      "totonicapan",
    ],
  );
  assert.equal(new Set(parsed.locations.map((entry) => entry.id)).size, 11);
  for (const entry of parsed.locations) {
    assert.equal(entry.address, "");
    assert.equal(entry.latitude, null);
    assert.equal(entry.longitude, null);
    assert.equal(entry.mapsUrl, null);
    assert.equal(entry.hours, "");
  }
  assert.deepEqual(EMPTY_CONTACTS.locations, parsed.locations);
  assert.deepEqual(parsed.entries, [contact]);
  assert.deepEqual(publicGreenbelContacts(parsed), {
    whatsappNumber: null,
    email: contact.value,
  });
  assert.equal(DEPARTMENTS.length, 22);
  assert.equal(new Set(DEPARTMENTS.map((entry) => entry.id)).size, 22);
});

test("explicitly stored empty locations stay empty instead of reappearing after deletion", () => {
  assert.deepEqual(
    contactsPayloadSchema.parse({
      version: 1,
      entries: [contact],
      locations: [],
    }).locations,
    [],
  );
});

test("defaults are fresh copies and cannot be changed by editing an earlier parsed payload", () => {
  const first = contactsPayloadSchema.parse({ version: 1, entries: [] });
  first.locations[0].name = "Changed only in the test";
  first.locations.pop();
  const second = contactsPayloadSchema.parse({ version: 1, entries: [] });
  assert.equal(second.locations.length, 11);
  assert.equal(second.locations[0].name, "Guatemala");
  assert.equal(EMPTY_CONTACTS.locations[0].name, "Guatemala");
});

test("only configured active locations of the requested organization are public, in stable display order", () => {
  const source = [
    location,
    {
      ...location,
      id: "44444444-4444-4444-8444-444444444444",
      name: "Agencia aliada",
      company: "cooperative",
    },
    {
      ...location,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Oculta",
      active: false,
    },
    {
      ...location,
      id: "66666666-6666-4666-8666-666666666666",
      name: "Primera",
      sortOrder: 0,
    },
    {
      ...location,
      id: "77777777-7777-4777-8777-777777777777",
      name: "Última",
      sortOrder: 10,
    },
  ];
  const copy = structuredClone(source);
  const result = publicLocations(source, "greenbel");
  assert.deepEqual(
    result.map((item) => item.name),
    ["Primera", "Sede de prueba local", "Última"],
  );
  assert.equal(
    result.some((item) => "active" in item || "sortOrder" in item),
    false,
  );
  assert.deepEqual(
    publicLocations(source, "cooperative").map((item) => item.name),
    ["Agencia aliada"],
  );
  assert.deepEqual(source, copy);
});

test("location validation rejects unpaired/out-of-range coordinates, unknown departments, fields and invalid lengths", () => {
  assert.equal(
    locationEntrySchema.safeParse({
      ...location,
      address: "",
      latitude: null,
      longitude: null,
    }).success,
    true,
  );
  assert.equal(
    locationEntrySchema.safeParse({
      ...location,
      latitude: null,
      longitude: null,
    }).success,
    true,
  );
  for (const changed of [
    { latitude: null },
    { longitude: null },
    { latitude: 90 },
    { longitude: -180 },
    { latitude: NaN },
    { longitude: Infinity },
    { department: "inventado" },
    { name: " " },
    { address: "x" },
    { hours: "x".repeat(181) },
    { active: "true" },
    { sortOrder: -1 },
    { sortOrder: 1.5 },
    { sortOrder: 1000 },
    { role: "admin" },
    { company: "other" },
  ])
    assert.equal(
      locationEntrySchema.safeParse({ ...location, ...changed }).success,
      false,
      JSON.stringify(changed),
    );
  assert.equal(
    saveLocationSchema.safeParse(saveInput({ secret: "no" })).success,
    false,
  );
});

test("map links only accept secure Google Maps URLs, blocking script URLs, credentials and lookalike hosts", () => {
  for (const url of [
    "https://www.google.com/maps/place/Guatemala",
    "https://google.com/maps?q=Guatemala",
    "https://maps.google.com/?q=Guatemala",
    "https://maps.app.goo.gl/example",
    "https://goo.gl/maps/example",
  ])
    assert.equal(isGoogleMapsUrl(url), true, url);
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://google.com/maps",
    "https://google.com.evil.invalid/maps",
    "https://google.com@evil.invalid/maps",
    "https://user:secret@google.com/maps",
    "https://google.com:8443/maps",
    "https://evil.invalid/",
    "https://google.com/url?q=https://evil.invalid",
    "https://goo.gl/unrelated",
    "https://maps.app.goo.gl/",
  ])
    assert.equal(isGoogleMapsUrl(url), false, url);
  assert.equal(
    locationEntrySchema.safeParse({
      ...location,
      mapsUrl: "https://evil.invalid",
    }).success,
    false,
  );
});

test("Google Maps fallback encodes configured coordinates or address rather than interpolating a new URL", () => {
  assert.equal(
    new URL(locationMapsHref(location)).searchParams.get("query"),
    "14.6349,-90.5069",
  );
  const result = locationMapsHref({
    ...location,
    latitude: null,
    longitude: null,
    address: "Calle & acceso #1",
  });
  assert.equal(new URL(result).origin, "https://www.google.com");
  assert.equal(
    new URL(result).searchParams.get("query"),
    "Calle & acceso #1, Guatemala, Guatemala",
  );
  const departmentOnly = locationMapsHref({
    ...location,
    latitude: null,
    longitude: null,
    address: "",
    department: "quetzaltenango",
  });
  assert.equal(
    new URL(departmentOnly).searchParams.get("query"),
    "Quetzaltenango, Guatemala",
  );
  assert.equal(
    locationMapsHref({
      ...location,
      mapsUrl: "https://maps.app.goo.gl/example",
    }),
    "https://maps.app.goo.gl/example",
  );
});

test("repeated location IDs or same-company name/address duplicates are rejected, across companies are distinct", () => {
  const payload = { version: 1, entries: [contact] };
  assert.equal(
    contactsPayloadSchema.safeParse({
      ...payload,
      locations: [location, location],
    }).success,
    false,
  );
  const second = {
    ...location,
    id: "44444444-4444-4444-8444-444444444444",
    name: location.name.toUpperCase(),
  };
  assert.equal(
    contactsPayloadSchema.safeParse({
      ...payload,
      locations: [location, second],
    }).success,
    false,
  );
  assert.equal(
    contactsPayloadSchema.safeParse({
      ...payload,
      locations: [location, { ...second, company: "cooperative" }],
    }).success,
    true,
  );
});

test("saving and deleting a location preserve all contact entries and the other organization's locations", async () => {
  const saved = await saveLocationAction(
    saveInput({ company: "cooperative", name: "Agencia local de prueba" }),
  );
  assert.equal(saved.status, "success");
  assert.deepEqual(current.contacts.entries, [contact]);
  assert.equal(current.contacts.locations.length, 2);
  assert.deepEqual(current.contacts.locations[0], location);
  const added = current.contacts.locations.find(
    (entry) => entry.company === "cooperative",
  );
  assert.match(added.id, /^[0-9a-f-]{36}$/);
  const deleted = await deleteLocationAction({
    id: added.id,
    revision: current.revision,
    confirmation: "delete",
  });
  assert.equal(deleted.status, "success");
  assert.deepEqual(current.contacts.entries, [contact]);
  assert.deepEqual(current.contacts.locations, [location]);
  assert.ok(invalidations.some((args) => args[0] === "/contacto"));
  assert.ok(invalidations.some((args) => args[0] === "/financiamiento"));
  assert.ok(
    authRoles.every((roles) => roles.length === 1 && roles[0] === "admin"),
  );
});

test("editing or deleting phone/email contacts preserves configured locations", async () => {
  const result = await saveContactAction({
    ...contact,
    value: "updated@example.invalid",
    revision,
  });
  assert.equal(result.status, "success");
  assert.deepEqual(current.contacts.locations, [location]);
  const deleted = await deleteContactAction({
    id: contact.id,
    revision: current.revision,
    confirmation: "delete",
  });
  assert.equal(deleted.status, "success");
  assert.deepEqual(current.contacts.entries, []);
  assert.deepEqual(current.contacts.locations, [location]);
});

test("deleting the last location explicitly persists [] and does not restore the reference defaults", async () => {
  const result = await deleteLocationAction({
    id: locationId,
    revision,
    confirmation: "delete",
  });
  assert.equal(result.status, "success");
  assert.deepEqual(current.contacts.locations, []);
  assert.deepEqual(contactsPayloadSchema.parse(current.contacts).locations, []);
  assert.deepEqual(current.contacts.entries, [contact]);
});

test("all valid location mutations require administrator authorization before reading or writing settings", async () => {
  unauthorized = true;
  for (const action of [
    () => saveLocationAction(saveInput()),
    () =>
      deleteLocationAction({
        id: locationId,
        revision,
        confirmation: "delete",
      }),
  ]) {
    const result = await action();
    assert.equal(result.status, "error");
    assert.equal(result.message.includes("PRIVATE"), false);
  }
  assert.equal(reads, 0);
  assert.equal(writes.length, 0);
  assert.deepEqual(authRoles, [["admin"], ["admin"]]);
});

test("stale revisions, missing records, organization reassignment and unconfirmed deletions never write", async () => {
  for (const data of [
    saveInput({ revision: "2026-10-28T12:00:00.000Z" }),
    saveInput({ id: "88888888-8888-4888-8888-888888888888" }),
    saveInput({ id: locationId, company: "cooperative" }),
  ])
    assert.equal((await saveLocationAction(data)).status, "error");
  for (const data of [
    { id: locationId, revision, confirmation: false },
    {
      id: locationId,
      revision: "2026-10-28T12:00:00.000Z",
      confirmation: "delete",
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      revision,
      confirmation: "delete",
    },
  ])
    assert.equal((await deleteLocationAction(data)).status, "error");
  assert.equal(writes.length, 0);
});

test("concurrent updates use an atomic revision condition and return conflict instead of success", async () => {
  const initial = structuredClone(current);
  concurrentChange = true;
  const result = await saveLocationAction(
    saveInput({ id: locationId, name: "Nombre revisado" }),
  );
  assert.equal(result.status, "error");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filters.get("updated_at"), revision);
  assert.deepEqual(current, initial);
  assert.deepEqual(invalidations, []);
});

test("first location can initialize the existing contact CMS key without fabricating contacts", async () => {
  current = {
    revision: null,
    contacts: { version: 1, entries: [], locations: [] },
  };
  const result = await saveLocationAction(saveInput({ revision: null }));
  assert.equal(result.status, "success");
  assert.equal(writes[0].mode, "insert");
  assert.equal(writes[0].payload.key, "contact");
  assert.deepEqual(current.contacts.entries, []);
  assert.equal(current.contacts.locations.length, 1);
});

test("first deletion persists the remaining reference locations without fabricating contacts", async () => {
  current = { revision: null, contacts: structuredClone(EMPTY_CONTACTS) };
  const initial = structuredClone(current.contacts);
  const removed = initial.locations[0];
  const result = await deleteLocationAction({
    id: removed.id,
    revision: null,
    confirmation: "delete",
  });
  assert.equal(result.status, "success");
  assert.deepEqual(authRoles, [["admin"]]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].mode, "insert");
  assert.equal(writes[0].payload.key, "contact");
  assert.deepEqual(current.contacts.entries, initial.entries);
  assert.deepEqual(
    current.contacts.locations,
    initial.locations.filter((entry) => entry.id !== removed.id),
  );
  assert.ok(invalidations.some((args) => args[0] === "/contacto"));
  assert.ok(invalidations.some((args) => args[0] === "/financiamiento"));
});

test("a null deletion revision cannot overwrite settings that already exist", async () => {
  const initial = structuredClone(current);
  const result = await deleteLocationAction({
    id: locationId,
    revision: null,
    confirmation: "delete",
  });
  assert.equal(result.status, "error");
  assert.deepEqual(authRoles, [["admin"]]);
  assert.equal(writes.length, 0);
  assert.deepEqual(current, initial);
  assert.deepEqual(invalidations, []);
});
