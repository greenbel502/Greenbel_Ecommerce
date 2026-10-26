"use client";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { DeferredVirtualAssistant } from "./deferred-virtual-assistant";
export function SiteFrame({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const path = usePathname();
  if (path === "/admin" || path.startsWith("/admin/")) return <>{children}</>;
  return (
    <>
      <Header />
      <main>{children}</main>
      {footer}
      <DeferredVirtualAssistant />
    </>
  );
}
