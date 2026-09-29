import type { AgentType } from "@/features/agents/types";

// Per-role metadata: labels, taglines, and prompt-writing guidance. Reused by
// the agent cards and the guided prompt editor (Fase 3).

export interface AgentTypeMeta {
  label: string;
  tagline: string;
  /** Bullet guidance shown in the guided prompt editor. */
  promptGuidance: string[];
}

export const AGENT_TYPE_META: Record<AgentType, AgentTypeMeta> = {
  setter: {
    label: "Setter",
    tagline: "Califica leads y agenda citas",
    promptGuidance: [
      "Define el objetivo: calificar y agendar.",
      "Lista las preguntas clave para calificar (presupuesto, urgencia, etc.).",
      "Indica cuándo escalar a un humano.",
      "Tono: amable, profesional y directo. Mensajes cortos.",
    ],
  },
  soporte: {
    label: "Soporte",
    tagline: "Resuelve dudas con precisión",
    promptGuidance: [
      "Describe los temas que el agente puede resolver.",
      "Define qué hacer cuando no sabe la respuesta (escalar).",
      "Aclara el tono: empático y claro.",
      "Recuérdale usar la base de conocimiento si existe.",
    ],
  },
  agendamiento: {
    label: "Agendamiento",
    tagline: "Reserva y confirma citas",
    promptGuidance: [
      "Explica cómo agenda (link o calendario directo).",
      "Qué datos pedir antes de reservar.",
      "Cómo confirmar y recordar la cita.",
      "Tono: eficiente y cordial.",
    ],
  },
};
