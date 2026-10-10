"use client";

import { motion } from "motion/react";

type BellLoaderProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const fallingLeaves = [
  { left: "10%", delay: 0, duration: 4.8, drift: 22, scale: 0.72 },
  { left: "26%", delay: 1.4, duration: 5.6, drift: -18, scale: 0.5 },
  { left: "43%", delay: 0.7, duration: 5.1, drift: 26, scale: 0.64 },
  { left: "61%", delay: 2.1, duration: 5.8, drift: -24, scale: 0.56 },
  { left: "78%", delay: 1, duration: 4.9, drift: 20, scale: 0.76 },
  { left: "90%", delay: 2.8, duration: 5.4, drift: -16, scale: 0.46 }
];

export function BellLoader({ className = "", size = "md" }: BellLoaderProps) {
  return (
    <motion.div
      className={`bell-loader bell-loader-${size} ${className}`}
      aria-hidden="true"
      initial={false}
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.span
        className="bell-loader-halo"
        animate={{ scale: [0.86, 1.08, 0.86], opacity: [0.28, 0.52, 0.28] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="bell-loader-ring"
        animate={{ rotate: 360 }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "linear" }}
      />
      <span className="bell-loader-leaves">
        {fallingLeaves.map((leaf, index) => (
          <motion.i
            key={index}
            className="bell-loader-leaf"
            style={{ left: leaf.left }}
            initial={false}
            animate={{
              y: [-24, 220],
              x: [0, leaf.drift, leaf.drift * 0.35],
              rotate: [index % 2 === 0 ? -20 : 25, index % 2 === 0 ? 210 : -190],
              scale: [leaf.scale, leaf.scale * 1.08, leaf.scale],
              opacity: [0, 0.82, 0.58, 0]
            }}
            transition={{
              duration: leaf.duration,
              delay: leaf.delay,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.14, 0.78, 1]
            }}
          />
        ))}
      </span>
      <motion.img
        className="bell-loader-image"
        src="/images/botbel-loader.webp"
        alt=""
        draggable={false}
        animate={{ rotate: [-2, 2, -2], scale: [1, 1.025, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="bell-loader-shadow"
        animate={{ scaleX: [1, 0.74, 1], opacity: [0.24, 0.1, 0.24] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
