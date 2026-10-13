"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, GraduationCap, HandCoins, Home, Menu, MessageCircle, Search, ShoppingBag, Sprout, UserRound, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "./brand-logo";
import { HeaderAccountMenu } from "./header-account-menu";
import { useCart } from "@/presentation/providers/cart-provider";

const GlobalSearch = dynamic(
  () => import("./global-search").then((module) => module.GlobalSearch),
  { ssr: false }
);

const links = [
  { href: "/", label: "Inicio", description: "Vista general", icon: Home },
  { href: "/productos", label: "Productos", description: "Catálogo técnico", icon: Sprout },
  { href: "/capacitaciones", label: "Capacitaciones", description: "Videos de uso de equipos", icon: GraduationCap },
  { href: "/financiamiento", label: "Financiamiento", description: "Alianza Concepción", icon: HandCoins },
  { href: "/nosotros", label: "Nosotros", description: "Conoce GreenBel", icon: Users },
  { href: "/contacto", label: "Contacto", description: "Canales de atención", icon: MessageCircle }
];

export function Header() {
  const { itemCount } = useCart();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      document.body.classList.remove("mobile-menu-open");
      document.documentElement.classList.remove("mobile-menu-open");
      return;
    }

    const previousStyles = {
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    };

    document.body.classList.add("mobile-menu-open");
    document.documentElement.classList.add("mobile-menu-open");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("mobile-menu-open");
      document.documentElement.classList.remove("mobile-menu-open");
      document.body.style.overflow = previousStyles.bodyOverflow;
      document.documentElement.style.overflow = previousStyles.htmlOverflow;
    };
  }, [mobileOpen]);

  return (
    <header className="site-header">
      <nav className="nav-shell" aria-label="Navegación principal">
        <Link href="/" className="logo-link" aria-label="GreenBel, inicio"><BrandLogo /></Link>
        <div className="nav-links">
          {links.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>{link.label}</Link>)}
        </div>
        <div className="nav-actions">
          <button className="icon-button" aria-label="Buscar productos" title="Buscar" onClick={() => setSearchOpen(true)}><Search size={19} /></button>
          <Link href="/carrito" className="icon-button cart-button" aria-label={`Ir al carrito, ${itemCount} productos`} title="Carrito"><ShoppingBag size={19} />{itemCount > 0 && <span>{itemCount}</span>}</Link>
          <HeaderAccountMenu onOpen={() => { setMobileOpen(false); setSearchOpen(false); }} />
          <button className={mobileOpen ? "icon-button mobile-menu active" : "icon-button mobile-menu"} aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen((value) => !value)}>
            <motion.span animate={{ rotate: mobileOpen ? 90 : 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </motion.span>
          </button>
        </div>
      </nav>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              className="mobile-menu-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-menu-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              <motion.div
                className="mobile-menu-surface"
                initial={{ y: -18 }}
                animate={{ y: 0 }}
                exit={{ y: -12 }}
                transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mobile-menu-toolbar">
                  <Link href="/" className="logo-link" aria-label="GreenBel, inicio" onClick={() => setMobileOpen(false)}><BrandLogo /></Link>
                  <button type="button" className="icon-button mobile-menu-close" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}><X size={22} /></button>
                </div>
                <nav className="mobile-nav" id="mobile-navigation" aria-label="Navegación móvil">
              <div className="mobile-nav-heading">
                <span id="mobile-menu-title">Explorar GreenBel</span>
                <small>Equipos y respaldo para tu trabajo</small>
              </div>
              <div className="mobile-nav-links">
                {links.map((link, index) => {
                  const Icon = link.icon;
                  const active = pathname === link.href;
                  return (
                    <motion.div key={link.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + index * 0.045 }}>
                      <Link href={link.href} className={active ? "mobile-nav-link active" : "mobile-nav-link"} onClick={() => setMobileOpen(false)}>
                        <span className="mobile-nav-icon"><Icon size={18} /></span>
                        <span className="mobile-nav-copy"><strong>{link.label}</strong><small>{link.description}</small></span>
                        <ChevronRight size={17} />
                      </Link>
                    </motion.div>
                  );
                })}
                <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + links.length * 0.045 }}>
                  <Link href="/cuenta" className={pathname.startsWith("/cuenta") ? "mobile-nav-link active" : "mobile-nav-link"} onClick={() => setMobileOpen(false)}>
                    <span className="mobile-nav-icon"><UserRound size={18} /></span>
                    <span className="mobile-nav-copy"><strong>Mi cuenta</strong><small>Ingresar o ver mi cuenta</small></span>
                    <ChevronRight size={17} />
                  </Link>
                </motion.div>
              </div>
              <Link href="/contacto" className="mobile-nav-cta" onClick={() => setMobileOpen(false)}>
                <MessageCircle size={18} />
                <span><strong>¿Necesitas orientación?</strong><small>Hablar con un asesor</small></span>
                <ChevronRight size={17} />
              </Link>
                </nav>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      {searchOpen && <GlobalSearch open onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
