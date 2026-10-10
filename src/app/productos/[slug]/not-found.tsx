import Link from "next/link";
import { SearchX } from "lucide-react";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
export default function ProductNotFound() { return <section className="empty-state"><SearchX size={42} /><AnimatedTitle as="h1" lines={["Producto no encontrado"]} /><Reveal as="p" delay={0.16}>El equipo que buscas no está disponible en este catálogo demostrativo.</Reveal><Reveal delay={0.24}><Link href="/productos" className="primary-button">Volver al catálogo</Link></Reveal></section>; }
