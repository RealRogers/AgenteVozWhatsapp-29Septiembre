"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConversationTagsDialogProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current tags, used to seed the editor when the dialog opens. */
  initialTags: string[];
}

const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 20;

export function ConversationTagsDialog({
  conversationId,
  open,
  onOpenChange,
  initialTags,
}: ConversationTagsDialogProps) {
  const router = useRouter();
  // The parent mounts this dialog only while it is open, so the seed
  // state initializes here — no effect needed.
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = draft.trim();
    if (!t) return;
    if (t.length > MAX_TAG_LENGTH) {
      toast.error(`La etiqueta no puede superar ${MAX_TAG_LENGTH} caracteres`);
      return;
    }
    if (tags.includes(t)) {
      setDraft("");
      return;
    }
    if (tags.length >= MAX_TAGS) {
      toast.error(`Máximo ${MAX_TAGS} etiquetas por conversación`);
      return;
    }
    setTags([...tags, t]);
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_tags", tags }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          (data as { error?: string }).error ?? "Error al guardar etiquetas",
        );
        return;
      }
      toast.success("Etiquetas actualizadas");
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Etiquetas de la conversación</DialogTitle>
          <DialogDescription>
            Agrega o quita etiquetas para organizar el inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-1 text-xs"
                >
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    aria-label={`Quitar etiqueta ${t}`}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sin etiquetas todavía.
            </p>
          )}

          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Nueva etiqueta…"
              maxLength={MAX_TAG_LENGTH}
              aria-label="Nueva etiqueta"
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addTag}
              disabled={draft.trim().length === 0}
              className="h-8 shrink-0"
            >
              Agregar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
