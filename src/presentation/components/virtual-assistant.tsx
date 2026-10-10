"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Leaf, MessageCircle, ShoppingBag, X } from "lucide-react";
import { useState } from "react";

const destinations = [
  { href: "/productos", label: "Explorar productos", icon: Leaf },
  { href: "/carrito", label: "Revisar mi selección", icon: ShoppingBag },
  { href: "/contacto", label: "Abrir contacto", icon: MessageCircle }
];

/** Navigation aid that preserves the mockup's Bell visual without pretending to answer or send messages. */
export function VirtualAssistant() {
  const [open, setOpen] = useState(false);

  return <div className="assistant-root">
    <AnimatePresence>
      {open && <motion.section
        className="assistant-chat"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.96 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        aria-label="Guía de navegación GreenBel"
      >
        <div className="assistant-chat-header">
          <AssistantAvatar compact />
          <div><strong>Bell · guía del sitio</strong><span>Accesos rápidos</span></div>
          <button type="button" className="assistant-close" onClick={() => setOpen(false)} aria-label="Cerrar guía">
            <X size={19} />
          </button>
        </div>
        <div className="assistant-messages">
          <p className="assistant-message bot">Encuentra productos, revisa tu carrito o abre el formulario de contacto. Esta guía no recibe ni envía mensajes.</p>
        </div>
        <nav className="assistant-quick-actions" aria-label="Accesos rápidos">
          {destinations.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={() => setOpen(false)}>
            <Icon size={16} /> {label}
          </Link>)}
        </nav>
      </motion.section>}
    </AnimatePresence>
    <AnimatePresence>
      {!open && <motion.button
        type="button"
        className="assistant-launcher"
        onClick={() => setOpen(true)}
        aria-label="Abrir guía de navegación"
        initial={{ opacity: 0, y: 18, scale: 0.94 }}
        animate={{ opacity: 1, y: [0, -5, 0], scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.94, transition: { duration: 0.24, ease: "easeOut" } }}
        whileHover={{ scale: 1.035, y: -4 }}
        whileTap={{ scale: 0.97 }}
        transition={{
          opacity: { duration: 0.28 },
          scale: { duration: 0.28 },
          y: { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
        }}
      >
        <motion.span
          className="assistant-greeting"
          initial={{ opacity: 0, x: 10, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          ¿Qué deseas encontrar?
        </motion.span>
        <AssistantAvatar />
      </motion.button>}
    </AnimatePresence>
  </div>;
}

function AssistantAvatar({ compact = false }: { compact?: boolean }) {
  return <motion.span
    className={compact ? "assistant-avatar compact" : "assistant-avatar"}
    aria-hidden="true"
    animate={{ scale: [1, 1.035, 1], rotate: [0, -1.2, 1.2, 0] }}
    transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
  >
    <Image src="/images/bellbot-thumb.webp" alt="" width={160} height={160} className="assistant-avatar-image" priority={false} />
  </motion.span>;
}
