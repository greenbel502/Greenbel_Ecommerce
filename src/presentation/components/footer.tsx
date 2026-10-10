import Link from "next/link";
import { Clock3, Mail, MapPin, MessageCircle } from "lucide-react";
import { BrandLogo } from "./brand-logo";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand"><BrandLogo variant="light" /><p>Equipos, repuestos y acompañamiento técnico para mantener el trabajo agrícola en marcha.</p><Link className="footer-whatsapp" href="/contacto"><MessageCircle size={17} /> Hablar con un asesor</Link></div>
        <div><h2>Explorar</h2><Link href="/productos">Productos</Link><Link href="/financiamiento">Financiamiento</Link><Link href="/nosotros">Nosotros</Link><Link href="/contacto">Contacto</Link><Link href="/carrito">Carrito</Link></div>
        <div><h2>Soluciones</h2><Link href="/productos?categoria=aspersion">Aspersión</Link><Link href="/productos?categoria=bombeo">Bombeo</Link><Link href="/productos?categoria=repuestos">Repuestos</Link><Link href="/contacto">Servicio técnico</Link></div>
        <div><h2>Contacto</h2><span><Mail size={16} /> ventas@greenbel.gt</span><span><MapPin size={16} /> Guatemala</span><span><Clock3 size={16} /> Lun–Vie, 8:00–17:00</span></div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} GreenBel. Ecommerce demostrativo.</span><div><Link href="/legal/privacidad">Privacidad</Link><Link href="/legal/terminos">Términos</Link><Link href="/legal/garantias">Garantías</Link></div></div>
    </footer>
  );
}
