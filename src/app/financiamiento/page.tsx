import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  Landmark,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import {
  AnimatedTitle,
  Reveal,
} from "@/presentation/components/motion-primitives";
import { FinancingForm } from "@/presentation/components/financing-form";
import { pageMetadata } from "@/lib/seo";
import { readPublicLocations } from "@/lib/server/contact-settings";
import { LocationsMap } from "@/presentation/components/locations-map";
import styles from "./financing-page.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Financiamiento con Cooperativa Concepción",
  description:
    "Solicita información sobre posible financiamiento para tu selección de productos GreenBel con Cooperativa Concepción R.L. Cada solicitud está sujeta a evaluación de la cooperativa.",
  path: "/financiamiento",
});

const preparationSteps = [
  {
    title: "Explora productos",
    text: "Revisa equipos y repuestos publicados. El servidor verificará los precios al preparar tu PDF; las existencias quedan por confirmar.",
    icon: Sprout,
    href: "/productos",
    action: "Ver catálogo",
  },
  {
    title: "Revisa tu carrito",
    text: "Reúne productos y cantidades. El PDF privado se prepara al completar este formulario; no reserva inventario.",
    icon: ClipboardCheck,
    href: "/carrito",
    action: "Ver carrito",
  },
  {
    title: "Completa tu solicitud",
    text: "Ingresa con tu cuenta, revisa tus datos y confirma el envío del PDF a la cooperativa.",
    icon: ShieldCheck,
    href: "#solicitud",
    action: "Continuar",
  },
];

const process = [
  [
    "01",
    "Selecciona productos",
    "El carrito reúne equipos y cantidades sin reservar existencias.",
  ],
  [
    "02",
    "Cotización y PDF",
    "El servidor prepara un PDF privado con precios y cantidades. La disponibilidad queda por confirmar.",
  ],
  [
    "03",
    "Ingresa a tu cuenta",
    "Inicia sesión en GreenBel para completar tu solicitud con el correo de tu cuenta.",
  ],
  [
    "04",
    "Confirma el envío",
    "Revisa tu selección y autoriza el envío de tus datos y el PDF a la cooperativa.",
  ],
];

export const dynamic = "force-dynamic";

