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
  LockKeyhole,
} from "lucide-react";
import { getPausedAdminModule } from "@/lib/admin-module-status";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { adminTrainingRatings } from "@/lib/server/training-ratings";
import { TrainingStars } from "@/presentation/components/training-stars";
import trainingStyles from "./capacitaciones/training-admin.module.css";
export default async function AdminHome() {
  const actor = await requireStaffActor(["admin", "operator"]);
  const trainingRatings =
    actor.role === "admin" ? await adminTrainingRatings([]) : null;
  const modules = [
    {
      href: "ventas",
      title: "Ventas y posventa",
      text: "Pedidos, preparación y atención posventa.",
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
            text: "Consultas registradas y estado de las notificaciones por Gmail.",
            icon: MessageSquare,
          },
          {
            href: "financiamiento",
            title: "Financiamiento",
            text: "Solicitudes de información y envío de cotizaciones a la cooperativa.",
            icon: HandCoins,
          },
          {
            href: "entregas",
            title: "Entregas y pagos",
            text: "Servicios, coberturas, tarifas y métodos de pago.",
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
        {modules.map((item) => {
          if (getPausedAdminModule(`/admin/${item.href}`))
            return (
              <article
                className="admin-dashboard-card is-disabled"
                key={item.href}
              >
                <item.icon size={24} aria-hidden="true" />
                <strong>{item.title}</strong>
                <p>
                  Temporalmente inhabilitado. Las compras se atienden por
                  WhatsApp.
                </p>
                <span className="admin-paused-badge">
                  <LockKeyhole size={13} aria-hidden="true" /> Inhabilitado
                </span>
              </article>
            );
          return (
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
          );
        })}
      </div>
      {actor.role === "admin" && (
        <section
          className={trainingStyles.dashboardRatings}
          aria-labelledby="dashboard-training-rating-title"
        >
          <div>
            <span className="eyebrow">La opinión de tus clientes</span>
            <h2 id="dashboard-training-rating-title">
              Calificaciones de capacitaciones
            </h2>
            <TrainingStars
              average={trainingRatings?.overview.average_rating ?? null}
              count={Number(trainingRatings?.overview.rating_count ?? 0)}
              unavailable={!trainingRatings}
            />
            <p>
              {trainingRatings
                ? `${Number(trainingRatings.overview.rating_count)} calificaciones en ${Number(trainingRatings.overview.rated_trainings)} capacitaciones.`
                : "No se pudieron consultar las calificaciones."}
            </p>
          </div>
          <Link href="/admin/capacitaciones" className="secondary-dark-button">
            Ver por capacitación <ArrowUpRight size={16} />
          </Link>
        </section>
      )}
    </>
  );
}
