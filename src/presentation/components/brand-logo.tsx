import Image from "next/image";

export function BrandLogo({ variant = "default" }: { variant?: "default" | "light" }) {
  const isLight = variant === "light";

  return (
    <div className={isLight ? "brand-logo brand-logo-light" : "brand-logo"} aria-label="GreenBel">
      <Image
        src={isLight ? "/images/brand/greenbel-horizontal-light.svg" : "/images/brand/greenbel-horizontal.svg"}
        alt=""
        width={1095}
        height={206}
        priority={!isLight}
        className="brand-image"
      />
    </div>
  );
}
