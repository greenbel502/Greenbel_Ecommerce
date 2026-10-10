import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Local, server-controlled DEV tool. Never import into a browser or route.
// node --env-file=.env scripts/dev-simulated-payment.mjs start ORDER_ID [ATTEMPT_KEY]
// node --env-file=.env scripts/dev-simulated-payment.mjs event PAYMENT_ID success|rejected|expired [EVENT_KEY]
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [command, subject, outcomeOrKey, optionalKey] = process.argv.slice(2);
const validStart = command === "start" && uuid.test(subject ?? "")
  && (!outcomeOrKey || uuid.test(outcomeOrKey)) && !optionalKey;
const validEvent = command === "event" && uuid.test(subject ?? "")
  && ["success", "rejected", "expired"].includes(outcomeOrKey)
  && (!optionalKey || uuid.test(optionalKey));
if (!validStart && !validEvent) {
  console.error("Uso: start ORDER_ID [ATTEMPT_KEY] | event PAYMENT_ID success|rejected|expired [EVENT_KEY]");
  process.exit(2);
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim() ?? "";
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim() ?? "";
let validTarget = process.env.APP_ENV === "DEV" && /^[a-z0-9-]{3,64}$/.test(ref) && Boolean(secret);
try {
  const url = new URL(process.env.DEV_SUPABASE_URL ?? "");
  validTarget = validTarget && url.protocol === "https:"
    && url.hostname === `${ref}.supabase.co`
    && !url.username && !url.password && url.pathname === "/";
} catch {
  validTarget = false;
}
const link = resolve("supabase/.temp/project-ref");
validTarget = validTarget && existsSync(link)
  && readFileSync(link, "utf8").trim() === ref;
if (!validTarget) {
  console.error("FAIL: APP_ENV, URL, referencia, enlace real DEV o clave servidor DEV no son válidos.");
  process.exit(2);
}

const key = command === "start" ? outcomeOrKey ?? randomUUID() : optionalKey ?? randomUUID();
// Print only the non-secret operation key before the call. Reuse it if the
// transport result is uncertain; a fresh key could duplicate the event.
console.log(`Clave de reintento PRUEBA DEV: ${key}`);

const client = createClient(process.env.DEV_SUPABASE_URL, secret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const rpc = command === "start"
  ? ["create_dev_online_payment_attempt", { p_order_id: subject, p_idempotency_key: key }]
  : ["record_dev_online_payment_event", {
      p_payment_id: subject,
      p_event_key: key,
      p_outcome: outcomeOrKey,
      p_evidence_reference: `PRUEBA DEV:${key}`
    }];

try {
  const { data, error } = await client.rpc(rpc[0], rpc[1]);
  if (error) {
    console.error(`FAIL: RPC DEV devolvió código ${error.code ?? "desconocido"}.`);
    process.exitCode = 1;
  } else if (!data || data.simulated !== true) {
    console.error("FAIL: respuesta sin marca de simulación DEV; revisa el pedido antes de reintentar.");
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(data));
  }
} catch {
  console.error("NO EJECUTADO: resultado de transporte incierto; reintenta con la misma clave.");
  process.exitCode = 1;
}
