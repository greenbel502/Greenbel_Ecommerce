import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveAppEnvironment } from "@/lib/server/environment-policy";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";

const documents = {
  privacidad: {
    title: "Política de privacidad",
    body: "Texto legal pendiente de aprobación. En DEV, los formularios de contacto y financiamiento pueden guardar los datos que ingreses cuando Supabase esté conectado; el correo comercial permanece pausado. Evita introducir datos personales reales durante las pruebas."
  },
  terminos: {
    title: "Términos y condiciones",
    body: "Texto legal pendiente de aprobación. Esta versión no permite confirmar pedidos ni procesar pagos. El carrito no reserva existencias y una cotización no garantiza precios futuros ni constituye una factura."
  },
  garantias: {
    title: "Garantías, cambios y devoluciones",
    body: "Texto legal pendiente de aprobación. La cobertura, los plazos, los costos y las excepciones de garantía o devolución deben ser confirmados por GreenBel. Los casos de posventa se atienden manualmente."
  }
} as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = documents[slug as keyof typeof documents];
  return { title: doc?.title ?? "Información legal", robots: { index: false, follow: false } };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  // No unapproved placeholder is published as a legal policy in PROD.
  if (resolveAppEnvironment(process.env) !== "DEV") notFound();
  const { slug } = await params;
  const doc = documents[slug as keyof typeof documents];
  if (!doc) notFound();
  return <section className="empty-state">
    <Reveal as="span" className="eyebrow">Aviso temporal DEV</Reveal>
    <AnimatedTitle as="h1" lines={[doc.title]} />
    <Reveal as="p" delay={0.16}>{doc.body}</Reveal>
    <Reveal delay={0.24}><Link href="/" className="primary-button">Volver al inicio</Link></Reveal>
  </section>;
}
