"use client";

import * as React from "react";
import { Pencil, Check, MessageSquare, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { saveFeedback, getFeedback, clearFeedback } from "@/app/ui/actions";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

export function FeedbackButton({
  section,
  hasAgentation = false,
}: {
  section: string;
  hasAgentation?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [agentation, setAgentation] = React.useState("");
  const [state, setState] = React.useState<SaveState>("idle");

  async function handleSave() {
    if (!feedback.trim()) return;
    setState("saving");
    try {
      await saveFeedback(section, feedback, agentation);
      setState("saved");
      setTimeout(() => {
        setOpen(false);
        setFeedback("");
        setAgentation("");
        setState("idle");
      }, 1500);
    } catch {
      setState("error");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Dar feedback sobre ${section}`}
        className="text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-100"
      >
        <Pencil className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="mt-3 w-full max-w-lg rounded-md border border-border bg-card p-3 animate-in fade-in slide-in-from-top-1 duration-200">
      <Textarea
        autoFocus
        rows={3}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="¿Qué cambiarías en esta sección?"
        className="resize-none"
      />
      {hasAgentation && (
        <div className="mt-2 space-y-1">
          <Label className="text-xs text-muted-foreground">
            Anotaciones Agentation (opcional)
          </Label>
          <Textarea
            rows={2}
            value={agentation}
            onChange={(e) => setAgentation(e.target.value)}
            placeholder="Pega aquí las anotaciones de Agentation..."
            className="resize-none font-mono text-xs"
          />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={state === "saving" || state === "saved"}
        >
          {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
          {state === "saved" && <Check className="h-4 w-4" />}
          {state === "saved" ? "Guardado en UI_FEEDBACK.md" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        {state === "error" && (
          <span className="text-sm text-destructive">
            Error al guardar.{" "}
            <button type="button" onClick={handleSave} className="underline">
              Reintentar
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

export function GlobalFeedbackButton() {
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      setContent(await getFeedback());
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!window.confirm("¿Seguro? Esto borra todo el feedback guardado."))
      return;
    await clearFeedback();
    await load();
  }

  return (
    <Sheet onOpenChange={(o) => o && load()}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-4 right-4 z-40 shadow-lg"
          size="sm"
          variant="secondary"
        >
          <MessageSquare className="h-4 w-4" />
          Ver feedback
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Feedback guardado</SheetTitle>
          <SheetDescription>
            Corre <code className="font-mono text-primary">/add-ui-kit</code> en
            Claude Code para incorporar estos cambios.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-auto rounded-md border border-border bg-muted/40 p-3">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : content.trim() ? (
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {content}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aún no hay feedback. Usa el ícono ✏️ junto a cada sección.
            </p>
          )}
        </div>
        <Button variant="destructive" size="sm" onClick={handleClear}>
          <Trash2 className="h-4 w-4" />
          Limpiar todo el feedback
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export function HowToPanel({
  hasAgentation = false,
}: {
  hasAgentation?: boolean;
}) {
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    const saved = window.localStorage.getItem("ui-kit-howto");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "closed") setOpen(false);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem("ui-kit-howto", next ? "open" : "closed");
  };

  return (
    <div className="glass mb-8 rounded-lg p-5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-display text-lg font-semibold">
          Cómo mejorar el UI Kit
        </span>
        <span className="text-sm text-muted-foreground">
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>
            Este showcase es la fuente de verdad visual del proyecto. Los
            agentes de Claude Code leen esta página antes de crear cualquier
            componente.
          </p>
          {hasAgentation ? (
            <>
              <p className="font-medium text-foreground">
                Opción A — Feedback de texto:
              </p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>Clic en ✏️ junto al título de la sección.</li>
                <li>Describe el cambio.</li>
                <li>Guarda → se escribe en UI_FEEDBACK.md.</li>
              </ol>
              <p className="font-medium text-foreground">
                Opción B — Anotaciones visuales con Agentation (recomendado):
              </p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>
                  Activa la barra de Agentation (esquina inferior izquierda).
                </li>
                <li>Clic sobre el componente exacto que quieres cambiar.</li>
                <li>
                  Copia la anotación generada y pégala en el campo
                  &quot;Anotaciones Agentation&quot;.
                </li>
                <li>Guarda → contexto visual preciso en UI_FEEDBACK.md.</li>
              </ol>
            </>
          ) : (
            <>
              <ol className="ml-4 list-decimal space-y-1">
                <li>Encuentra algo que quieras cambiar.</li>
                <li>Clic en el ícono ✏️ junto al título de esa sección.</li>
                <li>Describe el cambio con precisión.</li>
                <li>Guarda → se escribe en UI_FEEDBACK.md.</li>
                <li>Vuelve a Claude Code y corre /add-ui-kit.</li>
              </ol>
              <p>
                ¿Quieres marcar directamente sobre los componentes? Instala
                Agentation con{" "}
                <code className="font-mono text-primary">/agentation</code>.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
