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
  Sprout
} from "lucide-react";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
import { FinancingForm } from "@/presentation/components/financing-form";

export const metadata: Metadata = {
  title: "Financiamiento con Cooperativa Concepción",
  description: "Conoce la alianza de GreenBel y Cooperativa Concepción R.L. y el estado del proceso de financiamiento."
};

const preparationSteps = [
  {
    title: "Explora productos",
    text: "Revisa equipos y repuestos publicados. El servidor verificará precio y disponibilidad antes de emitir una cotización.",
    icon: Sprout,
    href: "/productos",
    action: "Ver catálogo"
  },
  {
    title: "Revisa tu carrito",
    text: "Reúne productos y cantidades. Desde el carrito puedes solicitar un PDF privado; la cotización no reserva inventario.",
    icon: ClipboardCheck,
    href: "/carrito",
    action: "Ver carrito"
  },
  {
    title: "Estado de la solicitud",
    text: "Con una cotización emitida puedes registrar un borrador. La verificación de correo y el envío a la cooperativa permanecen pausados.",
    icon: ShieldCheck,
    href: "#solicitud",
    action: "Ver estado"
  }
];

const process = [
  ["01", "Selecciona productos", "El carrito reúne equipos y cantidades sin reservar existencias."],
  ["02", "Cotización y PDF", "Solicita un PDF privado desde el carrito con precios y existencias verificados por el servidor."],
  ["03", "Verifica el correo", "El código de verificación y su envío por correo permanecen deshabilitados."],
  ["04", "Confirma el envío", "El envío a la cooperativa solo ocurrirá tras verificación y confirmación expresa cuando el servicio esté disponible."]
];

export default function FinancingPage() {
  return (
    <>
      <section className="financing-hero">
        <div className="financing-hero-copy">
          <Reveal as="span" className="eyebrow">Alianza para el campo</Reveal>
          <AnimatedTitle as="h1" lines={["Financiamiento para", "impulsar tu trabajo."]} delay={0.05} />
          <Reveal as="p" delay={0.2}>
            GreenBel mantiene una alianza con Cooperativa Concepción R.L. para consultar opciones de financiamiento. Los requisitos y condiciones aún deben confirmarse con la cooperativa.
          </Reveal>
          <Reveal className="financing-hero-actions" delay={0.28}>
            <a className="primary-button" href="#solicitud">Ver estado de solicitud <ArrowDown size={17} /></a>
            <Link className="secondary-dark-button" href="/productos">Ver equipos <ArrowRight size={17} /></Link>
          </Reveal>
          <Reveal className="financing-hero-note" delay={0.36}>
            <ShieldCheck size={18} /> La cooperativa evalúa y aprueba cada solicitud según sus políticas vigentes.
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
            <span><Sprout size={18} /> Equipos GreenBel</span>
            <ArrowRight size={17} />
            <span><Landmark size={18} /> Financiamiento aliado</span>
          </div>
        </Reveal>
      </section>

      <section className="financing-partner" aria-labelledby="partner-title">
        <Reveal className="financing-partner-logo">
          <Image src="/images/coorporativ.png" alt="Cooperativa Concepción R.L." width={720} height={214} sizes="(max-width: 700px) 84vw, 520px" />
        </Reveal>
        <div>
          <Reveal as="span" className="eyebrow">Cooperativa aliada</Reveal>
          <AnimatedTitle id="partner-title" lines={["Crecer con una opción", "pensada para tu proyecto."]} />
          <Reveal as="p" delay={0.16}>
            Los documentos, plazos, tasas y condiciones aplicables siguen por confirmar. El sitio solo registra borradores; todavía no envía solicitudes a la cooperativa.
          </Reveal>
          <Reveal className="financing-partner-points" delay={0.24}>
            <span><BadgeCheck size={17} /> Alianza confirmada</span>
            <span><ClipboardCheck size={17} /> Requisitos por confirmar</span>
            <span><HandCoins size={17} /> Evaluación independiente</span>
          </Reveal>
        </div>
      </section>

      <section className="section financing-options" aria-labelledby="preparation-title">
        <header className="financing-section-heading">
          <div>
            <Reveal as="span" className="eyebrow">Prepara tu selección</Reveal>
            <AnimatedTitle id="preparation-title" lines={["Explora antes de solicitar."]} />
          </div>
          <Reveal as="p" delay={0.16}>Puedes solicitar un PDF privado desde el carrito y registrar un borrador vinculado. La verificación y el envío siguen pendientes.</Reveal>
        </header>
        <div className="financing-option-grid">
          {preparationSteps.map(({ title, text, icon: Icon, href, action }, index) => (
            <Reveal key={title} delay={index * 0.09}>
              <article>
                <span className="financing-option-icon"><Icon /></span>
                <h3>{title}</h3>
                <p>{text}</p>
                <Link href={href}>{action} <ArrowRight size={16} /></Link>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="financing-process" aria-labelledby="financing-process-title">
        <div className="financing-process-intro">
          <Reveal as="span" className="eyebrow light">Proceso previsto</Reveal>
          <AnimatedTitle id="financing-process-title" lines={["De tu equipo", "a una solicitud."]} />
          <Reveal as="p" delay={0.17}>Seleccionar productos no envía datos. El borrador requiere una cotización emitida y consentimiento; la verificación y el envío permanecen pausados.</Reveal>
        </div>
        <div className="financing-process-steps">
          {process.map(([number, title, text], index) => (
            <Reveal key={number} delay={index * 0.08}>
              <article>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="financing-contact" id="solicitud" aria-labelledby="financing-contact-title">
        <aside className="financing-contact-aside">
          <Reveal className="financing-contact-logo">
            <Image src="/images/coorporativ.png" alt="Cooperativa Concepción R.L." width={720} height={214} sizes="(max-width: 800px) 82vw, 430px" />
          </Reveal>
          <Reveal as="span" className="eyebrow light">Solicitud de financiamiento</Reveal>
          <AnimatedTitle id="financing-contact-title" lines={["Estado del", "formulario."]} />
          <Reveal as="p" delay={0.16}>El formulario guarda un borrador solo si el servidor confirma una cotización PDF privada y un acceso válido. No verifica el correo ni envía datos a la cooperativa.</Reveal>
          <Reveal className="financing-contact-list" delay={0.24}>
            <span><CheckCircle2 /> La cooperativa decidirá cada solicitud futura</span>
            <span><ClipboardCheck /> Requisitos, tasa y plazo por confirmar</span>
            <span><ShieldCheck /> Ningún dato se enviará durante esta pausa</span>
          </Reveal>
        </aside>
        <Reveal amount={0.08}><FinancingForm /></Reveal>
      </section>
    </>
  );
}
