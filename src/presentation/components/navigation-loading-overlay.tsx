"use client";

import { AnimatePresence, motion } from "motion/react";
import { BellLoader } from "./bell-loader";

export function NavigationLoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="navigation-loader-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: "easeInOut" }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            className="navigation-loader-content"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <BellLoader size="lg" />
            <div className="navigation-loader-copy">
              <strong>Preparando GreenBel</strong>
              <span>Cargando la información de tu próxima página.</span>
            </div>
            <div className="route-loading-track" aria-hidden="true"><i /></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
