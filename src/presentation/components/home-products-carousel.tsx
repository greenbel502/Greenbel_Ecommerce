"use client";

import { ChevronLeft, ChevronRight, MoveHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Product } from "@/domain/entities/product";
import { ProductCard } from "./product-card";
import styles from "./home-products-carousel.module.css";

export function HomeProductsCarousel({ products }: { products: Product[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const trackId = useId();
  const hintId = useId();
  const [position, setPosition] = useState({
    previous: false,
    next: products.length > 3,
    start: 1,
    end: Math.min(3, products.length),
  });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function updatePosition() {
      if (!track) return;
      const item = track.firstElementChild;
      if (!(item instanceof HTMLElement)) return;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const step = item.getBoundingClientRect().width + gap;
      const first = Math.round(track.scrollLeft / step);
      const visible = Math.max(1, Math.round((track.clientWidth + gap) / step));
      setPosition({
        previous: track.scrollLeft > 2,
        next: track.scrollLeft < track.scrollWidth - track.clientWidth - 2,
        start: first + 1,
        end: Math.min(products.length, first + visible),
      });
    }

    updatePosition();
    track.addEventListener("scroll", updatePosition, { passive: true });
    const observer = new ResizeObserver(updatePosition);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", updatePosition);
      observer.disconnect();
    };
  }, [products.length]);

  function move(direction: number | "start" | "end") {
    const track = trackRef.current;
    const item = track?.firstElementChild;
    if (!track || !(item instanceof HTMLElement)) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "instant"
      : "smooth";
    if (direction === "start" || direction === "end") {
      track.scrollTo({
        left: direction === "start" ? 0 : track.scrollWidth,
        behavior,
      });
      return;
    }
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({
      left: direction * (item.getBoundingClientRect().width + gap),
      behavior,
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      move(event.key === "Home" ? "start" : "end");
    }
  }

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-label="Selección de productos GreenBel"
    >
      <div className={styles.toolbar}>
        <span className={styles.hint} id={hintId}>
          <MoveHorizontal size={17} aria-hidden="true" /> Desliza para explorar
        </span>
        <div className={styles.navigation}>
          <span
            className={styles.counter}
            aria-live="polite"
            aria-atomic="true"
          >
            {position.start === position.end
              ? position.start
              : `${position.start}–${position.end}`}{" "}
            de {products.length}
          </span>
          <button
            type="button"
            className={styles.control}
            aria-label="Ver productos anteriores"
            aria-controls={trackId}
            disabled={!position.previous}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.control}
            aria-label="Ver más productos"
            aria-controls={trackId}
            disabled={!position.next}
            onClick={() => move(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul
        className={styles.track}
        id={trackId}
        ref={trackRef}
        tabIndex={0}
        aria-label="Productos de la selección"
        aria-describedby={hintId}
        onKeyDown={handleKeyDown}
      >
        {products.map((product) => (
          <li className={styles.item} key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}
