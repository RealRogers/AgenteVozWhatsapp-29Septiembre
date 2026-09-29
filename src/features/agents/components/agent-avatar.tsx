import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Curated photoreal avatar gallery. Each preset is an AI-generated portrait
// (no real person) bundled under /public/avatars — no upload / no Storage.
// `avatar_key` in the DB points here. If an image fails to load, the Avatar
// falls back to the agent's initial over a per-preset gradient.

export interface AvatarPreset {
  key: string;
  label: string;
  /** Path under /public. */
  src: string;
  /** Fallback gradient + initial color while/if the image is unavailable. */
  fallbackGradient: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    key: "setter",
    label: "Vendedor",
    src: "/avatars/setter.jpg",
    fallbackGradient: "from-lime-400 to-emerald-600",
  },
  {
    key: "soporte",
    label: "Soporte",
    src: "/avatars/soporte.jpg",
    fallbackGradient: "from-sky-400 to-blue-600",
  },
  {
    key: "agendamiento",
    label: "Agenda",
    src: "/avatars/agendamiento.jpg",
    fallbackGradient: "from-violet-400 to-fuchsia-600",
  },
  {
    key: "ana",
    label: "Ana",
    src: "/avatars/ana.jpg",
    fallbackGradient: "from-amber-400 to-orange-600",
  },
  {
    key: "valeria",
    label: "Valeria",
    src: "/avatars/valeria.jpg",
    fallbackGradient: "from-pink-400 to-rose-600",
  },
  {
    key: "mateo",
    label: "Mateo",
    src: "/avatars/mateo.jpg",
    fallbackGradient: "from-teal-400 to-cyan-600",
  },
];

const BY_KEY: Record<string, AvatarPreset> = Object.fromEntries(
  AVATAR_PRESETS.map((p) => [p.key, p]),
);

export function getAvatarPreset(avatarKey: string): AvatarPreset {
  return BY_KEY[avatarKey] ?? AVATAR_PRESETS[0];
}

export function AgentAvatar({
  avatarKey,
  name,
  className,
}: {
  avatarKey: string;
  /** Used for the alt text and the initial in the fallback. */
  name?: string;
  className?: string;
}) {
  const preset = getAvatarPreset(avatarKey);
  const initial = (name ?? preset.label).trim().charAt(0).toUpperCase();
  return (
    <Avatar className={cn("ring-1 ring-border/60", className)}>
      <AvatarImage
        src={preset.src}
        alt={name ? `Foto de ${name}` : preset.label}
        className="object-cover"
      />
      <AvatarFallback
        className={cn(
          "bg-gradient-to-br font-display font-semibold text-white",
          preset.fallbackGradient,
        )}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
