import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getProducts } from "@/application/use-cases/getProducts";
import { ProductCatalog } from "@/presentation/components/product-catalog";
import {
  AnimatedTitle,
  Reveal,
} from "@/presentation/components/motion-primitives";
import { readPublicData } from "@/lib/server/public-data-result";
import { PageStatus } from "@/presentation/components/page-status";
import { pageMetadata } from "@/lib/seo";
import styles from "@/presentation/components/product-catalog.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Productos agrícolas, equipos y repuestos",
  description:
    "Explora productos agrícolas, equipos de aspersión y bombeo, implementos y repuestos. Consulta precios y fichas del catálogo GreenBel en Guatemala.",
  path: "/productos",
});
export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; busqueda?: string }>;
}) {
  const result = await readPublicData(() => getProducts());
  if (result.status === "unavailable") return <PageStatus kind="unavailable" />;
  const products = result.data;
  const hasMockProducts = products.some((product) => product.isMockPrice);
  const query = await searchParams;
  // Keep existing category URLs compatible with the company's source labels.
  const categoryMap = {
    aspersion: ["ASPERSIÓN", "Equipos de aspersión"],
    bombeo: ["MOTOBOMBA", "Equipos de bombeo"],
    repuestos: ["Repuestos"],
    implementos: ["Implementos"],
  } as const;
  const candidates: readonly string[] =
    categoryMap[query.categoria as keyof typeof categoryMap] ?? [];
  const availableCategories = new Set(
    products.map((product) => product.category),
  );
  const initialCategory =
    candidates.find((category) => availableCategories.has(category)) ??
    candidates[0] ??
    "Todos";
  return (
    <>
      <section className={`catalog-hero ${styles.hero}`}>
        <nav className="breadcrumbs" aria-label="Migas de pan">
          <Link href="/">Inicio</Link>
          <ChevronRight size={14} />
          <span>Productos</span>
        </nav>
        <Reveal as="span" className="eyebrow">
          Catálogo técnico
        </Reveal>
        <AnimatedTitle
          as="h1"
          lines={["Equipos para trabajar", "con confianza."]}
          delay={0.05}
        />
        <Reveal as="p" delay={0.2}>
          {hasMockProducts
            ? "Catálogo de demostración DEV: las fichas de prueba contienen precios, existencias, garantías, especificaciones e incluidos pendientes de validación. Las imágenes son de referencia."
            : "Explora los productos disponibles en el catálogo GreenBel y consulta sus fichas técnicas."}
        </Reveal>
      </section>
      <ProductCatalog
        key={`${query.categoria ?? "todos"}:${query.busqueda ?? ""}`}
        products={products}
        initialQuery={query.busqueda ?? ""}
        initialCategory={initialCategory}
      />
    </>
  );
}
