"use client";

import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const NavigationLoadingOverlay = dynamic(
  () => import("./navigation-loading-overlay").then((module) => module.NavigationLoadingOverlay),
  { ssr: false }
);

const MINIMUM_VISIBLE_MS = 850;
const SAFETY_TIMEOUT_MS = 8000;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const currentRouteRef = useRef(routeKey);
  const sourceRouteRef = useRef(routeKey);
  const startedAtRef = useRef(0);
  const loadingRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [overlayReady, setOverlayReady] = useState(false);

  const stopLoading = useCallback(() => {
    loadingRef.current = false;
    setVisible(false);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
    finishTimerRef.current = null;
    safetyTimerRef.current = null;
  }, []);

  const startLoading = useCallback(() => {
    if (loadingRef.current) return;
    sourceRouteRef.current = currentRouteRef.current;
    startedAtRef.current = window.performance.now();
    loadingRef.current = true;
    setOverlayReady(true);
    setVisible(true);
    safetyTimerRef.current = window.setTimeout(stopLoading, SAFETY_TIMEOUT_MS);
  }, [stopLoading]);

  useEffect(() => {
    currentRouteRef.current = routeKey;
    if (!loadingRef.current || routeKey === sourceRouteRef.current) return;

    const elapsed = window.performance.now() - startedAtRef.current;
    finishTimerRef.current = window.setTimeout(stopLoading, Math.max(0, MINIMUM_VISIBLE_MS - elapsed));
  }, [routeKey, stopLoading]);

  useEffect(() => {
    const idleWindow = window as IdleWindow;
    let cancelled = false;
    const prepareOverlay = () => {
      void import("./navigation-loading-overlay").then(() => {
        if (!cancelled) setOverlayReady(true);
      });
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(prepareOverlay, { timeout: 1800 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }

    const timeout = window.setTimeout(prepareOverlay, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) return;

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;

      const nextRoute = `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`;
      if (nextRoute === currentRouteRef.current || nextUrl.hash) return;
      startLoading();
    }

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", startLoading);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", startLoading);
    };
  }, [startLoading]);

  useEffect(() => () => {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
  }, []);

  return overlayReady ? <NavigationLoadingOverlay visible={visible} /> : null;
}