export default async function FinancingPage() {
  const locations = await readPublicLocations("cooperative");
  return (
    <>
      <section className={`financing-hero ${styles.hero}`}>
        <div className="financing-hero-copy">
          <Reveal as="span" className="eyebrow">
            Alianza para el campo
          </Reveal>
          <AnimatedTitle
            as="h1"
            lines={["Financiamiento para", "impulsar tu trabajo."]}
            delay={0.05}
          />
          <Reveal as="p" className={styles.secondaryCopy} delay={0.2}>
            GreenBel mantiene una alianza con Cooperativa Concepción R.L. para
            consultar opciones de financiamiento. Los requisitos y condiciones
            aún deben confirmarse con la cooperativa.
          </Reveal>
          <Reveal className="financing-hero-actions" delay={0.28}>
            <a className="primary-button" href="#solicitud">
              Solicitar información <ArrowDown size={17} />
            </a>
            <Link className="secondary-dark-button" href="/productos">
              Ver equipos <ArrowRight size={17} />
            </Link>
          </Reveal>
          <Reveal className="financing-hero-note" delay={0.36}>
            <ShieldCheck size={18} /> La cooperativa evalúa y aprueba cada
            solicitud según sus políticas vigentes.
          </Reveal>
        </div>
        <Reveal className="financing-hero-media" delay={0.12} amount={0.1}>
          <Image
            src="/images/aliados.png"
            alt="Productor agrícola recibiendo orientación de financiamiento GreenBel en el campo"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 52vw"
          />
          <div className="financing-alliance-badge">
            <span>
              <Sprout size={18} /> Equipos GreenBel
            </span>
            <ArrowRight size={17} />
            <span>
              <Landmark size={18} /> Financiamiento aliado
            </span>
          </div>
        </Reveal>
      </section>

      <section
        className={`financing-partner ${styles.partner}`}
        aria-labelledby="partner-title"
      >
        <Reveal className="financing-partner-logo">
          <Image
            src="/images/coorporativ.png"
            alt="Cooperativa Concepción R.L."
            width={720}
            height={214}
            sizes="(max-width: 700px) 84vw, 520px"
          />
        </Reveal>
        <div>
          <Reveal as="span" className="eyebrow">
            Cooperativa aliada
          </Reveal>
          <AnimatedTitle
            id="partner-title"
            lines={["Crecer con una opción", "pensada para tu proyecto."]}
          />
          <Reveal as="p" className={styles.secondaryCopy} delay={0.16}>
            Los documentos, plazos, tasas y condiciones aplicables deben
            confirmarse con la cooperativa. GreenBel comparte tu solicitud y
            selección únicamente con tu consentimiento y una sesión activa.
          </Reveal>
          <Reveal className="financing-partner-points" delay={0.24}>
            <span>
              <BadgeCheck size={17} /> Alianza confirmada
            </span>
            <span>
              <ClipboardCheck size={17} /> Requisitos por confirmar
            </span>
            <span>
              <HandCoins size={17} /> Evaluación independiente
            </span>
          </Reveal>
        </div>
      </section>

      <div
        className={`section financing-locations ${locations.available ? styles.locations : ""}`}
      >
        <LocationsMap
          company="cooperative"
          locations={locations.locations}
          title="La cooperativa, cerca de tu proyecto"
          description={
            locations.available
              ? "Conoce la presencia de Cooperativa Concepción R.L. Pasa el cursor o toca un marcador para ver su nombre."
              : "Las ubicaciones de la cooperativa no están disponibles en este momento. Puedes solicitar información con el formulario de financiamiento."
          }
        />
      </div>

      <section
        className={`section financing-options ${styles.options}`}
        aria-labelledby="preparation-title"
      >
        <header className="financing-section-heading">
          <div>
            <Reveal as="span" className="eyebrow">
              Prepara tu selección
            </Reveal>
            <AnimatedTitle
              id="preparation-title"
              lines={["Explora antes de solicitar."]}
            />
          </div>
          <Reveal as="p" className={styles.secondaryCopy} delay={0.16}>
            Agrega los productos al carrito y completa este formulario para
            preparar tu PDF, ingresar con tu cuenta y confirmar el envío.
          </Reveal>
        </header>
        <div className="financing-option-grid">
          {preparationSteps.map(
            ({ title, text, icon: Icon, href, action }, index) => (
              <Reveal key={title} delay={index * 0.09}>
                <article>
                  <span className="financing-option-icon">
                    <Icon />
                  </span>
                  <h3>{title}</h3>
                  <p className={styles.secondaryCopy}>{text}</p>
                  <Link href={href}>
                    {action} <ArrowRight size={16} />
                  </Link>
                </article>
              </Reveal>
            ),
          )}
        </div>
      </section>

      <section
        className={`financing-process ${styles.process}`}
        aria-labelledby="financing-process-title"
      >
        <div className="financing-process-intro">
          <Reveal as="span" className="eyebrow light">
            Cómo funciona
          </Reveal>
          <AnimatedTitle
            id="financing-process-title"
            lines={["De tu equipo", "a una solicitud."]}
          />
          <Reveal as="p" className={styles.secondaryCopy} delay={0.17}>
            Seleccionar productos no envía datos. Primero preparas el PDF,
            autorizas compartir tu información y accedes a tu cuenta. Tú
            confirmas el envío final.
          </Reveal>
        </div>
        <div className="financing-process-steps">
          {process.map(([number, title, text], index) => (
            <Reveal key={number} delay={index * 0.08}>
              <article>
                <span>{number}</span>
                <h3>{title}</h3>
                <p className={styles.secondaryCopy}>{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section
        className={`financing-contact ${styles.contact}`}
        id="solicitud"
        aria-labelledby="financing-contact-title"
      >
        <aside className="financing-contact-aside">
          <Reveal className="financing-contact-logo">
            <Image
              src="/images/cooperativa-concepcion-blanco.png"
              alt="Cooperativa Concepción R.L."
              width={8000}
              height={2863}
              sizes="(max-width: 800px) 82vw, 430px"
            />
          </Reveal>
          <Reveal as="span" className="eyebrow light">
            Solicitud de financiamiento
          </Reveal>
          <AnimatedTitle
            id="financing-contact-title"
            lines={["Tu proyecto", "empieza aquí."]}
          />
          <Reveal as="p" className={styles.secondaryCopy} delay={0.16}>
            Comparte los productos que te interesan. Ingresa con tu cuenta para
            revisar y confirmar el envío de tus datos y tu PDF a Cooperativa
            Concepción R.L.
          </Reveal>
          <Reveal className="financing-contact-list" delay={0.24}>
            <span>
              <CheckCircle2 /> Evaluación independiente de la cooperativa
            </span>
            <span>
              <ClipboardCheck /> Requisitos, tasa y plazo por confirmar
            </span>
            <span>
              <ShieldCheck /> Tú confirmas cuándo compartir tu solicitud
            </span>
          </Reveal>
        </aside>
        <Reveal amount={0.08}>
          <FinancingForm />
        </Reveal>
      </section>
    </>
  );
}
