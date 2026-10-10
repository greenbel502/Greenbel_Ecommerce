import Image from "next/image";

export function BrandLogo({ variant = "default" }: { variant?: "default" | "light" }) {
  const isLight = variant === "light";

  return (
    <div className={isLight ? "brand-logo brand-logo-light" : "brand-logo"} aria-label="GreenBel">
      <Image
        src={isLight ? "/images/logo-white.svg" : "/images/logo-optimized.webp"}
        alt=""
        width={180}
        height={64}
        priority={!isLight}
        className="brand-image"
      />
    </div>
  );
}
