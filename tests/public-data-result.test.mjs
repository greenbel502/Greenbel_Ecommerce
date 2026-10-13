import assert from "node:assert/strict";
import test from "node:test";
import { PublicDataUnavailableError, readPublicData } from "../src/lib/server/public-data-result.ts";

test("una caída del servicio no se convierte en un catálogo vacío ni recurso ausente", async () => {
  assert.deepEqual(await readPublicData(async () => {
    throw new PublicDataUnavailableError("Fallo de conexión de prueba");
  }), { status: "unavailable" });
  assert.deepEqual(await readPublicData(async () => []), { status: "available", data: [] });
  assert.deepEqual(await readPublicData(async () => null), { status: "available", data: null });
});

test("los errores inesperados y señales de navegación se conservan para su frontera", async () => {
  for (const error of [new TypeError("Error de código de prueba"), { digest: "NEXT_NOT_FOUND" }]) {
    await assert.rejects(readPublicData(async () => { throw error; }), (actual) => actual === error);
  }
});

test("reintentar consulta otra vez y recupera los datos sin conservar la caída", async () => {
  let available = false;
  const read = async () => {
    if (!available) throw new PublicDataUnavailableError();
    return [{ id: "producto-ficticio" }];
  };
  assert.deepEqual(await readPublicData(read), { status: "unavailable" });
  available = true;
  assert.deepEqual(await readPublicData(read), { status: "available", data: [{ id: "producto-ficticio" }] });
});
