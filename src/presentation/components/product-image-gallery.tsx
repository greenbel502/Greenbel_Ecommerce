"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryImage = Readonly<{ src: string; alt: string }>;

export function ProductImageGallery({
  images,
  fallbackAlt
}: {
  images: readonly GalleryImage[];
  fallbackAlt: string;
}) {
  const [selected, setSelected] = useState(0);
  const current = images[selected] ?? images[0];
  if (!current) return null;

  return (
    <>
      <div className="product-main-image">
        <Image
          src={current.src}
          alt={current.alt || fallbackAlt}
          fill
          priority
          unoptimized={current.src.startsWith("/api/product-images/")}
          sizes="(max-width: 900px) 100vw, 48vw"
        />
      </div>
      {images.length > 1 && (
        <div className="product-thumbnails" aria-label="Imágenes del producto">
          {images.map((image, index) => (
            <button
              key={image.src}
              type="button"
              aria-label={`Ver imagen ${index + 1} de ${images.length}`}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              <Image
                src={image.src}
                alt=""
                fill
                unoptimized={image.src.startsWith("/api/product-images/")}
                sizes="72px"
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
