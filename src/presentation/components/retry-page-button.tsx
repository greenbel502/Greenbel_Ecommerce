"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function RetryPageButton() {
  const [retrying, setRetrying] = useState(false);

  function retry() {
    setRetrying(true);
    // Request a fresh server render, including failed reads and metadata.
    // This performs no purchase/payment mutation and retains the persisted cart.
    window.location.reload();
  }

  return <button type="button" className="primary-button" onClick={retry} disabled={retrying}>
    <RefreshCw size={18} aria-hidden="true" />
    {retrying ? "Volviendo a cargar…" : "Reintentar"}
  </button>;
}
