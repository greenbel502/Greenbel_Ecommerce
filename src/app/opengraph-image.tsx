import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt =
  "GreenBel · Productos agrícolas, equipos y repuestos en Guatemala";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [logo, font] = await Promise.all([
    readFile(join(process.cwd(), "public/images/brand/greenbel-email.png")),
    readFile(
      join(
        process.cwd(),
        "node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff",
      ),
    ),
  ]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "62px 76px",
        background: "#E7E7CF",
        color: "#1E3A1F",
        fontFamily: "Manrope",
        borderBottom: "18px solid #80BA01",
      }}
    >
      <img
        src={`data:image/png;base64,${logo.toString("base64")}`}
        width={414}
        height={78}
        alt="GreenBel"
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 46,
          fontSize: 76,
          lineHeight: 1.13,
          letterSpacing: -3,
        }}
      >
        <span>Soluciones para</span>
        <span>el campo.</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 27,
          color: "#3A4813",
          marginTop: 28,
        }}
      >
        Productos agrícolas · Equipos · Repuestos
      </div>
      <div style={{ display: "flex", fontSize: 23, marginTop: "auto" }}>
        www.greenbel.store
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Manrope", data: font, weight: 800, style: "normal" }],
    },
  );
}
