"use client";

import Image from "next/image";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import type { PublicBrand } from "@/domain/entities/brand";
import { motion, useReducedMotion } from "motion/react";

export function BrandsCarousel({
  brands,
  unavailable = false,
}: {
  brands: readonly PublicBrand[];
  unavailable?: boolean;
}) {
  const marqueeBrands = [...brands, ...brands, ...brands];
  const reduceMotion = useReducedMotion();

  return (
    <section className="brands-band" aria-labelledby="brands-title">
      <motion.div
        className="brands-heading"
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="eyebrow">Nuestras marcas</span>
        <h2 id="brands-title">Encuentra tu marca.</h2>
        <p>Explora los productos de las marcas disponibles en GreenBel.</p>
      </motion.div>

      {brands.length === 0 ? (
        <p className="brands-empty" role="status">
          {unavailable
            ? "No se pudieron cargar las marcas. Intenta de nuevo más tarde."
            : "No hay marcas activas por el momento."}
        </p>
      ) : (
        <div className="brands-marquee" aria-label="Carrusel de marcas">
          <div
            className="brands-track"
            style={{ animationDuration: `${Math.max(30, brands.length * 8)}s` }}
          >
            {[0, 1].map((group) => (
              <div
                className="brands-set"
                key={group}
                aria-hidden={group === 1}
                inert={group === 1}
              >
                {marqueeBrands.map((brand, index) => (
                  <motion.div
                    className="brand-item"
                    data-brand-id={brand.id}
                    key={`${group}-${brand.id}-${index}`}
                    aria-hidden={group === 1 || index >= brands.length}
                    inert={group === 1 || index >= brands.length}
                    initial={
                      reduceMotion ? false : { opacity: 0, y: 18, scale: 0.92 }
                    }
                    whileInView={
                      reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }
                    }
                    whileHover={
                      reduceMotion
                        ? undefined
                        : {
                            y: -10,
                            scale: 1.055,
                            rotate: index % 2 === 0 ? -1 : 1,
                          }
                    }
                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{
                      type: "spring",
                      stiffness: 210,
                      damping: 18,
                      delay: (index % 4) * 0.06,
                    }}
                  >
                    <Link
                      className="brand-catalog-link"
                      href={`/productos?busqueda=${encodeURIComponent(brand.name)}`}
                      aria-label={`Ver productos de ${brand.name}`}
                    >
                      <motion.span
                        className="brand-logo-wrap"
                        animate={
                          reduceMotion
                            ? undefined
                            : {
                                y: [0, -4, 0],
                                rotate: [0, index % 2 === 0 ? 0.8 : -0.8, 0],
                              }
                        }
                        transition={{
                          duration: 3.4 + (index % 4) * 0.25,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: (index % 4) * 0.18,
                        }}
                      >
                        {brand.logoUrl ? (
                          <Image
                            src={brand.logoUrl}
                            alt={
                              group === 0 && index < brands.length
                                ? `Logo de ${brand.name}`
                                : ""
                            }
                            width={180}
                            height={72}
                            unoptimized
                            sizes="180px"
                          />
                        ) : (
                          <span
                            className="brand-missing-logo"
                            aria-hidden="true"
                          >
                            <ImageIcon size={26} />
                          </span>
                        )}
                      </motion.span>
                      <strong>{brand.name}</strong>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
