import Link from "next/link";
import {
  Boxes,
  BookOpen,
  ClipboardList,
  FileText,
  HandCoins,
  MessageSquare,
  Package,
  Settings2,
  Star,
  Truck,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { requireStaffActor } from "@/lib/server/staff-authorization";
export default async function AdminHome() {
  const actor = await requireStaffActor(["admin", "operator"]);
  const modules = [
    {
      href: "ventas",
      title: "Ventas y posventa",
      text: "Pedidos, preparación, pagos de prueba y atención de casos.",
      icon: ClipboardList,
    },
    {
      href: "inventario",
      title: "Inventario",
      text: "Existencias compartidas, entradas, ajustes y ventas físicas.",
      icon: Boxes,
    },
    {
      href: "envios",
      title: "Envíos externos",
      text: "Guías, entregas y conciliación manual de depósitos.",
      icon: Truck,
    },
    ...(actor.role === "admin"
      ? [
          {
            href: "catalogo",
            title: "Catálogo y ofertas",
            text: "Productos, fichas, imágenes, marcas, categorías y promociones.",
            icon: Package,
          },
          {
            href: "cotizaciones",
            title: "Cotizaciones",
            text: "Documentos originales y descargas privadas.",
            icon: FileText,
          },
          {
            href: "capacitaciones",
            title: "Capacitaciones",
            text: "Videos, portadas y relaciones con los equipos.",
            icon: BookOpen,
          },
          {
            href: "resenas",
            title: "Reseñas",
            text: "Comentarios de compras entregadas pendientes de moderación.",
            icon: Star,
          },
          {
            href: "consultas",
            title: "Consultas",
            text: "Mensajes recibidos; notificación por correo pausada.",
            icon: MessageSquare,
          },
          {
            href: "financiamiento",
            title: "Financiamiento",
            text: "Borradores y cotizaciones; verificación y envío pausados.",
            icon: HandCoins,
          },
          {
            href: "entregas",
            title: "Entregas y pagos",
            text: "Servicios, coberturas, tarifas y configuración de pruebas.",
            icon: Settings2,
          },
          {
            href: "usuarios",
            title: "Usuarios",
            text: "Consultar cuentas y gestionar roles y acceso.",
            icon: Users,
          },
        ]
      : []),
  ];
  return (
    <>
      <span className="eyebrow">Tu espacio de gestión</span>
      <h1>Administración GreenBel</h1>
      <p>
        Elige un módulo para comenzar. Los cambios se aplican al entorno de
        desarrollo.
      </p>
      <div className="admin-dashboard-grid">
        {modules.map((item) => (
          <Link
            className="admin-dashboard-card"
            key={item.href}
            href={`/admin/${item.href}`}
          >
            <item.icon size={24} />
            <strong>{item.title}</strong>
            <p>{item.text}</p>
            <span>
              Abrir módulo{" "}
              <ArrowUpRight size={13} style={{ display: "inline" }} />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
