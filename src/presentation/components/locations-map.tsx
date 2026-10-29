"use client";

import { useId, useState, type CSSProperties } from "react";
import { MapPin } from "lucide-react";
import { DEPARTMENTS, type PublicLocation } from "@/lib/contacts/locations";
import mapData from "../../../public/maps/guatemala-departments.json";
import styles from "./locations-map.module.css";

type Props = {
  locations: readonly PublicLocation[];
  company: PublicLocation["company"];
  title?: string;
  description?: string;
  compact?: boolean;
};

type Marker = {
  key: string;
  x: number;
  y: number;
  locations: PublicLocation[];
  approximate: boolean;
};

function coordinates(latitude: number, longitude: number) {
  const projection = mapData.projection;
  const mercator =
    (Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) * 180) /
    Math.PI;
  return {
    x:
      projection.offsetX +
      (longitude - projection.minLongitude) * projection.scale,
    y:
      projection.offsetY +
      (projection.maxMercatorLatitude - mercator) * projection.scale,
  };
}

function markersFor(locations: readonly PublicLocation[]): Marker[] {
  const groups = new Map<string, Marker>();
  for (const location of locations) {
    const department = mapData.departments.find(
      (item) => item.id === location.department,
    );
    if (!department) continue;
    const exactPoint =
      location.latitude !== null && location.longitude !== null
        ? coordinates(location.latitude, location.longitude)
        : null;
    // Coordinates at the broader validation-box edges can fall outside the
    // displayed country. Keep that location visible, without claiming an exact pin.
    const approximate =
      !exactPoint ||
      exactPoint.x < 12 ||
      exactPoint.x > mapData.width - 12 ||
      exactPoint.y < 32 ||
      exactPoint.y > mapData.height - 12;
    const key = approximate
      ? location.department
      : `${location.latitude}:${location.longitude}`;
    const point = approximate
      ? { x: department.center[0], y: department.center[1] }
      : exactPoint!;
    const group = groups.get(key);
    if (group) group.locations.push(location);
    else groups.set(key, { key, ...point, locations: [location], approximate });
  }
  return [...groups.values()];
}

