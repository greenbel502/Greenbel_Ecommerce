"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const VirtualAssistant = dynamic(
  () => import("./virtual-assistant").then((module) => module.VirtualAssistant),
  { ssr: false }
);

export function DeferredVirtualAssistant() {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const timeout = window.setTimeout(() => setReady(true), 250);
    return () => window.clearTimeout(timeout);
  }, []);

  // Keep the floating launcher clear of authentication controls on small screens.
  const authenticationForm = ["/cuenta", "/cuenta/ingresar", "/cuenta/registro", "/cuenta/recuperar", "/cuenta/restablecer"].includes(pathname);
  return ready && !authenticationForm ? <VirtualAssistant /> : null;
}
