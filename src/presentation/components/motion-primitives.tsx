"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

const titleElements = {
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4
};

const revealElements = {
  div: motion.div,
  p: motion.p,
  span: motion.span,
  section: motion.section,
  aside: motion.aside
};

export const titleContainerVariants = {
  hidden: {},
  visible: (delay = 0) => ({
    transition: {
      delayChildren: delay,
      staggerChildren: 0.11
    }
  })
};

export const titleLineVariants = {
  hidden: { y: "110%", opacity: 0, filter: "blur(4px)" },
  visible: {
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.68, ease }
  }
};

type AnimatedTitleProps = {
  as?: keyof typeof titleElements;
  lines: ReactNode[];
  className?: string;
  id?: string;
  delay?: number;
};

export function AnimatedTitle({ as = "h2", lines, className, id, delay = 0 }: AnimatedTitleProps) {
  const reduceMotion = useReducedMotion();
  const Title = titleElements[as];

  return (
    <Title
      id={id}
      className={className}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "visible"}
      viewport={{ once: true, amount: 0.45 }}
      variants={titleContainerVariants}
      custom={delay}
    >
      {lines.map((line, index) => (
        <span className="title-mask" key={index}>
          <motion.span className="title-mask-inner" variants={titleLineVariants}>
            {line}
          </motion.span>
        </span>
      ))}
    </Title>
  );
}

type RevealProps = {
  as?: keyof typeof revealElements;
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  amount?: number;
};

export function Reveal({ as = "div", children, className, delay = 0, distance = 18, amount = 0.25 }: RevealProps) {
  const reduceMotion = useReducedMotion();
  const Element = revealElements[as];

  return (
    <Element
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: distance, filter: "blur(3px)" }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.62, delay, ease }}
    >
      {children}
    </Element>
  );
}

export function FadeIn({ children, className, delay = 0 }: Omit<RevealProps, "as">) {
  return <Reveal className={className} delay={delay}>{children}</Reveal>;
}
