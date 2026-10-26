"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  updatePasswordAction,
  type AuthActionState
} from "./actions";
import styles from "./auth.module.css";
import { PasswordFields } from "./password-fields";

const initialState: AuthActionState = { status: "idle", message: "" };

function Feedback({ state }: { state: AuthActionState }) {
  useNotificationFeedback(state.status, state.message);
  if (state.status === "idle") return null;
  return (
    <p
      className={`${styles.feedback} ${state.status === "error" ? styles.error : styles.notice}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="primary-button" type="submit" disabled={pending}>{pending ? "Procesando…" : children}</button>;
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button className={styles.googleButton} type="submit" disabled={pending}>
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.9-3.6 6.1-8.7 6.1-14.7Z" />
        <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2C9.2 39.5 16.1 44 24 44Z" />
        <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z" />
        <path fill="#EA4335" d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4C16.1 4 9.2 8.5 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z" />
      </svg>
      {pending ? "Conectando con Google…" : "Continuar con Google"}
    </button>
  );
}

function GoogleSignIn({ returnTo }: { returnTo?: "/checkout" | "/financiamiento#solicitud" }) {
  const [state, action] = useActionState(signInWithGoogleAction, initialState);
  return (
    <>
      <div className={styles.authDivider}><span>o continúa con</span></div>
      <form action={action} className={styles.googleForm}>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <GoogleButton />
        <Feedback state={state} />
      </form>
    </>
  );
}

export function SignInForm({ invalidLink = false, googleError, returnTo, financingNotice = false }: { invalidLink?: boolean; googleError?: "google" | "account"; financingNotice?: boolean; returnTo?: "/checkout" | "/financiamiento#solicitud" }) {
  const [state, formAction] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <>
      <span className={styles.loginWelcome}>BIENVENIDO DE NUEVO</span>
      <h2>Ingresa a tu cuenta</h2>
      <p className={styles.loginDescription}>Tus equipos y tus próximas compras te esperan.</p>
      {financingNotice && <p className={styles.feedback} role="status">Para enviar tu solicitud de financiamiento necesitas iniciar sesión o crear una cuenta. Tu carrito se conservará y después volverás al formulario.</p>}
      {invalidLink && <p className={`${styles.feedback} ${styles.error}`} role="alert">El enlace es inválido o venció. Solicita uno nuevo o inicia sesión.</p>}
      {googleError && <p className={`${styles.feedback} ${styles.error}`} role="alert">{googleError === "account"
        ? "No se pudo habilitar el acceso a tu cuenta. Contacta a GreenBel para revisar su estado."
        : "No se completó el acceso con Google. Inténtalo de nuevo desde este navegador."}</p>}
      <form className={`${styles.form} ${styles.loginForm}`} action={formAction}>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label htmlFor="login-email">Correo electrónico<input id="login-email" name="email" type="email" autoComplete="email" placeholder="tu@correo.com" required maxLength={254} /></label>
        <div>
          <div className={styles.passwordHeading}><label htmlFor="login-password">Contraseña</label><Link href="/cuenta/recuperar">¿Olvidaste tu contraseña?</Link></div>
          <div className={styles.passwordInput}>
            <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Ingresa tu contraseña" required />
            <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <Feedback state={state} />
        <SubmitButton>Ingresar</SubmitButton>
      </form>
      <GoogleSignIn returnTo={returnTo} />
      <p className={styles.createAccount}>¿Primera vez en GreenBel? <Link href={returnTo ? `/cuenta/registro?next=${encodeURIComponent(returnTo)}` : "/cuenta/registro"}>Crea tu cuenta</Link></p>
    </>
  );
}

export function SignUpForm({ returnTo }: { returnTo?: "/checkout" | "/financiamiento#solicitud" }) {
  const [state, formAction] = useActionState(signUpAction, initialState);
  return (
    <>
      <h2>Crear cuenta</h2>
      <form className={styles.form} action={formAction}>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <PasswordFields firstLabel="Contraseña" result={state} />
        <Feedback state={state} />
        <SubmitButton>Crear cuenta</SubmitButton>
      </form>
      <GoogleSignIn returnTo={returnTo} />
      <div className={styles.links}><Link href={returnTo ? `/cuenta/ingresar?next=${encodeURIComponent(returnTo)}` : "/cuenta/ingresar"}>Ya tengo cuenta</Link></div>
    </>
  );
}

export function RecoverPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);
  return (
    <>
      <h2>Recuperar acceso</h2>
      <form className={styles.form} action={formAction}>
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <Feedback state={state} />
        <SubmitButton>Solicitar enlace de recuperación</SubmitButton>
      </form>
      <div className={styles.links}><Link href="/cuenta/ingresar">Volver a ingresar</Link></div>
    </>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, initialState);
  return (
    <>
      <form className={styles.form} action={formAction} aria-label="Guardar contraseña de mi cuenta">
        <PasswordFields firstLabel="Nueva contraseña" result={state} />
        <Feedback state={state} />
        <SubmitButton>Guardar contraseña</SubmitButton>
      </form>
    </>
  );
}
