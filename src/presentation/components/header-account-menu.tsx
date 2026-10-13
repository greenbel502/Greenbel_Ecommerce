"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, LogOut, PackageCheck, ShieldCheck, UserRound } from "lucide-react";
import type { HeaderAccount } from "@/domain/account/header-account";
import { signOutMenuAction, type AuthActionState } from "@/app/cuenta/actions";
import { ACCOUNT_UPDATED_EVENT } from "@/presentation/events/account-events";
import { CustomerAvatar } from "./customer-avatar";
import styles from "./header-account-menu.module.css";

function LogoutButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}><LogOut size={17} aria-hidden="true" />{pending ? "Cerrando sesión…" : "Cerrar sesión"}</button>;
}

export function HeaderAccountMenu({ onOpen }: { onOpen: () => void }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<HeaderAccount | null>(null);
  const [open, setOpen] = useState(false);
  const [logout, logoutAction] = useActionState<AuthActionState, FormData>(signOutMenuAction, { status: "idle", message: "" });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  const regionId = useId();

  const refresh = useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    void (async () => {
      try {
        const response = await fetch("/api/account/session", { cache: "no-store", signal: current.signal });
        if (!response.ok) throw new Error("Account unavailable");
        const payload = await response.json() as { account: HeaderAccount | null };
        if (!current.signal.aborted) {
          setAccount(payload.account ?? null);
          if (!payload.account) setOpen(false);
        }
      } catch {
        if (!current.signal.aborted) { setAccount(null); setOpen(false); }
      }
    })();
  }, []);

  useEffect(() => {
    setOpen(false);
    // Authentication pages can follow sign-out; discard the former identity immediately.
    if (pathname === "/cuenta/ingresar") setAccount(null);
    refresh();
    return () => controller.current?.abort();
  }, [pathname, refresh]);

  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(ACCOUNT_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(ACCOUNT_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  if (!account) return <Link href="/cuenta" className="icon-button account-button" aria-label="Ir a mi cuenta o ingresar" title="Mi cuenta"><UserRound size={19} aria-hidden="true" /></Link>;

  return <div className={styles.root} ref={root} onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={button} type="button" className={styles.trigger} aria-label={`Mi cuenta: ${account.name}`} aria-expanded={open} aria-controls={regionId}
      onClick={() => { if (!open) onOpen(); setOpen(value => !value); }}>
      <CustomerAvatar key={account.avatarUrl} src={account.avatarUrl} name={account.name} size={42} shape="rounded" />
      <span className={styles.identity}><strong>{account.name}</strong><small>{account.email}</small></span>
      <ChevronDown size={16} aria-hidden="true" className={open ? styles.chevronOpen : styles.chevron} />
    </button>
    {open && <div className={styles.dropdown} id={regionId} role="region" aria-label="Opciones de mi cuenta">
      <div className={styles.summary}><strong>{account.name}</strong><span>{account.email}</span></div>
      <nav aria-label="Menú de mi cuenta">
        <Link href="/cuenta" onClick={() => setOpen(false)}><UserRound size={17} aria-hidden="true" />Mi cuenta</Link>
        <Link href="/cuenta/pedidos" onClick={() => setOpen(false)}><PackageCheck size={17} aria-hidden="true" />Mis pedidos</Link>
        {account.staffEntry && <Link href={account.staffEntry.href} onClick={() => setOpen(false)}><ShieldCheck size={17} aria-hidden="true" />{account.staffEntry.label}</Link>}
      </nav>
      <form action={logoutAction} className={styles.logout}><LogoutButton /></form>
      {logout.status === "error" && <p className={styles.error} role="alert">{logout.message}</p>}
    </div>}
  </div>;
}
