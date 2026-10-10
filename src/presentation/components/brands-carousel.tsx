"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

const brands = [
  { name: "Kawashima", logo: "/images/brands/kawashima.png", width: 251, height: 30 },
  { name: "Parazzini", logo: "/images/brands/parazzini.png", width: 270, height: 64 },
  { name: "Takashi", logo: "/images/brands/takashi.png", width: 251, height: 36 },
  { name: "Bertolini", logo: "/images/brands/bertolini.png", width: 500, height: 146 },
];

const marqueeBrands = [...brands, ...brands, ...brands];

export function BrandsCarousel() {
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
        <span className="eyebrow">Marcas de demostración DEV</span>
        <h2 id="brands-title">Conoce el catálogo.</h2>
        <p>Los nombres y logotipos de este mockup están pendientes de validación comercial.</p>
      </motion.div>

      <div className="brands-marquee" aria-label="Carrusel de marcas aliadas">
        <div className="brands-track">
          {[0, 1].map((group) => (
            <div className="brands-set" key={group} aria-hidden={group === 1}>
              {marqueeBrands.map((brand, index) => (
                <motion.div
                  className="brand-item"
                  key={`${group}-${brand.name}-${index}`}
                  aria-hidden={group === 1 || index >= brands.length}
                  initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.92 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                  whileHover={reduceMotion ? undefined : { y: -10, scale: 1.055, rotate: index % 2 === 0 ? -1 : 1 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ type: "spring", stiffness: 210, damping: 18, delay: (index % 4) * 0.06 }}
                >
                  <motion.span
                    className="brand-logo-wrap"
                    animate={reduceMotion ? undefined : { y: [0, -4, 0], rotate: [0, index % 2 === 0 ? 0.8 : -0.8, 0] }}
                    transition={{ duration: 3.4 + (index % 4) * 0.25, repeat: Infinity, ease: "easeInOut", delay: (index % 4) * 0.18 }}
                  >
                    <Image
                      src={brand.logo}
                      alt={group === 0 && index < brands.length ? `Logo de ${brand.name}` : ""}
                      width={brand.width}
                      height={brand.height}
                      sizes="180px"
                    />
                  </motion.span>
                  <strong>{brand.name}</strong>
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
