import {
  faqs,
  features,
  industries,
  plans,
  problems,
  securityPoints,
  stats,
  steps,
  testimonials,
} from "../data/scripts";
import { AuthorDialog } from "./author-dialog";

export function ProblemSection() {
  return (
    <section className="py-[84px]">
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2>Cada mensaje sin responder es una venta que se enfría</h2>
        <div className="mt-10 grid grid-cols-1 border-t border-[var(--lx-ln)] min-[561px]:grid-cols-2 min-[901px]:grid-cols-4">
          {problems.map((p) => (
            <div key={p.title} className="pt-[22px] pr-5">
              <h3 className="mb-1.5">{p.title}</h3>
              <p className="text-[0.95rem] text-[var(--lx-mu)]">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Franja de métricas destacadas (24/7 · 1 clic · 3 agentes). */
export function StatsStrip() {
  return (
    <div className="bg-[var(--lx-sf2)] py-[60px]">
      <div className="mx-auto grid max-w-[1120px] gap-8 px-[22px] min-[761px]:grid-cols-3">
        {stats.map((s) => (
          <div key={s.value}>
            <b className="lx-stat">{s.value}</b>
            <p className="mt-3 max-w-[28ch] text-[var(--lx-mu)]">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section
      id="como"
      className="border-y border-[var(--lx-ln)] bg-[var(--lx-sf)] py-[84px]"
    >
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2>Listo en tres pasos</h2>
        <div className="lx-steps mt-10 grid gap-5 min-[821px]:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.title}
              className="rounded border border-[var(--lx-ln)] bg-[var(--lx-sf)] p-[26px]"
            >
              <h3>{s.title}</h3>
              <p className="mt-1.5 text-[var(--lx-mu)]">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section id="funciones" className="py-[84px]">
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2>Todo lo que necesitas en un solo inbox</h2>
        <div className="mt-9 grid gap-x-14 min-[761px]:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="border-b border-[var(--lx-ln)] py-[22px]"
            >
              <h3>{f.title}</h3>
              <p className="mt-1 text-[0.97rem] text-[var(--lx-mu)]">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function IndustriesSection() {
  return (
    <section className="border-y border-[var(--lx-ln)] bg-[var(--lx-sf)] py-[84px]">
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2>Pensado para negocios que viven de WhatsApp</h2>
        <div className="mt-[30px] flex flex-wrap gap-2.5">
          {industries.map((i) => (
            <span
              key={i}
              className="rounded-[3px] border border-[var(--lx-ln)] bg-[var(--lx-sf)] px-[18px] py-2.5"
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingSection() {
  return (
    <section id="precios" className="py-[84px]">
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2>Precios simples</h2>
        <p className="mt-4 max-w-[56ch] text-[var(--lx-mu)]">
          Precios de ejemplo: ajústalos a tu oferta real.
        </p>
        <div className="mt-10 grid items-stretch gap-5 min-[901px]:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col gap-3 rounded border p-7 ${
                p.highlighted
                  ? "border-[var(--lx-ia)] bg-[var(--lx-sf2)]"
                  : "border-[var(--lx-ln)] bg-[var(--lx-sf)]"
              }`}
            >
              <h3>{p.name}</h3>
              <div className="lx-price">
                {p.price}
                {p.period && <small>{p.period}</small>}
              </div>
              <ul className="m-0 flex-1 pl-[18px] text-[var(--lx-mu)]">
                {p.bullets.map((b) => (
                  <li key={b} className="my-[5px]">
                    {b}
                  </li>
                ))}
              </ul>
              <a
                className={
                  p.highlighted ? "lx-btn lx-btn-p justify-center" : "lx-btn justify-center"
                }
                href="#contacto"
              >
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TestimonialsSection() {
  return (
    <section className="border-y border-[var(--lx-ln)] bg-[var(--lx-sf)] py-[84px]">
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2>Lo que dicen los equipos que ya lo usan</h2>
        <div className="mt-9 grid gap-7 min-[821px]:grid-cols-3">
          {testimonials.map((t) => (
            <blockquote
              key={t.quote}
              className="m-0 border-l-[3px] border-[var(--lx-ia)] pl-[18px]"
            >
              “{t.quote}”
              <cite className="mt-2.5 block text-[0.88rem] not-italic text-[var(--lx-mu)]">
                {t.cite}
              </cite>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SecuritySection() {
  return (
    <section className="py-[84px]">
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2>Tus datos y tus clientes, protegidos</h2>
        <div className="mt-9 grid gap-7 min-[821px]:grid-cols-3">
          {securityPoints.map((s) => (
            <div key={s.title}>
              <h3>{s.title}</h3>
              <p className="mt-1.5 text-[0.97rem] text-[var(--lx-mu)]">
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section id="faq" className="pb-[84px]">
      <div className="mx-auto max-w-[1120px] px-[22px]">
        <h2 className="mb-7">Preguntas frecuentes</h2>
        <div className="lx-faq max-w-[760px]">
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="pt-10 pb-24 text-[0.93rem] text-[var(--lx-mu)]">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-7 gap-y-4 px-[22px]">
        <span>© 2026 AgenteWA</span>
        <nav aria-label="Pie" className="flex flex-wrap gap-5">
          <a href="#" className="no-underline hover:text-[var(--lx-tx)]">
            Privacidad
          </a>
          <a href="#" className="no-underline hover:text-[var(--lx-tx)]">
            Términos
          </a>
          <a href="#contacto" className="no-underline hover:text-[var(--lx-tx)]">
            Contacto
          </a>
          <a href="#" className="no-underline hover:text-[var(--lx-tx)]">
            Instagram
          </a>
          <a href="#" className="no-underline hover:text-[var(--lx-tx)]">
            LinkedIn
          </a>
        </nav>
        <AuthorDialog />
      </div>
    </footer>
  );
}
