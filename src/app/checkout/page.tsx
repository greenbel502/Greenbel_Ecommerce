import type { Metadata } from "next";
import { CheckoutFlow } from "@/presentation/components/checkout-flow";

export const metadata: Metadata = { title: "Revisar compra", robots: { index: false, follow: false } };
export default function CheckoutPage() { return <CheckoutFlow />; }
