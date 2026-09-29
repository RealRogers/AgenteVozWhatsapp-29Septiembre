"use client";

import { cn } from "@/lib/utils";
import { AVATAR_PRESETS, AgentAvatar } from "./agent-avatar";

export function AvatarGalleryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-6 gap-3"
      role="radiogroup"
      aria-label="Galería de avatares"
    >
      {AVATAR_PRESETS.map((p) => {
        const isSelected = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            role="radio"
            aria-checked={isSelected}
            aria-label={p.label}
            className={cn(
              "aspect-square rounded-full p-0.5 ring-2 transition-colors duration-150",
              isSelected
                ? "ring-primary"
                : "ring-transparent hover:ring-border",
            )}
          >
            <AgentAvatar avatarKey={p.key} className="h-full w-full" />
          </button>
        );
      })}
    </div>
  );
}
