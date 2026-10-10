"use client";

import { useRef, useState, type FormEvent } from "react";
import { industriesOptions } from "../data/scripts";

type Feedback = { kind: "ok" | "error"; text: string };

/**
 * Formulario lead de la landing. POSTea a /api/leads: el lead cae como
 * conversación nueva en el propio inbox del workspace (dogfooding). WhatsApp
 * es requerido — el inbox se identifica por teléfono y la demo se responde
 * por el mismo canal que se vende; el correo queda opcional como contexto.
 */
export function ContactSection() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const whatsapp = String(fd.get("whatsapp") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const industry = String(fd.get("industry") ?? "").trim();

    if (!name || !whatsapp) {
      setFeedback({
        kind: "error",
        text: "Escribe tu nombre y tu WhatsApp para contactarte.",
      });
      return;
    }
    if (whatsapp.replace(/\D/g, "").length < 8) {
      setFeedback({
        kind: "error",
        text: "Revisa tu número de WhatsApp: faltan dígitos.",
      });
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          whatsapp,
          email,
          industry,
          website: String(fd.get("website") ?? ""),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "No se pudo enviar. Intenta de nuevo.");
      }
      form.reset();
      setFeedback({
        kind: "ok",
        text: `Gracias, ${name}. Te escribimos por WhatsApp muy pronto.`,
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        text:
          err instanceof Error
            ? err.message
            : "No se pudo enviar. Intenta de nuevo.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section id="contacto" className="lx-final">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-[22px] py-[84px] min-[821px]:grid-cols-2">
        <div>
          <h2>Que tu próximo cliente reciba respuesta en segundos</h2>
          <p className="lx-lead mt-4 max-w-[56ch] text-[1.1rem]">
            Déjanos tu WhatsApp y te escribimos por ahí con una demo de tu
            negocio.
          </p>
        </div>
        <form
          ref={formRef}
          className="grid gap-3"
          onSubmit={onSubmit}
          noValidate
        >
          <label className="grid gap-[5px] text-[0.9rem]">
            Nombre
            <input
              className="lx-input"
              name="name"
              autoComplete="name"
              placeholder="Tu nombre"
              required
            />
          </label>
          <label className="grid gap-[5px] text-[0.9rem]">
            WhatsApp
            <input
              className="lx-input"
              name="whatsapp"
              type="tel"
              autoComplete="tel"
              placeholder="+52 ..."
              required
            />
          </label>
          <label className="grid gap-[5px] text-[0.9rem]">
            Correo <span className="opacity-60">(opcional)</span>
            <input
              className="lx-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
            />
          </label>
          <label className="grid gap-[5px] text-[0.9rem]">
            ¿A qué te dedicas? <span className="opacity-60">(opcional)</span>
            <select className="lx-select" name="industry" defaultValue="">
              <option value="">Elige una opción</option>
              {industriesOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          {/* Honeypot: invisible para humanos; los bots lo llenan. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          <button
            className="lx-btn lx-btn-p justify-center"
            type="submit"
            disabled={pending}
          >
            {pending ? "Enviando…" : "Solicitar demo"}
          </button>
          <div
            className={feedback?.kind === "error" ? "lx-err" : "lx-ok"}
            role="status"
          >
            {feedback?.text}
          </div>
        </form>
      </div>
    </section>
  );
}
