import type { Metadata } from "next";
import { CartView } from "@/presentation/components/cart-view";
export const metadata: Metadata = { title: "Carrito" };
export default function CartPage() { return <CartView />; }
