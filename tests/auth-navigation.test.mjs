import assert from "node:assert/strict";
import test from "node:test";
import { customerAuthDestination, googleCallbackUrl } from "../src/lib/supabase/auth-navigation.ts";

test("el retorno de cliente rechaza destinos externos, rutas administrativas y escapes", () => {
  for (const input of [undefined, null, "https://example.com", "//example.com", "/\\example.com", "/admin", "/checkout?next=https://example.com", "%2Fcheckout"]) {
    assert.equal(customerAuthDestination(input), "/cuenta");
  }
  assert.equal(customerAuthDestination("/checkout"), "/checkout");
});

test("Google conserva el puerto local de DEV y el retorno a checkout", () => {
  assert.equal(googleCallbackUrl("http://localhost:3000", "DEV", "http://localhost:3001", "/checkout"),
    "http://localhost:3001/auth/callback?next=%2Fcheckout");
  assert.equal(googleCallbackUrl("http://localhost:3000", "DEV", null, "/admin"), "http://localhost:3000/auth/callback");
  assert.equal(googleCallbackUrl("http://localhost:3000", "DEV", "http://127.0.0.1:3001", null), "http://127.0.0.1:3001/auth/callback");
});

test("un origen ajeno o malformado no puede capturar el código de autenticación", () => {
  for (const origin of ["https://attacker.example", "http://localhost.evil:3000", "http://user:password@localhost:3000", "http://localhost:3000/path", "null", "https://localhost:3000"]) {
    assert.throws(() => googleCallbackUrl("http://localhost:3000", "DEV", origin, null));
  }
  assert.throws(() => googleCallbackUrl(undefined, "DEV", null, null));
});

test("fuera de DEV solo se usa el origen configurado, sin sustituir el host", () => {
  assert.equal(googleCallbackUrl("https://shop.example", "PROD", "https://shop.example", null), "https://shop.example/auth/callback");
  assert.throws(() => googleCallbackUrl("https://shop.example", "PROD", "http://localhost:3000", null));
  assert.throws(() => googleCallbackUrl("http://localhost:3000", "PROD", "http://localhost:3001", null));
});
