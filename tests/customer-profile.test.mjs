import assert from "node:assert/strict";
import test from "node:test";
import { customerProfileSchema, googleAvatarUrl, googleDisplayName } from "../src/domain/account/profile.ts";
import { isTrustedAppOrigin } from "../src/lib/http/trusted-app-origin.ts";

test("datos del perfil limitados a nombre, teléfono y dirección válidos", () => {
  assert.deepEqual(customerProfileSchema.parse({ displayName: " PRUEBA DEV Ana Pérez ", phone: " +502 5555-0101 ", addressLine: " " }),
    { displayName: "PRUEBA DEV Ana Pérez", phone: "+502 5555-0101", addressLine: "" });
  for (const extra of [{ displayName: "" }, { phone: "123" }, { addressLine: "1234" }, { addressLine: "a".repeat(501) }, { active: true }, { role: "admin" }, { userId: "ajeno" }]) {
    assert.equal(customerProfileSchema.safeParse({ displayName: "PRUEBA DEV", phone: "", addressLine: "", ...extra }).success, false);
  }
});

test("foto Google solo admite HTTPS y hosts del proveedor, nunca URLs arbitrarias", () => {
  assert.equal(googleAvatarUrl({ avatar_url: "https://lh3.googleusercontent.com/a/example" }), "https://lh3.googleusercontent.com/a/example");
  for (const url of ["javascript:alert(1)", "http://127.0.0.1/private", "https://googleusercontent.com.evil.example/a", "https://evil.example/googleusercontent.com", "data:image/svg+xml,test", "https://user:secret@lh3.googleusercontent.com/a"]) {
    assert.equal(googleAvatarUrl({ avatar_url: url }), null);
  }
  assert.equal(googleDisplayName({ full_name: 123 }), "");
});

test("el origen de subida admite el puerto DEV actual y rechaza otros sitios", () => {
  const request = origin => new Request("http://localhost:3001/api/account/avatar", { headers: origin ? { Origin: origin } : {} });
  assert.equal(isTrustedAppOrigin(request("http://localhost:3001"), "http://localhost:3000", "DEV"), true);
  for (const origin of [null, "https://evil.example", "http://localhost.evil:3001", "http://localhost:3001/path"]) {
    assert.equal(isTrustedAppOrigin(request(origin), "http://localhost:3000", "DEV"), false);
  }
  assert.equal(isTrustedAppOrigin(request("http://localhost:3001"), "https://shop.example", "PROD"), false);
});
