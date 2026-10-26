import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** AES-GCM includes context so ciphertext cannot be moved between accounts/environments/purposes. */
export function seal(value: string, key: Buffer, context: string): string {
  if (key.length !== 32 || !value || value.length > 12000)
    throw Error("gmail_cipher_input");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function unseal(value: string, key: Buffer, context: string): string {
  if (key.length !== 32 || value.length > 18000)
    throw Error("gmail_cipher_invalid");
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    parts.slice(1).some((p) => !/^[A-Za-z0-9_-]+$/.test(p))
  )
    throw Error("gmail_cipher_invalid");
  const iv = Buffer.from(parts[1], "base64url"),
    tag = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || tag.length !== 16)
    throw Error("gmail_cipher_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
export function sameSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
