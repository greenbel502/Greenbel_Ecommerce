"use client";
import { useEffect } from "react";
/** Native constraints remain authoritative in the browser; every action also validates on the server. */
export function FormValidation() {
  useEffect(() => {
    const root = document.getElementById("admin-content");
    if (!root) return;
    const messages = new Map<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
      HTMLElement
    >();
    let count = 0,
      focused = false;
    const control = (event: Event) =>
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
        ? event.target
        : null;
    function message(
      field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    ) {
      const v = field.validity;
      if (v.valueMissing) return "Completa este campo obligatorio.";
      if (v.typeMismatch)
        return field.type === "email"
          ? "Ingresa un correo válido."
          : "Ingresa una dirección válida.";
      if (v.rangeUnderflow)
        return `El valor mínimo es ${field.getAttribute("min")}.`;
      if (v.rangeOverflow)
        return `El valor máximo es ${field.getAttribute("max")}.`;
      if (v.tooShort)
        return `Ingresa al menos ${field.getAttribute("minlength")} caracteres.`;
      if (v.tooLong) return "El texto supera el límite permitido.";
      if (v.patternMismatch)
        return "Revisa el formato indicado para este campo.";
      if (v.stepMismatch) return "Revisa los decimales permitidos.";
      return "Revisa el valor de este campo.";
    }
    function invalid(event: Event) {
      const field = control(event);
      if (!field) return;
      event.preventDefault();
      let text = messages.get(field);
      if (!text) {
        text = document.createElement("small");
        text.className = "admin-field-error";
        text.id = `admin-validation-${++count}`;
        field.insertAdjacentElement("afterend", text);
        messages.set(field, text);
        field.setAttribute(
          "aria-describedby",
          [field.getAttribute("aria-describedby"), text.id]
            .filter(Boolean)
            .join(" "),
        );
      }
      text.textContent = message(field);
      field.setAttribute("aria-invalid", "true");
      if (!focused) {
        field.focus();
        focused = true;
        queueMicrotask(() => {
          focused = false;
        });
      }
    }
    function edited(event: Event) {
      const field = control(event);
      if (!field) return;
      const text = messages.get(field);
      if (!text) return;
      if (field.validity.valid) {
        field.removeAttribute("aria-invalid");
        const refs = (field.getAttribute("aria-describedby") || "")
          .split(" ")
          .filter((id) => id !== text.id);
        if (refs.length) field.setAttribute("aria-describedby", refs.join(" "));
        else field.removeAttribute("aria-describedby");
        text.remove();
        messages.delete(field);
      } else text.textContent = message(field);
    }
    root.addEventListener("invalid", invalid, true);
    root.addEventListener("input", edited);
    root.addEventListener("change", edited);
    return () => {
      root.removeEventListener("invalid", invalid, true);
      root.removeEventListener("input", edited);
      root.removeEventListener("change", edited);
      for (const [field, text] of messages) {
        field.removeAttribute("aria-invalid");
        text.remove();
      }
    };
  }, []);
  return null;
}