export function LocationsMap({
  locations: allLocations,
  company,
  title,
  description,
  compact = false,
}: Props) {
  const id = useId();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const locations = allLocations.filter(
    (location) => location.company === company,
  );
  const departments = DEPARTMENTS.filter((department) =>
    locations.some((item) => item.department === department.id),
  );
  const exactLocations = locations.filter(
    (location) =>
      location.address.trim() ||
      (location.latitude !== null && location.longitude !== null),
  );
  const departmentReferencesOnly =
    locations.length > 0 && exactLocations.length === 0;
  const markers = markersFor(locations);
  const activeDepartment = markers.find((marker) => marker.key === activeKey)
    ?.locations[0].department;
  const organization =
    company === "greenbel" ? "GreenBel" : "Cooperativa Concepción R.L.";
  const titleText =
    title ??
    (company === "greenbel"
      ? "Encuéntranos cerca de ti."
      : "Conoce la presencia de la cooperativa.");

  return (
    <section
      className={`${styles.shell} ${compact ? styles.compact : ""}`}
      aria-labelledby={`${id}-title`}
    >
      <header className={styles.heading}>
        <span className={styles.eyebrow}>
          <MapPin size={15} aria-hidden="true" />
          {departmentReferencesOnly
            ? "Presencia por departamento"
            : "Ubicaciones"}{" "}
          · {organization}
        </span>
        <h2 id={`${id}-title`}>{titleText}</h2>
        <p>
          {description ??
            (departmentReferencesOnly
              ? "Pasa el cursor o toca un marcador para ver su nombre. Las posiciones son aproximadas por departamento."
              : "Pasa el cursor o toca un marcador para ver el nombre de la ubicación.")}
        </p>
        {locations.length > 0 && (
          <div className={styles.counts}>
            {exactLocations.length > 0 && (
              <span>
                <strong>{exactLocations.length}</strong>{" "}
                {exactLocations.length === 1 ? "ubicación" : "ubicaciones"}
              </span>
            )}
            <span>
              <strong>{departments.length}</strong>{" "}
              {departments.length === 1 ? "departamento" : "departamentos"}
            </span>
          </div>
        )}
      </header>
      <div className={styles.content}>
        <div className={styles.mapColumn}>
          <div className={styles.map}>
            <svg
              viewBox={`0 0 ${mapData.width} ${mapData.height}`}
              role="img"
              aria-label={`Mapa de Guatemala con presencia de ${organization} en ${departments.length} departamentos`}
              className={styles.geography}
            >
              <title>{`Ubicaciones de ${organization} en Guatemala`}</title>
              {mapData.departments.map((department) => {
                const available = departments.some(
                  (item) => item.id === department.id,
                );
                return (
                  <path
                    key={department.id}
                    d={department.path}
                    fillRule="evenodd"
                    className={`${styles.department} ${available ? styles.covered : ""} ${activeDepartment === department.id ? styles.selectedDepartment : ""}`}
                  >
                    <title>{`${department.name}${available ? ": presencia registrada" : ""}`}</title>
                  </path>
                );
              })}
            </svg>
            {markers.map((marker) => {
              const active = activeKey === marker.key;
              const department = DEPARTMENTS.find(
                (item) => item.id === marker.locations[0].department,
              )?.name;
              const label =
                marker.locations.length > 1
                  ? `${department}: ${marker.locations.map((location) => location.name).join(" · ")}`
                  : marker.locations[0].name === department
                    ? department
                    : `${marker.locations[0].name} · ${department}`;
              const tooltipId = `${id}-marker-${marker.locations[0].id}`;
              return (
                <button
                  key={marker.key}
                  type="button"
                  className={`${styles.marker} ${active ? styles.activeMarker : ""}`}
                  style={{
                    left: `${(marker.x / mapData.width) * 100}%`,
                    top: `${(marker.y / mapData.height) * 100}%`,
                  }}
                  aria-label={`${marker.locations.length > 1 ? `${marker.locations.length} referencias en ${department}` : marker.locations[0].name === department ? department : `${marker.locations[0].name}, ${department}`}${marker.approximate ? ". Posición aproximada por departamento" : ""}`}
                  aria-describedby={active ? tooltipId : undefined}
                  onMouseEnter={() => setActiveKey(marker.key)}
                  onMouseLeave={(event) => {
                    if (document.activeElement !== event.currentTarget)
                      setActiveKey(null);
                  }}
                  onFocus={() => setActiveKey(marker.key)}
                  onBlur={() => setActiveKey(null)}
                  onClick={() => setActiveKey(marker.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setActiveKey(null);
                    }
                  }}
                >
                  <span className={styles.pin}>
                    {/* A local original mark keeps the pin legible at small sizes. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        company === "greenbel"
                          ? "/favicon.svg"
                          : "/images/cooperativa-concepcion-color.png"
                      }
                      alt=""
                    />
                    {marker.locations.length > 1 && (
                      <span className={styles.markerCount}>
                        {marker.locations.length}
                      </span>
                    )}
                  </span>
                  {active && (
                    <span
                      id={tooltipId}
                      role="tooltip"
                      className={styles.markerTip}
                      style={
                        {
                          "--tooltip-translate":
                            marker.x < mapData.width / 3
                              ? "0%"
                              : marker.x > (mapData.width * 2) / 3
                                ? "-100%"
                                : "-50%",
                        } as CSSProperties
                      }
                    >
                      {label}
                    </span>
                  )}
                </button>
              );
            })}
            <span className={styles.countryName}>Guatemala</span>
          </div>
          <div className={styles.mapLegend}>
            <span>
              <i aria-hidden="true" /> Departamentos con presencia
            </span>
            <small>
              Los marcadores aproximados indican presencia por departamento, no
              una dirección exacta.
            </small>
          </div>
          <small className={styles.attribution}>
            Mapa:{" "}
            <a
              href="https://www.geoboundaries.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              geoBoundaries
            </a>{" "}
            · ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap
            </a>{" "}
            ·{" "}
            <a
              href="/maps/guatemala-departments-LICENSE.txt"
              target="_blank"
              rel="noopener noreferrer"
            >
              ODbL
            </a>
          </small>
        </div>
        {locations.length === 0 && (
          <p className={styles.empty}>
            Las ubicaciones de {organization} están por confirmar.
          </p>
        )}
      </div>
    </section>
  );
}
