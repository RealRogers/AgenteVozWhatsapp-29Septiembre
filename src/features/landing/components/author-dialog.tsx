"use client";

import { useRef } from "react";

/** Botón "Hecho por RogersX" del footer + <dialog> nativo con el crédito. */
export function AuthorDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="lx-credit"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Hecho por RogersX
      </button>
      <dialog ref={dialogRef} className="lx-dialog" aria-labelledby="lx-dg-title">
        <h3 id="lx-dg-title" className="mb-1">
          RogersX
        </h3>
        <p className="mb-[18px] text-[var(--lx-mu)]">Desarrollador Web</p>
        <div className="flex justify-center gap-2.5">
          <a
            className="lx-btn lx-btn-p"
            href="https://github.com/RogersX"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
          <button
            className="lx-btn"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Cerrar
          </button>
        </div>
      </dialog>
    </>
  );
}
