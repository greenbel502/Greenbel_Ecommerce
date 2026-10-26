import { readPublicGreenbelContacts } from "@/lib/server/contact-settings";
import type { Metadata } from "next";
import { Clock3, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { ContactForm } from "@/presentation/components/contact-form";
import { pageMetadata } from "@/lib/seo";
import {
  AnimatedTitle,
  Reveal,
} from "@/presentation/components/motion-primitives";

export const metadata: Metadata = pageMetadata({
  title: "Contacto",
  description:
    "Contacta a GreenBel en Guatemala. Solicita asesoría e información sobre productos agrícolas, equipos y repuestos mediante nuestros canales de atención.",
  path: "/contacto",
});

const questions = [
  [
    "¿Los precios y existencias son definitivos?",
    "El carrito permite preparar una selección y compartir su PDF por WhatsApp. GreenBel confirma precios, existencias, entrega y forma de pago durante la atención.",
  ],
  [
    "¿Puedo pedir ayuda para elegir?",
    "Puedes registrar una consulta con el formulario sin crear una cuenta. Solo queda guardada si recibes una confirmación en pantalla.",
  ],
  [
    "¿Ofrecen servicio técnico?",
    "La disponibilidad y condiciones del servicio técnico deben confirmarse con GreenBel.",
  ],
  [
    "¿Hacen entregas en toda Guatemala?",
    "La cobertura y el costo de cada destino deben confirmarse antes de aceptar un pedido.",
  ],
];

export const dynamic = "force-dynamic";
export default async function ContactPage() {
  const contact = await readPublicGreenbelContacts();
  return (
    <>
      <section className="contact-hero">
        <Reveal as="span" className="eyebrow light">
          Contacto GreenBel
        </Reveal>
        <AnimatedTitle
          as="h1"
          lines={["Prepara tu consulta", "sobre equipos y repuestos."]}
          delay={0.05}
        />
        <Reveal as="p" delay={0.2}>
          Puedes registrar una consulta. La pantalla confirmará el registro
          únicamente si el servidor guardó tus datos.
        </Reveal>
      </section>
      <section className="contact-layout-new">
        <div className="contact-side">
          <div className="contact-cards">
            <article>
              <Phone />
              <span>
                <small>Teléfono</small>
                <strong>
                  {contact.whatsappNumber
                    ? `+${contact.whatsappNumber}`
                    : "Por confirmar"}
                </strong>
              </span>
            </article>
            <article>
              <MessageCircle />
              <span>
                <small>WhatsApp</small>
                <strong>
                  {contact.whatsappNumber ? (
                    <a
                      href={`https://wa.me/${contact.whatsappNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      +{contact.whatsappNumber}
                    </a>
                  ) : (
                    "Por confirmar"
                  )}
                </strong>
              </span>
            </article>
            <article>
              <Mail />
              <span>
                <small>Correo de atención</small>
                <strong>
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  ) : (
                    "Por confirmar"
                  )}
                </strong>
              </span>
            </article>
            <article>
              <Clock3 />
              <span>
                <small>Horario</small>
                <strong>Por confirmar</strong>
              </span>
            </article>
          </div>
          <div className="map-placeholder">
            <MapPin />
            <span>
              <strong>Guatemala</strong>
              <small>Ubicación y cobertura por confirmar</small>
            </span>
          </div>
        </div>
        <ContactForm />
      </section>
      <section className="faq-section">
        <div>
          <Reveal as="span" className="eyebrow">
            Preguntas frecuentes
          </Reveal>
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
