import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Handshake, Lightbulb, MapPinned, PackageSearch, ShieldCheck, Wrench } from "lucide-react";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";
import { PublicBrands } from "@/presentation/components/public-brands";
import styles from "./about.module.css";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Nosotros",
  description: "Conoce la asesoría técnica, servicio y respaldo postventa de GreenBel en Guatemala.",
  path: "/nosotros",
});

const values = [
  { Icon: Lightbulb, title: "Experiencia", text: "Conocimiento aplicado a necesidades reales." },
  { Icon: Handshake, title: "Cercanía", text: "Escuchamos antes de recomendar." },
  { Icon: ShieldCheck, title: "Respaldo", text: "Acompañamiento antes y después de la compra." },
  { Icon: PackageSearch, title: "Repuestos", text: "Disponibilidad para mantener equipos activos." },
  { Icon: Wrench, title: "Servicio", text: "Diagnóstico y mantenimiento preventivo." },
  { Icon: MapPinned, title: "Cobertura", text: "Atención para clientes en Guatemala." },
];

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Reveal as="span" className="eyebrow light">GreenBel Guatemala</Reveal>
          <AnimatedTitle as="h1" lines={["Más que equipos,", "soluciones para el campo."]} delay={0.05} />
          <Reveal as="p" delay={0.2}>
            Combinamos productos confiables con conocimiento técnico, repuestos y acompañamiento cercano.
          </Reveal>
          <Reveal delay={0.3}>
            <Link href="/contacto" className="lime-button">Conversemos <ArrowRight size={17} /></Link>
          </Reveal>
        </div>
        <div className={styles.heroImage}>
          <Image
            src="/images/about/campo-riego-ilustrativo.webp"
            alt="Imagen ilustrativa de una bomba de riego junto a un campo de cultivo entre montañas"
            fill
            priority
            unoptimized
            sizes="(max-width: 900px) 100vw, 50vw"
          />
        </div>
      </section>

      <section className={styles.story}>
        <div>
          <Reveal as="span" className="eyebrow">Nuestra historia</Reveal>
          <AnimatedTitle lines={["El trabajo no termina cuando", "entregamos un equipo."]} />
        </div>
        <Reveal className={styles.storyCopy} delay={0.16}>
          <p>GreenBel distribuye equipos de aspersión, bombeo, implementos y repuestos para agricultores, técnicos, comercios agrícolas y empresas de jardinería en Guatemala.</p>
          <p>Nuestra forma de trabajar parte de una pregunta sencilla: ¿qué necesitas resolver? Desde ahí comparamos opciones y acompañamos el mantenimiento para extender la vida útil del equipo.</p>
        </Reveal>
      </section>

      <section className={styles.values} aria-labelledby="about-values-title">
        <div className={styles.valuesInner}>
          <div className={styles.sectionHeading}>
            <Reveal as="span" className="eyebrow">Lo que nos guía</Reveal>
            <AnimatedTitle id="about-values-title" lines={["Experiencia técnica", "con trato cercano."]} />
          </div>
          <div className={styles.valueGrid}>
            {values.map(({ Icon, title, text }, index) => (
              <Reveal key={title} className={styles.valueReveal} delay={index * 0.055} distance={14}>
                <article className={styles.valueCard}>
                  <span className={styles.valueIcon} aria-hidden="true"><Icon size={30} strokeWidth={1.7} /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.mission}>
        <div className={styles.statements}>
          <article className={styles.statement}>
            <div className={styles.statementHeading}>
              <span className={styles.statementNumber} aria-hidden="true">01</span>
              <AnimatedTitle lines={["Misión"]} />
            </div>
            <p>Facilitar equipos y soluciones técnicas adecuadas para que nuestros clientes trabajen con confianza y continuidad.</p>
          </article>
          <article className={styles.statement}>
            <div className={styles.statementHeading}>
              <span className={styles.statementNumber} aria-hidden="true">02</span>
              <AnimatedTitle lines={["Visión"]} />
            </div>
            <p>Ser un aliado reconocido por su acompañamiento, conocimiento técnico y respaldo postventa en Guatemala.</p>
          </article>
        </div>
        <div className={styles.missionImage}>
          <Image src="/images/about/asesoria-campo-greenbel.jpeg" alt="Asesoría técnica GreenBel en Guatemala" fill unoptimized sizes="(max-width: 900px) 100vw, 50vw" />
        </div>
      </section>

      <PublicBrands />
    </div>
  );
}
