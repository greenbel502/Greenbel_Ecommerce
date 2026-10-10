"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const VirtualAssistant = dynamic(
  () => import("./virtual-assistant").then((module) => module.VirtualAssistant),
  { ssr: false }
);

export function DeferredVirtualAssistant() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setReady(true), 250);
    return () => window.clearTimeout(timeout);
  }, []);

  return ready ? <VirtualAssistant /> : null;
}
