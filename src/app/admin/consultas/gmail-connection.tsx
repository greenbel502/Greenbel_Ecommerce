import { gmailConfig, missingGmailVariables } from "@/lib/gmail/config";
import { readGmailConnection } from "@/lib/gmail/repository";
import { Mail } from "lucide-react";
import styles from "../inbox.module.css";
import { GmailConnectButton } from "./gmail-connect-button";
const messages: Record<string, string> = {
  connected:
    "Gmail conectado. Solo las consultas nuevas generarán notificaciones; los registros anteriores no se envían automáticamente.",
  state_invalid:
    "La autorización venció o no corresponde a esta sesión. Vuelve a conectar Gmail.",
  authorization_denied:
    "La autorización no se completó. Puedes volver a conectar Gmail.",
  authorization_failed:
    "No se pudo confirmar la conexión. Comprueba la cuenta y vuelve a conectar.",
  refresh_missing:
    "Google no devolvió autorización sin conexión. Reconecta y acepta el consentimiento.",
  scope_invalid:
    "No se confirmó el permiso exclusivo para enviar correo. Revisa la configuración OAuth.",
  retry_sent: "Gmail aceptó la notificación.",
  retry_failed:
    "La notificación sigue pendiente. La consulta permanece guardada.",
  retry_unknown:
    "No se confirmó el resultado. Revisa Gmail antes de cualquier nuevo envío.",
  retry_not_claimed:
    "No se reenvió: ya fue notificada, está en proceso, falta reconectar o todavía no corresponde reintentar.",
  retry_unavailable:
    "No se pudo preparar el reintento. Revisa la conexión y la configuración.",
};
export async function GmailConnection({ result }: { result?: string }) {
  const missing = missingGmailVariables();
  let config: ReturnType<typeof gmailConfig> | null = null;
  let connection: Awaited<ReturnType<typeof readGmailConnection>> = null;
  let unavailable = false;
  try {
    config = gmailConfig();
    connection = await readGmailConnection();
  } catch {
    unavailable = true;
  }
  const matches =
    !!config &&
    !!connection &&
    connection.sender_email === config.senderEmail &&
    connection.client_fingerprint === config.clientFingerprint;
  const connected = matches && connection?.status === "connected";
  return (
    <section
      className={`${styles.card} ${styles.gmailConnection}`}
      aria-labelledby="gmail-title"
    >
      <div>
        <h2 id="gmail-title">
          <Mail size={20} aria-hidden="true" /> Notificaciones por Gmail
        </h2>
        <p>
          {connected
            ? "Gmail conectado"
            : matches
              ? "Gmail requiere reconexión"
              : "Gmail sin conectar"}
        </p>
        {config && (
          <p>
            Remitente: {config.senderEmail}
            <br />
            Destinatario: {config.notificationEmail}
          </p>
        )}
        {missing.length > 0 && (
          <p role="status">Configura en el servidor: {missing.join(", ")}.</p>
        )}
        {!missing.length && unavailable && (
          <p role="status">
            No se pudo verificar Gmail. Revisa la configuración y la migración
            028.
          </p>
        )}
        <p>
          Solo un administrador autoriza Gmail. Se solicita permiso para enviar
          correos; no se lee la bandeja de entrada. Elige la cuenta remitente
          indicada.
        </p>
        {result && messages[result] && <p role="status">{messages[result]}</p>}
      </div>
      <GmailConnectButton
        reconnect={!!connection}
        disabled={!config || unavailable}
      />
    </section>
  );
}
