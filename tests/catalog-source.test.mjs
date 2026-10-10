import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseSupabaseCatalog } from "../src/lib/server/catalog-source.ts";

test("los datos ficticios nunca se activan fuera de DEV", () => {
  assert.equal(shouldUseSupabaseCatalog({ APP_ENV: "DEV" }), false);
  assert.equal(shouldUseSupabaseCatalog({ APP_ENV: "DEV", DEV_SUPABASE_URL: "https://dev.example", DEV_SUPABASE_PUBLISHABLE_KEY: "test" }), true);
  assert.equal(shouldUseSupabaseCatalog({ APP_ENV: "DEV", DEV_SUPABASE_URL: "https://dev.example", DEV_SUPABASE_PUBLISHABLE_KEY: "test", GREENBEL_CATALOG_SOURCE: "mock" }), false);
  assert.equal(shouldUseSupabaseCatalog({ APP_ENV: "DEV", GREENBEL_CATALOG_SOURCE: "supabase" }), true);
  assert.equal(shouldUseSupabaseCatalog({ APP_ENV: "PROD" }), true);
  assert.throws(() => shouldUseSupabaseCatalog({ APP_ENV: "PROD", GREENBEL_CATALOG_SOURCE: "mock" }));
  assert.throws(() => shouldUseSupabaseCatalog({ APP_ENV: "DEMO" }));
});
