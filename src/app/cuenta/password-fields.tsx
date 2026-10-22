"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AuthActionState } from "./actions";
import styles from "./auth.module.css";

/** Shared by registration and account settings; validation also runs on the server. */
export function PasswordFields({ firstLabel, result }: { firstLabel: string; result: AuthActionState }) {
  const id = useId();
  const confirmationInput = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState([false, false]);
  const mismatch = confirmation.length > 0 && password !== confirmation;

  useEffect(() => {
    confirmationInput.current?.setCustomValidity(mismatch ? "Las contraseñas no coinciden." : "");
  }, [mismatch]);

  useEffect(() => {
    if (result.status === "notice") {
      setPassword(""); setConfirmation(""); setVisible([false, false]);
    }
  }, [result]);

  return <div className={styles.passwordFields}>
    {[firstLabel, "Confirmar contraseña"].map((label, index) => <div key={index}>
      <label htmlFor={`${id}-${index}`}>{label}</label>
      <div className={styles.passwordInput}>
        <input id={`${id}-${index}`} name={index === 0 ? "password" : "passwordConfirmation"}
          ref={index === 1 ? confirmationInput : undefined}
          type={visible[index] ? "text" : "password"} autoComplete="new-password"
          minLength={8} maxLength={128} required value={index === 0 ? password : confirmation}
          onChange={event => index === 0 ? setPassword(event.target.value) : setConfirmation(event.target.value)}
          aria-invalid={index === 1 && mismatch ? true : undefined}
          aria-describedby={index === 1 && mismatch ? `${id}-mismatch` : `${id}-help`} />
        <button type="button" className={styles.passwordToggle}
          aria-label={`${visible[index] ? "Ocultar" : "Mostrar"} ${index === 0 ? "contraseña" : "confirmación de contraseña"}`}
          aria-pressed={visible[index]}
          onClick={() => setVisible(previous => previous.map((value, position) => position === index ? !value : value))}>
          {visible[index] ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
        </button>
      </div>
    </div>)}
    <p id={`${id}-help`} className={styles.passwordHelp}>Usa de 8 a 128 caracteres. Ambas contraseñas deben coincidir.</p>
    {mismatch && <p id={`${id}-mismatch`} className={`${styles.feedback} ${styles.error}`} role="alert">Las contraseñas no coinciden.</p>}
  </div>;
}
