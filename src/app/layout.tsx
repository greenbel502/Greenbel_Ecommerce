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
import { isIndexableEnvironment, pageMetadata, SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";

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
  ...pageMetadata({ title: "Productos agrícolas y equipos en Guatemala", description: SITE_DESCRIPTION, path: "/" }),
  metadataBase: new URL(SITE_URL),
  title: {
    default: "GreenBel | Productos agrícolas y equipos en Guatemala",
    template: "GreenBel | %s",
  },
  robots: isIndexableEnvironment()
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } }
    : { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64 128x128 256x256" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
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
