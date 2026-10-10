import type { Metadata } from "next";
import { LoaderDemo } from "@/presentation/components/loader-demo";

export const metadata: Metadata = {
  title: "Demo loader Bell IA"
};

export default function LoaderDemoPage() {
  return <LoaderDemo />;
}
