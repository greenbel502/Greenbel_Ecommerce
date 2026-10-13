"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./customer-avatar.module.css";

export function CustomerAvatar({ src, name, size = 80, shape = "circle" }: {
  src: string | null; name: string; size?: number; shape?: "circle" | "rounded";
}) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join("").toUpperCase() || "GB";
  return <span className={styles.avatar} data-shape={shape} style={{ width: size, height: size }}>
    {src && !failed ? <Image src={src} alt={`Foto de ${name || "tu cuenta"}`} width={size} height={size}
      unoptimized referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-label="Iniciales de tu cuenta">{initials}</span>}
  </span>;
}
