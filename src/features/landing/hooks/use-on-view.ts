"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Ejecuta `callback` la primera vez que el elemento entra al viewport
 * (threshold 0.35, como el onView del HTML). Sin IntersectionObserver
 * dispara de inmediato.
 */
export function useOnViewOnce<T extends HTMLElement>(
  ref: RefObject<T | null>,
  callback: () => void,
) {
  const firedRef = useRef(false);
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const el = ref.current;
    if (!el || firedRef.current) return;
    if (typeof IntersectionObserver === "undefined") {
      firedRef.current = true;
      cbRef.current();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !firedRef.current) {
          firedRef.current = true;
          observer.disconnect();
          cbRef.current();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

/**
 * Versión continua de useOnViewOnce: dispara `onEnter`/`onLeave` cada vez
 * que el elemento cruza el umbral (0.35). Sin IntersectionObserver no
 * dispara nada (se asume siempre visible).
 */
export function useOnView<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { onEnter, onLeave }: { onEnter?: () => void; onLeave?: () => void },
) {
  const cbsRef = useRef({ onEnter, onLeave });
  useEffect(() => {
    cbsRef.current = { onEnter, onLeave };
  }, [onEnter, onLeave]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting) cbsRef.current.onEnter?.();
        else cbsRef.current.onLeave?.();
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
