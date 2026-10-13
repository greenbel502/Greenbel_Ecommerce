"use client";

import { PageStatus } from "@/presentation/components/page-status";

/** Catch unexpected page rendering errors without exposing messages or stacks. */
export default function ErrorPage() {
  return <PageStatus kind="unavailable" />;
}
