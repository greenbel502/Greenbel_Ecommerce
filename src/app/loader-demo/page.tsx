import type { Metadata } from "next";
import { LoaderDemo } from "@/presentation/components/loader-demo";
import { notFound } from "next/navigation";
import { getActiveEnvironment } from "@/lib/server/environment";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo loader Bell IA",
  robots: { index: false, follow: false },
};

export default function LoaderDemoPage() {
  if (getActiveEnvironment().appEnvironment !== "DEV") notFound();
  return <LoaderDemo />;
}
