import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, CircleCheck, CreditCard, GraduationCap, PackageCheck, ShieldCheck, Truck, Wrench } from "lucide-react";
import { getProductBySlug, getProducts } from "@/application/use-cases/getProducts";
import { getCompatibleProductIds } from "@/application/use-cases/getCompatibleProducts";
import { getProductReviews } from "@/application/use-cases/getProductReviews";
import { getProductRelatedTrainings, type PublicTraining } from "@/application/use-cases/getTrainings";
import { getEligibleReviewOrderItems } from "@/app/productos/review-actions";
import { formatCurrency } from "@/application/use-cases/cartCalculations";
import { ProductDetailActions } from "@/presentation/components/product-detail-actions";
import { ProductCard } from "@/presentation/components/product-card";
import { ProductImageGallery } from "@/presentation/components/product-image-gallery";
import { ProductReviewForm } from "@/presentation/components/product-review-form";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
import trainingStyles from "@/app/capacitaciones/training.module.css";
import { readPublicData } from "@/lib/server/public-data-result";
import { PageStatus } from "@/presentation/components/page-status";
import { breadcrumbStructuredData, pageMetadata, productDescription, productStructuredData, serializeStructuredData } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await readPublicData(() => getProductBySlug(slug));
  if (result.status === "unavailable") return { title: "Producto temporalmente no disponible", robots: { index: false } };
  const product = result.data;
  return product
    ? { ...pageMetadata({ title: product.name, description: productDescription(product), path: `/productos/${encodeURIComponent(product.slug)}`,
      ...(product.image !== "/images/product-placeholder.svg" ? { image: product.image } : {}) }),
      ...(product.isMockPrice ? { robots: { index: false } } : {}) }
    : { title: "Producto no encontrado", robots: { index: false } };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readPublicData(() => getProductBySlug(slug));
  if (result.status === "unavailable") return <PageStatus kind="unavailable" />;
  const product = result.data;
  if (!product) notFound();

  const relatedResult = await readPublicData(() => getProducts());
  if (relatedResult.status === "unavailable") return <PageStatus kind="unavailable" />;
  const allProducts = relatedResult.data;
  const related = allProducts.filter((item) => item.category === product.category)
    .filter((item) => item.id !== product.id)
    .slice(0, 3);
  const compatibility = await getCompatibleProductIds(product);
  const compatibleProducts = allProducts.filter((item) => compatibility.ids.includes(item.id));
  const reviewResult = await getProductReviews(product.id);
  const reviewEligibility = reviewResult.status === "mock" ? null : await getEligibleReviewOrderItems(product.id);
  let relatedTrainings: PublicTraining[] = [];
  let relatedTrainingsUnavailable = false;
  try {
    relatedTrainings = await getProductRelatedTrainings(product.id);
  } catch {
    relatedTrainingsUnavailable = true;
  }
  const hasNarrative = Boolean(product.description.trim() || product.recommendedUse.trim() || product.includes.length);
  const hasSpecs = product.specs.length > 0;
  const availability = product.availability === "available" ? "Disponible"
    : product.availability === "unavailable" ? "Agotado"
      : product.availability === "unknown" ? "Existencia por confirmar" : product.stock === null
    ? "Existencia por confirmar"
    : product.stock > 0 ? "Disponible" : "Agotado";
  const imageNote = product.image === "/images/product-placeholder.svg"
    ? "Imagen del producto pendiente"
    : product.isMockPrice ? "Imagen de referencia del catálogo" : "Imagen del producto";
  const jsonLd = productStructuredData(product);
  const breadcrumbs = breadcrumbStructuredData([
    { name: "Inicio", path: "/" },
    { name: "Productos", path: "/productos" },
    { name: product.name, path: `/productos/${encodeURIComponent(product.slug)}` },
  ]);

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(jsonLd) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(breadcrumbs) }} />
      <section className="product-detail-shell">
        <nav className="breadcrumbs" aria-label="Migas de pan">
          <Link href="/">Inicio</Link>
          <ChevronRight size={14} />
          <Link href="/productos">Productos</Link>
          <ChevronRight size={14} />
          <span>{product.sku}</span>
        </nav>
        <div className="product-detail-grid">
          <div className="product-gallery">
            <ProductImageGallery images={product.images?.length ? product.images : [{ src: product.image, alt: product.name }]} fallbackAlt={product.name} />
            <div className="gallery-note"><PackageCheck /><span>{imageNote}</span></div>
          </div>
          <div className="product-info">
            <Reveal as="span" className="product-category">{product.category}</Reveal>
            <Reveal className="product-code" delay={0.08}>
              <span>{product.brand}</span>
              <span>Código {product.sku}</span>
            </Reveal>
            <AnimatedTitle as="h1" lines={[product.name]} delay={0.08} />
            {product.shortDescription.trim() && (
              <Reveal as="p" className="detail-description" delay={0.2}>{product.shortDescription}</Reveal>
            )}
            <div className="detail-status">
              <span><CircleCheck /> {availability}</span>
              {product.warrantyMonths !== null && (
                <span><ShieldCheck /> {product.warrantyMonths} mes{product.warrantyMonths === 1 ? "" : "es"} de garantía</span>
              )}
            </div>
            <div className="detail-price">
              <strong>{product.price === null ? "Precio próximamente" : formatCurrency(product.price)}</strong>
              {product.price !== null && product.isMockPrice && <small>Precio demostrativo</small>}
              {product.isMockPrice && (
                <small>Ficha DEV de referencia: especificaciones, incluidos, garantía y existencia pendientes de validación.</small>
              )}
            </div>
            <ProductDetailActions product={product} />
            <div className="purchase-benefits">
              <span><Truck /> Entrega sujeta a cobertura</span>
              <span><CreditCard /> Opciones de pago pendientes de habilitar</span>
              <span><Wrench /> Servicio técnico y repuestos</span>
            </div>
          </div>
        </div>
      </section>
      {(hasNarrative || hasSpecs) && (
        <section className="product-tech-section" style={hasNarrative && hasSpecs ? undefined : { gridTemplateColumns: "1fr" }}>
          {hasNarrative && (
            <div className="product-description">
              {product.description.trim() && (
                <>
                  <Reveal as="span" className="eyebrow">Descripción</Reveal>
                  <AnimatedTitle lines={["Diseñado para el trabajo", "que tienes por delante."]} />
                  <Reveal as="p" delay={0.16}>{product.description}</Reveal>
                </>
              )}
              {product.recommendedUse.trim() && (
                <>
                  <h3>Uso recomendado</h3>
                  <p>{product.recommendedUse}</p>
                </>
              )}
              {product.includes.length > 0 && (
                <>
                  <h3>Qué incluye</h3>
                  <ul>{product.includes.map((item) => <li key={item}><Check size={16} /> {item}</li>)}</ul>
                </>
              )}
            </div>
          )}
          {hasSpecs && (
            <div className="spec-panel">
              <AnimatedTitle lines={["Especificaciones técnicas"]} />
              <dl>{product.specs.map((spec) => (
                <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>
              ))}</dl>
              <div className="advisor-card">
                <Wrench />
                <div>
                  <strong>¿Este equipo es adecuado para ti?</strong>
                  <p>El formulario indicará si tu consulta quedó registrada. Los correos de negocio siguen pausados.</p>
                  <Link href={`/contacto?producto=${encodeURIComponent(product.sku)}`}>Consultar sobre este producto</Link>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
      {reviewResult.status !== "mock" && (
        <section className="section product-reviews" aria-labelledby="product-reviews-title">
          <div className="section-heading"><div><span className="eyebrow">Compras entregadas</span><h2 id="product-reviews-title">Opiniones de clientes</h2></div></div>
          {reviewResult.status === "unavailable" ? (
            <p role="status">Las reseñas no están disponibles en este momento.</p>
          ) : reviewResult.reviews.length === 0 ? (
            <p>Todavía no hay reseñas publicadas para este producto.</p>
          ) : (
            <div className="product-review-grid">{reviewResult.reviews.map((review) => (
              <article key={review.id} className="product-review-card">
                <div><strong aria-label={`${review.rating} de 5 estrellas`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</strong><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("es-GT", { timeZone: "America/Guatemala" })}</time></div>
                <p>{review.comment}</p>
                <small>Compra entregada</small>
              </article>
            ))}</div>
          )}
        </section>
      )}
      {reviewEligibility && <ProductReviewForm productId={product.id} eligibility={reviewEligibility} />}
      {(relatedTrainingsUnavailable || relatedTrainings.length > 0) && (
        <section className="section" aria-labelledby="product-training-title">
          <div className="section-heading"><div><span className="eyebrow">Aprende con GreenBel</span><h2 id="product-training-title">Capacitaciones relacionadas</h2></div></div>
          {relatedTrainingsUnavailable ? (
            <p role="status">Las capacitaciones relacionadas no están disponibles en este momento.</p>
          ) : (
            <div className={trainingStyles.grid}>{relatedTrainings.map((training) => (
              <article className={trainingStyles.card} key={training.id}>
                <span className={trainingStyles.icon}><GraduationCap aria-hidden="true" /></span>
                <h3>{training.title}</h3>
                {training.description && <p>{training.description}</p>}
                <Link href={`/capacitaciones/${training.slug}`}>Ver capacitación <ChevronRight size={17} aria-hidden="true" /></Link>
              </article>
            ))}</div>
          )}
        </section>
      )}
      {compatibility.status === "unavailable" && (
        <section className="section" role="status">No se pudieron consultar las compatibilidades verificadas de este producto.</section>
      )}
      {compatibleProducts.length > 0 && (
        <section className="section related-products" aria-labelledby="product-compatibilities-title">
          <div className="section-heading"><div><Reveal as="span" className="eyebrow">Correspondencia registrada</Reveal>
            <h2 id="product-compatibilities-title">{product.kind === "equipment" ? "Repuestos compatibles" : "Equipos compatibles"}</h2></div></div>
          <div className="product-grid">{compatibleProducts.map((item) => <ProductCard key={item.id} product={item} />)}</div>
        </section>
      )}
      {related.length > 0 && (
        <section className="section related-products">
          <div className="section-heading">
            <div>
              <Reveal as="span" className="eyebrow">También puede interesarte</Reveal>
              <AnimatedTitle lines={["Compara opciones relacionadas."]} />
            </div>
          </div>
          <div className="product-grid">
            {related.map((item) => <ProductCard key={item.id} product={item} />)}
          </div>
        </section>
      )}
    </>
  );
}
