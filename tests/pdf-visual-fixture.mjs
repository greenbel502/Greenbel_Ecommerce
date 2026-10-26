import { readFileSync } from "node:fs";
const png = readFileSync(new URL("../public/images/brand/greenbel-email.png", import.meta.url));
export const pdfVisuals = {
  logo: { dataUrl: "data:image/png;base64," + png.toString("base64"), width: 552, height: 104 },
  placeholder: { dataUrl: "data:image/png;base64," + png.toString("base64"), width: 552, height: 104 },
  products: new Map(),
  fonts: Object.fromEntries([['regular','poppins-regular.ttf'],['semibold','poppins-semibold.ttf'],['display','manrope-heavy.ttf']].map(([key,file]) => [key, readFileSync(new URL("../src/lib/pdf/fonts/"+file, import.meta.url)).toString("base64")])),
};
