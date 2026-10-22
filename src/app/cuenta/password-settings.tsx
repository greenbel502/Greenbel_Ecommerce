"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import styles from "./profile.module.css";

const PasswordSettingsContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

export function PasswordSettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const synchronize = () => setOpen(window.location.hash === "#seguridad");
    synchronize();
    window.addEventListener("hashchange", synchronize);
    window.addEventListener("popstate", synchronize);
    return () => {
      window.removeEventListener("hashchange", synchronize);
      window.removeEventListener("popstate", synchronize);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById("account-security-heading");
      document.getElementById("seguridad")?.scrollIntoView({ block: "start" });
      heading?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      if (window.location.hash === "#seguridad") {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
    } else {
      setOpen(true);
      window.location.hash = "seguridad";
    }
  }

  return <PasswordSettingsContext.Provider value={{ open, toggle }}>{children}</PasswordSettingsContext.Provider>;
}

function usePasswordSettings() {
  const context = useContext(PasswordSettingsContext);
  if (!context) throw new Error("La configuración de contraseña requiere su contexto de cuenta.");
  return context;
}

export function PasswordSettingsButton() {
  const { open, toggle } = usePasswordSettings();
  return <button type="button" className={styles.securityToggle} aria-expanded={open} aria-controls="seguridad" onClick={toggle}>
    <KeyRound size={19} aria-hidden="true" /><span>Contraseña<small>{open ? "Ocultar configuración" : "Configúrala aquí mismo"}</small></span><ArrowRight size={16} aria-hidden="true" />
  </button>;
}

export function PasswordSettingsPanel({ children }: { children: ReactNode }) {
  const { open } = usePasswordSettings();
  // Unmount the form when closed so entered passwords are not retained in a hidden section.
  return <section id="seguridad" hidden={!open} className={`${styles.detailsCard} ${styles.securityCard}`} aria-labelledby="account-security-heading">{open ? children : null}</section>;
}
