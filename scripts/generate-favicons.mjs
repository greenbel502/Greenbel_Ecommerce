/** Rebuild favicon assets from the original, unchanged GreenBel symbol. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const artwork = await fs.readFile(
  path.join(publicDir, "images/brand/greenbel-horizontal.svg"),
  "utf8",
);
const symbol = artwork.match(/<path\b[^>]*\/>/)?.[0];
if (!symbol?.includes('fill="#80BA01"')) {
  throw new Error("The official GreenBel symbol could not be found.");
}

// The symbol occupies x429–638/y719–914 in the original artwork. This square
// keeps its proportions and leaves clear space, without including the wordmark.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="405 688 256 256" width="256" height="256"><title>GreenBel</title>${symbol}</svg>\n`;
const source = Buffer.from(svg);
await fs.writeFile(path.join(publicDir, "favicon.svg"), svg);
await sharp(source).resize(96, 96).png().toFile(path.join(publicDir, "favicon-96x96.png"));
await sharp(source)
  .resize(180, 180)
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(path.join(publicDir, "apple-touch-icon.png"));

// ICO directory with PNG-encoded sizes; no additional converter dependency.
const sizes = [16, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size === 256 ? 0 : size;
  header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await fs.writeFile(path.join(publicDir, "favicon.ico"), Buffer.concat([header, ...images]));
console.log("Generated GreenBel SVG, PNG96, Apple180 and ICO16/32/48/64/128/256.");
