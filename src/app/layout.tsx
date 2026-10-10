import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { CartProvider } from "@/presentation/providers/cart-provider";
import { Header } from "@/presentation/components/header";
import { Footer } from "@/presentation/components/footer";
import { DeferredVirtualAssistant } from "@/presentation/components/deferred-virtual-assistant";
import { NavigationLoader } from "@/presentation/components/navigation-loader";

const poppins = localFont({
  src: [
    { path: "./fonts/poppins-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-latin-700.woff2", weight: "700", style: "normal" }
  ],
  variable: "--font-sans",
  display: "swap"
});

const archivoBlack = localFont({
  src: "./fonts/archivo-black-latin-400.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-display",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://greenbel.gt"),
  title: { default: "GreenBel | Equipos agrícolas en Guatemala", template: "GreenBel | %s" },
  description: "Equipos de aspersión, bombeo, repuestos y servicio técnico con asesoría especializada en Guatemala.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  openGraph: { title: "GreenBel Guatemala", description: "Potencia y respaldo para cada trabajo en el campo.", type: "website", locale: "es_GT" },
  twitter: { card: "summary_large_image", title: "GreenBel Guatemala", description: "Equipos agrícolas con respaldo técnico." }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${poppins.variable} ${archivoBlack.variable}`}><CartProvider><Header /><main>{children}</main><Footer /><Suspense fallback={null}><NavigationLoader /></Suspense><DeferredVirtualAssistant /><Toaster richColors position="bottom-right" closeButton /></CartProvider></body></html>;
}
