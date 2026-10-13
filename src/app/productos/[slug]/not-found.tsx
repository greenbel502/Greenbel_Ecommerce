import { PageStatus } from "@/presentation/components/page-status";

export default function ProductNotFound() {
  return <PageStatus kind="not-found" title="Producto no encontrado"
    description="El producto que buscas no está publicado o el enlace ha cambiado. Puedes explorar los productos disponibles en el catálogo." />;
}
