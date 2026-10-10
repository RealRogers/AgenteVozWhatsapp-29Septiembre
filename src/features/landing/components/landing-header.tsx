"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "#como", label: "Cómo funciona" },
  { href: "#funciones", label: "Funciones" },
  { href: "#agentes", label: "Agentes" },
  { href: "#demo", label: "Demo" },
  { href: "#precios", label: "Precios" },
  { href: "#faq", label: "Preguntas" },
];

export function LandingHeader({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Scrollspy: marca el link de la sección visible (rootMargin del original).
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = NAV_LINKS.map(({ href }) =>
      document.getElementById(href.slice(1)),
    ).filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // El menú móvil se cierra con Escape y al hacer click fuera del header.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="lx-header" ref={headerRef}>
      <div className="mx-auto flex h-[62px] max-w-[1120px] items-center justify-between px-[22px]">
        <a className="lx-logo" href="#top">
          <i aria-hidden="true" />
          AgenteWA
        </a>
        <nav
          className="lx-nav"
          id="lx-nav"
          aria-label="Principal"
          data-open={open || undefined}
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              className="lx-navlink"
              href={l.href}
              data-active={active === l.href.slice(1) || undefined}
              onClick={close}
            >
              {l.label}
            </a>
          ))}
          <Link
            className="lx-btn lx-btn-ent"
            href={loggedIn ? "/inbox" : "/login"}
            onClick={close}
          >
            {loggedIn ? "Ir a la app" : "Iniciar sesión"}
          </Link>
          <a className="lx-btn lx-btn-p" href="#contacto" onClick={close}>
            Agendar demo
          </a>
        </nav>
        <button
          className="lx-burger"
          type="button"
          aria-expanded={open}
          aria-controls="lx-nav"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
