import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import "sileo/styles.css";
import { NotificationProvider } from "@/presentation/notifications/notification-provider";
import "./globals.css";
import { CartProvider } from "@/presentation/providers/cart-provider";
import { Footer } from "@/presentation/components/footer";
import { SiteFrame } from "@/presentation/components/site-frame";
import { NavigationLoader } from "@/presentation/components/navigation-loader";

const poppins = localFont({
  src: [
    { path: "./fonts/poppins-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

// Temporary clean display face: the Mont DEMO file marks accented glyphs.
// Replace with the complete licensed Mont Heavy webfont when provided.
const displayFont = localFont({
  src: "./fonts/manrope-latin-800.woff2",
  weight: "800",
  style: "normal",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://greenbel.gt"),
  title: {
    default: "GreenBel | Equipos agrícolas en Guatemala",
    template: "GreenBel | %s",
  },
  description:
    "Equipos de aspersión, bombeo, repuestos y servicio técnico con asesoría especializada en Guatemala.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "GreenBel Guatemala",
    description: "Potencia y respaldo para cada trabajo en el campo.",
    type: "website",
    locale: "es_GT",
  },
  twitter: {
    card: "summary_large_image",
    title: "GreenBel Guatemala",
    description: "Equipos agrícolas con respaldo técnico.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${poppins.variable} ${displayFont.variable}`}>
        <CartProvider>
          <NotificationProvider>
          <SiteFrame footer={<Footer />}>{children}</SiteFrame>
          <Suspense fallback={null}>
            <NavigationLoader />
          </Suspense>
          </NotificationProvider>
        </CartProvider>
      </body>
    </html>
  );
}
