"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3, Mail, MapPin, MessageCircle } from "lucide-react";
import { BrandLogo } from "./brand-logo";

export function FooterView({
  contacts,
}: {
  contacts: { whatsappNumber: string | null; email: string | null };
}) {
  const pathname = usePathname();
  const compact = [
    "/cuenta/ingresar",
    "/cuenta/registro",
    "/cuenta/recuperar",
    "/cuenta/restablecer",
  ].includes(pathname);
  if (compact)
    return (
      <footer className="footer footer-compact">
        <div className="footer-compact-inner">
          <div className="footer-compact-brand">
            <Link href="/" aria-label="GreenBel, volver al inicio">
              <BrandLogo variant="light" />
            </Link>
            <span>
              © {new Date().getFullYear()} GreenBel. Ecommerce demostrativo.
            </span>
          </div>
          <nav aria-label="Información legal">
            <Link href="/legal/privacidad">Privacidad</Link>
            <Link href="/legal/terminos">Términos</Link>
            <Link href="/legal/garantias">Garantías</Link>
          </nav>
        </div>
      </footer>
    );
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <BrandLogo variant="light" />
          <p>
            Equipos, repuestos y acompañamiento técnico para mantener el trabajo
            agrícola en marcha.
          </p>
          <Link
            className="footer-whatsapp"
            href={
              contacts.whatsappNumber
                ? `https://wa.me/${contacts.whatsappNumber}`
                : "/contacto"
            }
            target={contacts.whatsappNumber ? "_blank" : undefined}
            rel={contacts.whatsappNumber ? "noopener noreferrer" : undefined}
          >
            <MessageCircle size={17} /> Hablar con un asesor
          </Link>
        </div>
        <div>
          <h2>Explorar</h2>
          <Link href="/productos">Productos</Link>
          <Link href="/financiamiento">Financiamiento</Link>
          <Link href="/nosotros">Nosotros</Link>
          <Link href="/contacto">Contacto</Link>
          <Link href="/carrito">Carrito</Link>
        </div>
        <div>
          <h2>Soluciones</h2>
          <Link href="/productos?categoria=aspersion">Aspersión</Link>
          <Link href="/productos?categoria=bombeo">Bombeo</Link>
          <Link href="/productos?categoria=repuestos">Repuestos</Link>
          <Link href="/contacto">Servicio técnico</Link>
        </div>
        <div>
          <h2>Contacto</h2>
          <span>
            <Mail size={16} />{" "}
            {contacts.email ? (
              <a href={`mailto:${contacts.email}`}>{contacts.email}</a>
            ) : (
              "Correo por confirmar"
            )}
          </span>
          <span>
            <MapPin size={16} /> Guatemala
          </span>
          <span>
            <Clock3 size={16} /> Lun–Vie, 8:00–17:00
          </span>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} GreenBel. Ecommerce demostrativo.
        </span>
        <div>
          <Link href="/legal/privacidad">Privacidad</Link>
          <Link href="/legal/terminos">Términos</Link>
          <Link href="/legal/garantias">Garantías</Link>
        </div>
      </div>
    </footer>
  );
}
