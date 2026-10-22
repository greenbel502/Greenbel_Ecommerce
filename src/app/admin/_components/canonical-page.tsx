"use client";
import { useEffect } from "react";
/** A result shrink may clamp multiple independent lists; merge with the live URL. */
export function CanonicalPage({
  prefix,
  page,
}: {
  prefix: string;
  page: number;
}) {
  useEffect(() => {
    const url = new URL(window.location.href),
      key = `${prefix}page`,
      requested = Number(url.searchParams.get(key));
    if (requested > page) {
      url.searchParams.set(key, String(page));
      window.history.replaceState(null, "", url);
    }
  }, [prefix, page]);
  return null;
}
