import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, KeyRound, LogOut, PackageCheck, ShieldCheck, ShoppingBag, UserRound } from "lucide-react";
import { CustomerProfileError, requireCustomerProfile } from "@/lib/server/customer-profile";
import { googleAvatarUrl, googleDisplayName } from "@/domain/account/profile";
import { signOutAction } from "./actions";
import { AvatarEditor, ProfileForm } from "./profile-form";
import { CustomerAvatar } from "@/presentation/components/customer-avatar";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

export default async function AccountPage() {
  let account: Awaited<ReturnType<typeof requireCustomerProfile>>;
  try { account = await requireCustomerProfile(); }
  catch (error) {
    if (error instanceof CustomerProfileError && error.status === 401) redirect("/cuenta/ingresar");
    return <section className={styles.shell}><h1>Tu cuenta GreenBel</h1><p role="alert">{error instanceof CustomerProfileError && error.status === 403
      ? "Esta cuenta no está habilitada. Contacta a GreenBel para revisar su acceso." : "No pudimos cargar tus datos. Inténtalo de nuevo en unos minutos."}</p>
      <Link href="/productos" className="secondary-dark-button">Explorar productos</Link><form action={signOutAction}><button className="primary-button">Cerrar sesión</button></form></section>;
  }
  const { client, user, profile } = account;
  const role = await client.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  const staffEntry = !role.error && role.data?.role === "admin" ? { href: "/admin/catalogo", label: "Panel administrativo" }
    : !role.error && role.data?.role === "operator" ? { href: "/admin/inventario", label: "Panel de inventario" } : null;
  const name = profile.display_name || googleDisplayName(user.user_metadata);
  const photo = profile.avatar_path ? `/api/account/avatar?v=${encodeURIComponent(profile.updated_at)}` : googleAvatarUrl(user.user_metadata);
  const google = user.identities?.some(identity => identity.provider === "google");
  return <section className={styles.shell}>
    <div className={styles.breadcrumb}><Link href="/">Inicio</Link><span>/</span><span>Mi cuenta</span></div>
    <header className={styles.welcome}>
      <div className={styles.welcomeIdentity}><CustomerAvatar key={photo} src={photo} name={name} />
        <div><span className={styles.eyebrow}>MI CUENTA GREENBEL</span><h1>{name ? `Hola, ${name.split(/\s+/)[0]}` : "Tu próxima compra, más fácil."}</h1>
          <p>Guarda tus datos y encuentra tus pedidos en un solo lugar.</p></div>
      </div>
      <Link href="/cuenta/pedidos" className={styles.ordersButton}><PackageCheck size={19} aria-hidden="true" /> Ver mis pedidos <ArrowRight size={17} aria-hidden="true" /></Link>
    </header>
    <div className={styles.dashboard}>
      <article className={styles.detailsCard}>
        <div className={styles.cardHeading}><span className={styles.headingIcon}><UserRound size={22} aria-hidden="true" /></span><div><h2>Mis datos</h2><p>Menos campos por llenar cuando vuelvas a comprar.</p></div></div>
        <AvatarEditor src={photo} name={name} customPhoto={Boolean(profile.avatar_path)} />
        <ProfileForm name={name} phone={profile.phone ?? ""} address={profile.address_line ?? ""} email={user.email ?? ""} version={profile.updated_at} />
      </article>
      <aside className={styles.sidebar}>
        <div className={styles.shopCard}>
          <Image src="/images/greenbel-login-agricola-v1.webp" alt="Equipo de aspersión entre cultivos, imagen ilustrativa" fill sizes="(max-width: 900px) 100vw, 360px" className={styles.shopImage} />
          <div><span>LISTOS PARA EL CAMPO</span><h2>El equipo para tu próxima tarea.</h2><Link href="/productos">Explorar productos <ArrowRight size={17} aria-hidden="true" /></Link></div>
        </div>
        <nav className={styles.quickLinks} aria-label="Acciones de tu cuenta">
          <Link href="/carrito"><ShoppingBag size={19} aria-hidden="true" /><span>Mi carrito<small>Continúa con tu selección</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
          {staffEntry && <Link href={staffEntry.href}><ShieldCheck size={19} aria-hidden="true" /><span>{staffEntry.label}<small>Administración GreenBel</small></span><ArrowRight size={16} aria-hidden="true" /></Link>}
          <Link href="/cuenta/restablecer"><KeyRound size={19} aria-hidden="true" /><span>Contraseña<small>Administra tu acceso</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
          <form action={signOutAction}><button type="submit"><LogOut size={19} aria-hidden="true" /> Cerrar sesión</button></form>
        </nav>
        {google && <p className={styles.providerNote}><ShieldCheck size={16} aria-hidden="true" /> Ingresaste con Google</p>}
      </aside>
    </div>
  </section>;
}
