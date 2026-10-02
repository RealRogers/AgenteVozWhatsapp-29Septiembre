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
