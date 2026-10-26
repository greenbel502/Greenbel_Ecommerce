"use client";
import { FormValidation } from "./form-validation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  FileText,
  HandCoins,
  LayoutGrid,
  LogOut,
  LockKeyhole,
  Menu,
  MessageSquare,
  Package,
  PanelLeftClose,
  Phone,
  Settings2,
  ShieldCheck,
  Star,
  Truck,
  Users,
  X,
} from "lucide-react";
import { BrandLogo } from "@/presentation/components/brand-logo";
import { signOutAction } from "@/app/cuenta/actions";
import type { StaffRole } from "@/lib/server/staff-authorization";
import { getPausedAdminModule } from "@/lib/admin-module-status";
const sections = [
  {
    title: "Gestión",
    items: [
      { path: "", label: "Inicio", icon: LayoutGrid },
      { path: "/ventas", label: "Ventas y posventa", icon: ClipboardList },
      { path: "/inventario", label: "Inventario", icon: Boxes },
      { path: "/envios", label: "Envíos externos", icon: Truck },
      {
        path: "/cotizaciones",
        label: "Cotizaciones",
        icon: FileText,
        admin: true,
      },
    ],
  },
  {
    title: "Catálogo y contenido",
    items: [
      {
        path: "/catalogo",
        label: "Catálogo y ofertas",
        icon: Package,
        admin: true,
      },
      {
        path: "/capacitaciones",
        label: "Capacitaciones",
        icon: BookOpen,
        admin: true,
      },
      { path: "/chatbot", label: "Bell · Asistente", icon: Bot, admin: true },
      { path: "/resenas", label: "Reseñas", icon: Star, admin: true },
      {
        path: "/consultas",
        label: "Consultas",
        icon: MessageSquare,
        admin: true,
      },
      {
        path: "/financiamiento",
        label: "Financiamiento",
        icon: HandCoins,
        admin: true,
      },
    ],
  },
  {
    title: "Configuración",
    items: [
      { path: "/contacto", label: "Contacto", icon: Phone, admin: true },
      {
        path: "/entregas",
        label: "Entregas y pagos",
        icon: Settings2,
        admin: true,
      },
      { path: "/usuarios", label: "Usuarios", icon: Users, admin: true },
    ],
  },
];
export function AdminShell({
  children,
  role,
  name,
  email,
  development,
}: {
  children: React.ReactNode;
  role: StaffRole;
  name: string;
  email: string;
  development: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    setCollapsed(localStorage.getItem("greenbel:admin-collapsed") === "true");
  }, []);
  useEffect(() => {
    setMobile(false);
  }, [pathname]);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobile(false);
        menuButton.current?.focus();
      }
      if (e.key !== "Tab") return;
      const controls = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [mobile]);
  const current = sections
    .flatMap((s) => s.items)
    .find((i) => i.path && pathname.startsWith(`/admin${i.path}`));
  const title = pathname.match(/^\/admin\/ventas\/[^/]+/)
    ? "Detalle del pedido"
    : current?.label || "Inicio";
  function toggle() {
    setCollapsed((value) => {
      localStorage.setItem("greenbel:admin-collapsed", String(!value));
      return !value;
    });
  }
  return (
    <div
      className={`admin-app${collapsed ? " is-collapsed" : ""}${mobile ? " is-mobile-open" : ""}`}
    >
      <a href="#admin-content" className="admin-skip">
        Saltar al contenido
      </a>
      {mobile && (
        <div
          className="admin-backdrop"
          onClick={() => setMobile(false)}
          aria-hidden="true"
        />
      )}
      <aside
        ref={sidebar}
        className="admin-sidebar"
        id="admin-sidebar"
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile || undefined}
        aria-label="Navegación de administración"
      >
        <div className="admin-brand">
          <Link href="/admin" aria-label="GreenBel, inicio administrativo">
            <BrandLogo variant="light" />
            <span>Administración</span>
          </Link>
          <button
            className="admin-mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>
        <nav>
          {sections.map((section) => {
            const items = section.items.filter(
              (i) => !("admin" in i && i.admin) || role === "admin",
            );
            return (
              items.length > 0 && (
                <div className="admin-nav-group" key={section.title}>
                  <p>{section.title}</p>
                  {items.map((item) => {
                    if (getPausedAdminModule(`/admin${item.path}`))
                      return (
                        <span
                          key={item.path}
                          className="admin-nav-disabled"
                          role="link"
                          aria-disabled="true"
                          aria-label={`${item.label}, inhabilitado`}
                          title={`${item.label}: inhabilitado temporalmente`}
                        >
                          <item.icon size={19} aria-hidden="true" />
                          <span className="admin-nav-disabled-copy">
                            <span>{item.label}</span>
                            <small>Inhabilitado</small>
                          </span>
                          <LockKeyhole
                            size={13}
                            className="admin-nav-disabled-lock"
                            aria-hidden="true"
                          />
                        </span>
                      );
                    const active = item.path
                      ? pathname.startsWith(`/admin${item.path}`)
                      : pathname === "/admin";
                    return (
                      <Link
                        key={item.path}
                        href={`/admin${item.path}`}
                        title={item.label}
                        aria-current={active ? "page" : undefined}
                      >
                        <item.icon size={19} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )
            );
          })}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/" title="Volver a la tienda">
            <ArrowUpRight size={18} />
            <span>Volver a la tienda</span>
          </Link>
          <button
            onClick={toggle}
            className="admin-collapse"
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            aria-expanded={!collapsed}
          >
            <PanelLeftClose size={18} />
            <span>Colapsar menú</span>
          </button>
        </div>
      </aside>
      <div className="admin-workspace" inert={mobile || undefined}>
        <header className="admin-topbar">
          <div className="admin-page-title">
            <button
              ref={menuButton}
              className="admin-menu-toggle"
              aria-label="Abrir menú"
              aria-controls="admin-sidebar"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>
              Administración <ChevronLeft size={13} className="admin-crumb" />{" "}
              <strong>{title}</strong>
            </span>
          </div>
          <div className="admin-topbar-right">
            {development && <span className="admin-env">
              <span /> DEV
            </span>}
            <details className="admin-account">
              <summary>
                <span className="admin-initial">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="admin-account-name">
                  <strong>{name}</strong>
                  <small>
                    {role === "admin" ? "Administrador" : "Operador"}
                  </small>
                </span>
                <ChevronDown size={15} />
              </summary>
              <div className="admin-account-menu">
                <p>{email}</p>
                <Link href="/cuenta">
                  <ShieldCheck size={17} /> Mi cuenta
                </Link>
                <Link href="/">
                  <ArrowUpRight size={17} /> Ir a la tienda
                </Link>
                <form action={signOutAction}>
                  <button type="submit">
                    <LogOut size={17} /> Cerrar sesión
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main id="admin-content" className="admin-content" tabIndex={-1}>
          <FormValidation />
          {children}
        </main>
      </div>
    </div>
  );
}
