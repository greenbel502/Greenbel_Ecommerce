import "server-only";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const GMAIL_BRAND_LOGO_CID = "greenbel-contact-logo";
function address(value: string) {
  if (/[\r\n\x00-\x1f\x7f]/.test(value)) throw Error("gmail_address_invalid");
  return z.email().max(254).parse(value);
}
function encodedHeader(value: string) {
  if (/[\r\n\x00-\x1f\x7f]/.test(value)) throw Error("gmail_header_invalid");
  const chunks: string[] = [];
  let current = "";
  for (const c of value) {
    if (Buffer.byteLength(current + c) > 30) {
      chunks.push(current);
      current = "";
    }
    current += c;
  }
  if (current) chunks.push(current);
  return chunks
    .map((c) => `=?UTF-8?B?${Buffer.from(c).toString("base64")}?=`)
    .join("\r\n ");
}
const base64Body = (s: string | Buffer) =>
  (typeof s === "string" ? Buffer.from(s, "utf8") : s)
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";

export type BrandedMimeInput = {
  kind: "contact" | "financing" | "verification";
  id: string;
  createdAt: string;
  sender: string;
  recipient: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachment?: { filename: string; bytes: Uint8Array };
  externalBrandImages?: boolean;
};

/** Server-only MIME composer: fixed application addresses, embedded logo and optional private PDF. */
export function buildBrandedMime(input: BrandedMimeInput): string {
  z.uuid().parse(input.id);
  address(input.sender);
  address(input.recipient);
  if (input.replyTo) address(input.replyTo);
  if (!Number.isFinite(Date.parse(input.createdAt)))
    throw Error("gmail_date_invalid");
  const subject = encodedHeader(input.subject);
  const token = input.id.replaceAll("-", "");
  const boundary = `greenbel_${input.kind}_${token}`;
  const related = `greenbel_related_${token}`;
  const mixed = `greenbel_mixed_${token}`;
  const logo = input.externalBrandImages
    ? Buffer.alloc(0)
    : readFileSync(
        join(process.cwd(), "public/images/brand/greenbel-email.png"),
      );
  const parts = input.externalBrandImages
    ? [
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        base64Body(input.text),
        `--${boundary}`,
        `Content-Type: multipart/related; boundary="${related}"; type="text/html"`,
        "",
        `--${related}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        base64Body(input.html),
        `--${related}--`,
        `--${boundary}--`,
        "",
      ]
    : [
        `--${related}`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        base64Body(input.text),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        base64Body(input.html),
        `--${boundary}--`,
        `--${related}`,
        'Content-Type: image/png; name="greenbel.png"',
        `Content-ID: <${GMAIL_BRAND_LOGO_CID}>`,
        'Content-Disposition: inline; filename="greenbel.png"',
        "Content-Transfer-Encoding: base64",
        "",
        base64Body(logo),
        `--${related}--`,
        "",
      ];
  if (input.attachment) {
    const { filename, bytes } = input.attachment;
    if (
      !/^[A-Za-z0-9_-]{1,96}\.pdf$/.test(filename) ||
      bytes.byteLength < 5 ||
      bytes.byteLength > 8 * 1024 * 1024 ||
      Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-"
    )
      throw Error("gmail_attachment_invalid");
    parts.unshift(
      `--${mixed}`,
      `Content-Type: multipart/${input.externalBrandImages ? "alternative" : "related"}; boundary="${input.externalBrandImages ? boundary : related}"`,
      "",
    );
    parts.push(
      `--${mixed}`,
      `Content-Type: application/pdf; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Body(Buffer.from(bytes)),
      `--${mixed}--`,
      "",
    );
  }
  return [
    `From: GreenBel <${input.sender}>`,
    `To: <${input.recipient}>`,
    ...(input.replyTo ? [`Reply-To: <${input.replyTo}>`] : []),
    `Subject: ${subject}`,
    `Date: ${new Date(input.createdAt).toUTCString()}`,
    `Message-ID: <${input.kind}-${input.id}@greenbel.gt>`,
    `${input.kind === "contact" ? "X-GreenBel-Consulta-ID" : "X-GreenBel-Referencia-ID"}: ${input.id}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/${input.attachment ? "mixed" : input.externalBrandImages ? "alternative" : "related"}; boundary="${input.attachment ? mixed : input.externalBrandImages ? boundary : related}"`,
    "",
    ...parts,
  ].join("\r\n");
}
