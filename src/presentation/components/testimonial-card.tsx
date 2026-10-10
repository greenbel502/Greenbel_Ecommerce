"use client";

import { Star, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { mockTestimonials } from "@/infrastructure/mock/testimonials";

export function TestimonialCard({ testimonial, index }: { testimonial: (typeof mockTestimonials)[number]; index: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      className={`testimonial-card testimonial-card-${index + 1}`}
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.92 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      whileHover={reduceMotion ? undefined : { y: -8, scale: 1.025, rotate: index % 2 === 0 ? -0.7 : 0.7 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      viewport={{ once: true, amount: 0.45 }}
      transition={{ duration: 0.7, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="testimonial-person">
        <span className="testimonial-avatar" aria-hidden="true"><UserRound /></span>
        <span><strong>{testimonial.name}</strong><small>{testimonial.type} · {testimonial.location}</small></span>
      </div>
      <div className="testimonial-stars" aria-label={`${testimonial.rating} de 5 estrellas`}>
        {Array.from({ length: testimonial.rating }).map((_, starIndex) => <Star key={starIndex} fill="currentColor" />)}
      </div>
      <blockquote>“{testimonial.quote}”</blockquote>
    </motion.article>
  );
}
