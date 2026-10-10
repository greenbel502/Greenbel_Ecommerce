import { BellLoader } from "./bell-loader";

type RouteLoadingProps = {
  label?: string;
};

export function RouteLoading({ label = "Preparando GreenBel" }: RouteLoadingProps) {
  return (
    <section className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="route-loading-content">
        <BellLoader size="md" />
        <div className="route-loading-copy">
          <strong>{label}</strong>
          <span>Estamos organizando la información para ti.</span>
        </div>
        <div className="route-loading-track" aria-hidden="true">
          <i />
        </div>
      </div>
    </section>
  );
}
