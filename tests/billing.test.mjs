import assert from "node:assert/strict";
import test from "node:test";
import { billingSchema, buildBillingSnapshot } from "../src/domain/checkout/billing.ts";

test("CF exige nombre, apellido y teléfono sin exigir NIT ni correo", () => {
  const billing = billingSchema.parse({ kind: "cf", firstName: "Ana", lastName: "Pérez", phone: "5555 5555" });
  assert.deepEqual(billing, { kind: "cf", firstName: "Ana", lastName: "Pérez", phone: "5555 5555" });
  assert.equal(billingSchema.safeParse({ kind: "cf", firstName: "Ana", phone: "5555 5555" }).success, false);
});

test("factura con NIT exige titular, nombre completo y teléfono; correo es opcional", () => {
  const base = { kind: "nit", nit: "1234567-8", nitOwnerName: "Comercial Ejemplo", fullName: "Ana Pérez", phone: "+502 5555 5555" };
  assert.equal(billingSchema.safeParse(base).success, true);
  assert.equal(billingSchema.safeParse({ ...base, email: "" }).success, true);
  assert.equal(billingSchema.safeParse({ ...base, email: "ana@example.com" }).success, true);
  assert.equal(billingSchema.safeParse({ ...base, nitOwnerName: "" }).success, false);
  assert.equal(billingSchema.safeParse({ ...base, email: "no-es-correo" }).success, false);
});

test("snapshot CF coincide con el contrato SQL y rechaza campos extra", () => {
  assert.deepEqual(buildBillingSnapshot({ kind: "cf", firstName: " Ana ", lastName: " Pérez ", phone: "5555 5555" }), {
    schema_version: 1,
    type: "cf",
    first_name: "Ana",
    last_name: "Pérez",
    phone: "5555 5555"
  });
  assert.equal(billingSchema.safeParse({ kind: "cf", firstName: "Ana", lastName: "Pérez", phone: "5555 5555", total: "0.00" }).success, false);
});

test("snapshot NIT omite correo vacío y conserva correo opcional", () => {
  const base = { kind: "nit", nit: " 1234567-8 ", nitOwnerName: " Comercial DEV ", fullName: " Ana Pérez ", phone: "5555 5555" };
  const withoutEmail = buildBillingSnapshot({ ...base, email: "" });
  assert.deepEqual(withoutEmail, {
    schema_version: 1,
    type: "nit",
    nit: "1234567-8",
    nit_holder_name: "Comercial DEV",
    full_name: "Ana Pérez",
    phone: "5555 5555"
  });
  assert.deepEqual(buildBillingSnapshot({ ...base, email: " dev@example.com " }), {
    ...withoutEmail,
    email: "dev@example.com"
  });
  assert.equal(billingSchema.safeParse({ ...base, fullName: "x".repeat(241) }).success, false);
});
