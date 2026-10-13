import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getProducts } from "@/application/use-cases/getProducts";
import { ProductCatalog } from "@/presentation/components/product-catalog";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
import { readPublicData } from "@/lib/server/public-data-result";
import { PageStatus } from "@/presentation/components/page-status";

export const metadata: Metadata = { title: "Productos", description: "Catálogo de equipos de aspersión, bombeo, repuestos e implementos GreenBel." };
export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ categoria?: string; busqueda?: string }> }) {
  const result = await readPublicData(() => getProducts());
  if (result.status === "unavailable") return <PageStatus kind="unavailable" />;
  const products = result.data;
  const hasMockProducts = products.some((product) => product.isMockPrice);
  const query = await searchParams;
  const categoryMap = { aspersion: "Equipos de aspersión", bombeo: "Equipos de bombeo", repuestos: "Repuestos", implementos: "Implementos" } as const;
  const initialCategory = categoryMap[query.categoria as keyof typeof categoryMap] ?? "Todos";
  return <><section className="catalog-hero"><nav className="breadcrumbs" aria-label="Migas de pan"><Link href="/">Inicio</Link><ChevronRight size={14} /><span>Productos</span></nav><Reveal as="span" className="eyebrow">Catálogo técnico</Reveal><AnimatedTitle as="h1" lines={["Equipos para trabajar", "con confianza."]} delay={0.05} /><Reveal as="p" delay={0.2}>{hasMockProducts ? "Catálogo de demostración DEV: las fichas de prueba contienen precios, existencias, garantías, especificaciones e incluidos pendientes de validación. Las imágenes son de referencia." : "Explora los productos disponibles en el catálogo GreenBel y consulta sus fichas técnicas."}</Reveal></section><ProductCatalog products={products} initialQuery={query.busqueda ?? ""} initialCategory={initialCategory} /></>;
}
