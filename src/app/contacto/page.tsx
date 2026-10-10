import type { Metadata } from "next";
import { Clock3, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { ContactForm } from "@/presentation/components/contact-form";
import { AnimatedTitle, Reveal } from "@/presentation/components/motion-primitives";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Información de contacto y consultas sobre equipos agrícolas y repuestos GreenBel."
};

const questions = [
  ["¿Los precios y existencias son definitivos?", "Las fichas marcadas como demostración DEV contienen datos ficticios. El carrito no reserva existencias ni garantiza precios. Al emitir una cotización, el servidor comprueba los datos vigentes; las compras aún no están habilitadas."],
  ["¿Puedo pedir ayuda para elegir?", "Puedes registrar una consulta con el formulario. Solo queda guardada si recibes una confirmación en pantalla; las notificaciones por correo están pausadas."],
  ["¿Ofrecen servicio técnico?", "La disponibilidad y condiciones del servicio técnico deben confirmarse con GreenBel."],
  ["¿Hacen entregas en toda Guatemala?", "La cobertura y el costo de cada destino deben confirmarse antes de aceptar un pedido."]
];

export default function ContactPage() {
  return (
    <>
      <section className="contact-hero">
        <Reveal as="span" className="eyebrow light">Contacto GreenBel</Reveal>
        <AnimatedTitle as="h1" lines={["Prepara tu consulta", "sobre equipos y repuestos."]} delay={0.05} />
        <Reveal as="p" delay={0.2}>
          Puedes registrar una consulta. La pantalla confirmará el registro únicamente si el servidor guardó tus datos. Las notificaciones por correo permanecen pausadas.
        </Reveal>
      </section>
      <section className="contact-layout-new">
        <div className="contact-side">
          <div className="contact-cards">
            <article><Phone /><span><small>Teléfono</small><strong>Por confirmar</strong></span></article>
            <article><MessageCircle /><span><small>WhatsApp</small><strong>Por confirmar</strong></span></article>
            <article><Mail /><span><small>Correo de atención</small><strong>Por confirmar</strong></span></article>
            <article><Clock3 /><span><small>Horario</small><strong>Por confirmar</strong></span></article>
          </div>
          <div className="map-placeholder">
            <MapPin />
            <span><strong>Guatemala</strong><small>Ubicación y cobertura por confirmar</small></span>
          </div>
        </div>
        <ContactForm />
      </section>
      <section className="faq-section">
        <div>
          <Reveal as="span" className="eyebrow">Preguntas frecuentes</Reveal>
          <AnimatedTitle lines={["Información antes", "de contactarnos."]} />
        </div>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
