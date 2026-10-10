"use client";

import { useState, type FormEvent } from "react";
import { industriesOptions } from "../data/scripts";

/**
 * Formulario lead de la landing. Paridad con el HTML original: validación
 * local (nombre + WhatsApp o correo) y mensaje de éxito; sin backend.
 */
export function ContactSection() {
  const [feedback, setFeedback] = useState("");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const whatsapp = String(fd.get("whatsapp") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    if (!name || !(whatsapp || email)) {
      setFeedback("Escribe tu nombre y un WhatsApp o correo para contactarte.");
      return;
    }
    setFeedback(`Gracias, ${name}. Te contactamos pronto.`);
  };

  return (
    <section id="contacto" className="lx-final">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-[22px] py-[84px] min-[821px]:grid-cols-2">
        <div>
          <h2>Que tu próximo cliente reciba respuesta en segundos</h2>
          <p className="lx-lead mt-4 max-w-[56ch] text-[1.1rem]">
            Déjanos tus datos y te mostramos una demo con tu propio negocio.
          </p>
        </div>
        <form className="grid gap-3" onSubmit={onSubmit} noValidate>
          <label className="grid gap-[5px] text-[0.9rem]">
            Nombre
            <input
              className="lx-input"
              name="name"
              autoComplete="name"
              placeholder="Tu nombre"
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
            />
          </label>
          <label className="grid gap-[5px] text-[0.9rem]">
            Correo
            <input
              className="lx-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
            />
          </label>
          <label className="grid gap-[5px] text-[0.9rem]">
            ¿A qué te dedicas?
            <select className="lx-select" name="industry">
              {industriesOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <button className="lx-btn lx-btn-p justify-center" type="submit">
            Solicitar demo
          </button>
          <div className="lx-ok" role="status">
            {feedback}
          </div>
        </form>
      </div>
    </section>
  );
}
