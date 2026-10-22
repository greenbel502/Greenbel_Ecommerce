export default function AdminLoading() {
  return (
    <div
      className="admin-loading"
      role="status"
      aria-label="Cargando información"
    >
      <span>Cargando información…</span>
      <div className="admin-skeleton" />
      <div className="admin-skeleton" />
    </div>
  );
}
