import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import {
  PAUSED_ADMIN_MODULES,
  type PausedAdminModule,
} from "@/lib/admin-module-status";

export function PausedModule({ module }: { module: PausedAdminModule }) {
  return (
    <section
      className="admin-paused-module"
      aria-labelledby="paused-module-title"
    >
      <div className="admin-paused-icon" aria-hidden="true">
        <LockKeyhole size={27} />
      </div>
      <span className="admin-paused-badge">Inhabilitado</span>
      <h1 id="paused-module-title">{PAUSED_ADMIN_MODULES[module].title}</h1>
      <p>
        Este módulo está inhabilitado temporalmente. Por ahora, las compras se
        atienden por WhatsApp desde el carrito.
      </p>
      <Link href="/admin" className="secondary-dark-button">
        <ArrowLeft size={18} /> Volver al inicio
      </Link>
    </section>
  );
}
