import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpenCheck, GraduationCap, HeartHandshake, MessageCircle, MessageSquareQuote, PackageSearch, ShieldCheck, Sprout, Star, UserRound, Wrench } from "lucide-react";
import { getFeaturedProducts } from "@/application/use-cases/getProducts";
import { ProductCard } from "@/presentation/components/product-card";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
import { TestimonialCard } from "@/presentation/components/testimonial-card";
import { BrandsCarousel } from "@/presentation/components/brands-carousel";
import { mockTestimonials } from "@/infrastructure/mock/testimonials";
import { resolveAppEnvironment } from "@/lib/server/environment-policy";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const featuredProducts = await getFeaturedProducts();
  const hasMockProducts = featuredProducts.some((product) => product.isMockPrice);
  const showMockEditorial = resolveAppEnvironment(process.env) === "DEV";
  return <>
    <section className="hero-bento">
      <div className="hero-copy"><Reveal as="span" className="eyebrow">Equipos agrícolas y de jardinería</Reveal><AnimatedTitle as="h1" lines={["Potencia y respaldo", "para cada trabajo en el campo."]} delay={0.06} /><Reveal as="p" delay={0.2}>{hasMockProducts ? "Explora equipos y repuestos en este catálogo de demostración. Los datos comerciales se confirmarán antes de habilitar compras." : "Explora equipos y repuestos GreenBel. Consulta sus fichas y los canales de atención disponibles."}</Reveal><Reveal className="hero-actions" delay={0.3}><Link className="primary-button" href="/productos">Explorar productos <ArrowRight size={18} /></Link><Link className="secondary-dark-button" href="/contacto"><MessageCircle size={18} /> Ver contacto</Link></Reveal><Reveal className="hero-proof" delay={0.4}><span><BadgeCheck size={18} /> Marcas reconocidas</span><span><ShieldCheck size={18} /> Respaldo postventa</span></Reveal></div>
      <div className="hero-media"><Image src="/images/greenbel-hero.png" alt="Equipos agrícolas GreenBel trabajando en el campo" fill priority sizes="(max-width: 900px) 100vw, 54vw" /><div className="hero-float top"><HeartHandshake /><span><strong>Asesoría especializada</strong><small>Según tu cultivo o proyecto</small></span></div><div className="hero-float bottom"><Wrench /><span><strong>Servicio y repuestos</strong><small>Soporte después de la compra</small></span></div></div>
    </section>

    <section className="benefit-strip" aria-label="Beneficios GreenBel"><span><PackageSearch /> Equipos y repuestos</span><span><ShieldCheck /> Garantía y respaldo</span><span><BookOpenCheck /> Orientación técnica</span><span><Sprout /> Cobertura por confirmar</span></section>

    {showMockEditorial && <BrandsCarousel />}

    <section className="section featured-section"><div className="section-heading"><div><Reveal as="span" className="eyebrow">Selección GreenBel</Reveal><AnimatedTitle lines={["Equipos destacados"]} /></div><Reveal delay={0.16}><Link className="inline-link" href="/productos">Ver catálogo completo <ArrowRight size={16} /></Link></Reveal></div>{hasMockProducts && <p className="catalog-demo-notice">Productos destacados de demostración DEV: precios, existencias, garantías y detalles por validar.</p>}<div className="product-grid featured-grid">{featuredProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div></section>

    <section className="advice-band"><div><Reveal as="span" className="eyebrow light">Respaldo técnico GreenBel</Reveal><AnimatedTitle lines={["Acompañamiento", "que mantiene tu equipo", "en marcha."]} /><Reveal as="p" delay={0.18}>GreenBel cuenta con servicios especializados para cuidar tus equipos, mejorar su uso y prolongar su vida útil.</Reveal><Reveal delay={0.28}><Link className="lime-button" href="/contacto">Solicitar asesoría <ArrowRight size={17} /></Link></Reveal></div><div className="value-grid">{[["Talleres GreenBel","Diagnóstico y reparación técnica para mantener tu equipo operativo.",Wrench],["Capacitación técnica","Orientación práctica para utilizar y cuidar correctamente cada equipo.",GraduationCap],["Mantenimiento preventivo","Revisiones programadas que ayudan a anticipar fallas y evitar interrupciones.",ShieldCheck]].map(([title,text,Icon], index) => { const ValueIcon = Icon as typeof Wrench; return <Reveal key={String(title)} delay={index * 0.1}><article><ValueIcon /><h3>{String(title)}</h3><p>{String(text)}</p></article></Reveal>; })}</div></section>

    {showMockEditorial && <section className="section testimonials-section" aria-labelledby="testimonials-title"><div className="testimonials-panel"><header className="testimonials-heading"><Reveal as="span" className="testimonial-kicker"><MessageSquareQuote /> Testimonios de demostración DEV</Reveal><div><AnimatedTitle id="testimonials-title" lines={["Experiencias."]} /><Reveal as="p" delay={0.16}>Orientación, selección y respaldo técnico durante cada etapa de la compra.</Reveal></div><Reveal as="span" delay={0.22}><strong>GreenBel · DEV</strong></Reveal></header><div className="testimonials-wall"><aside className="testimonial-score"><div className="testimonial-rating"><strong>4.9</strong><span>/5</span></div><p>Una experiencia diseñada para elegir equipos con mayor claridad y confianza.</p><div className="testimonial-score-bottom"><strong>GreenBel</strong><div className="testimonial-profile-stack" aria-hidden="true">{[0,1,2].map((item) => <span key={item}><UserRound /></span>)}</div><div className="testimonial-score-stars" aria-label="5 de 5 estrellas">{[0,1,2,3,4].map((item) => <Star key={item} fill="currentColor" />)}</div><small>Comentarios demostrativos</small><Link href="/contacto">Compartir tu experiencia <ArrowRight /></Link></div></aside>{mockTestimonials.map((testimonial, index) => <TestimonialCard key={testimonial.name} testimonial={testimonial} index={index} />)}</div><p className="testimonials-disclaimer">Los comentarios y la puntuación son datos de demostración; no representan opiniones reales.</p></div></section>}

    <section className="final-cta"><div><Reveal as="span" className="eyebrow light">¿No sabes qué equipo necesitas?</Reveal><AnimatedTitle lines={["Cuéntanos sobre tu trabajo."]} /><Reveal as="p" delay={0.16}>Consulta los canales de atención disponibles antes de elegir tu equipo.</Reveal></div><Reveal className="final-cta-actions" delay={0.24}><Link className="final-cta-button primary" href="/contacto"><span className="final-cta-button-icon"><MessageCircle /></span><span>Ver contacto</span><ArrowRight className="final-cta-arrow" /></Link><Link className="final-cta-button secondary" href="/productos"><span className="final-cta-button-icon"><BookOpenCheck /></span><span>Ver catálogo</span><ArrowRight className="final-cta-arrow" /></Link></Reveal></section>
  </>;
}
