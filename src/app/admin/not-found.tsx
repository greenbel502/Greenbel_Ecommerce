import Link from "next/link";
export default function AdminNotFound() {
  return (
    <div className="admin-empty">
      <h1>Esta sección no está disponible</h1>
      <p>El registro no existe o tu cuenta no tiene acceso.</p>
      <Link href="/admin">Volver al panel</Link>
    </div>
  );
}
