"use client";

import * as React from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "tablet" | "mobile";

const WIDTHS: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

const OPTIONS: { id: Viewport; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet · 768px", icon: Tablet },
  { id: "mobile", label: "Mobile · 375px", icon: Smartphone },
];

export function ViewportToggle({ children }: { children: React.ReactNode }) {
  const [viewport, setViewport] = React.useState<Viewport>("desktop");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const saved = window.localStorage.getItem(
      "ui-kit-viewport",
    ) as Viewport | null;
    if (saved && saved in WIDTHS) setViewport(saved);
  }, []);

  const select = (v: Viewport) => {
    setViewport(v);
    window.localStorage.setItem("ui-kit-viewport", v);
  };

  return (
    <div className="w-full">
      <div className="sticky top-0 z-30 flex w-full justify-center border-b border-border/60 bg-background/70 py-3 backdrop-blur-xl">
        <div className="glass inline-flex items-center gap-1 rounded-full p-1">
          {OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => select(id)}
              aria-label={`Ver en ${label}`}
              aria-pressed={viewport === id}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
                viewport === id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center px-4 py-8">
        <div
          className={cn(
            "w-full transition-all duration-[350ms] ease-out",
            viewport !== "desktop" &&
              "rounded-2xl shadow-2xl shadow-black/30 ring-1 ring-border",
          )}
          style={{
            maxWidth: mounted ? WIDTHS[viewport] : "100%",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
