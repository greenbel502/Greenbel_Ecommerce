"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { BellLoader } from "./bell-loader";

const loadingSteps = [
  "Preparando catálogo técnico",
  "Consultando datos GreenBel",
  "Sincronizando carrito demo",
  "Listo para continuar"
];

export function LoaderDemo() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const currentStep = useMemo(() => {
    const index = Math.min(loadingSteps.length - 1, Math.floor((progress / 100) * loadingSteps.length));
    return loadingSteps[index];
  }, [progress]);

  const simulateLoading = () => {
    setProgress(0);
    setLoading(true);
  };

  useEffect(() => {
    if (!loading) return;

    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(100, current + 4);
        if (next === 100) {
          window.setTimeout(() => setLoading(false), 480);
        }
        return next;
      });
    }, 90);

    return () => window.clearInterval(interval);
  }, [loading]);

  return (
    <section className="loader-demo-shell">
      <div className="loader-demo-copy">
        <span className="eyebrow">Prueba visual</span>
        <h1>Loader Bell IA</h1>
        <p>Esta prueba usa el mismo indicador conectado a la navegación. En producción aparece únicamente mientras Next espera datos o componentes.</p>
        <motion.button
          className="primary-button"
          type="button"
          onClick={simulateLoading}
          disabled={loading}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          {loading ? "Cargando demo..." : "Simular carga"}
        </motion.button>
      </div>

      <div className="loader-demo-card">
        <BellLoader size="lg" />
        <strong>Preparando GreenBel</strong>
        <span>Cargando componentes demo</span>
        <div className="loader-demo-inline-progress" aria-hidden="true">
          <motion.i animate={{ x: ["-42%", "142%"] }} transition={{ duration: 1.45, repeat: Infinity, ease: "easeInOut" }} />
        </div>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            className="loader-demo-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <motion.div
              className="loader-demo-modal"
              initial={{ y: 18, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 12, scale: 0.98 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <BellLoader size="lg" />
              <strong>Preparando experiencia</strong>
              <span>{currentStep}</span>
              <div className="loader-demo-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <motion.i animate={{ width: `${progress}%` }} transition={{ duration: 0.16, ease: "easeOut" }} />
              </div>
              <small>{progress}%</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
