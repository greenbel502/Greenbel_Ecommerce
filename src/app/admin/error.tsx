"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="admin-empty" role="alert">
      <h1>No se pudo cargar la información</h1>
      <p>
        Inténtalo de nuevo. Si el problema continúa, vuelve al inicio del panel.
      </p>
      <button className="primary-button" onClick={reset}>
        Reintentar
      </button>
      <p>
        <a href="/admin">Ir al inicio del panel</a>
      </p>
    </div>
  );
}
