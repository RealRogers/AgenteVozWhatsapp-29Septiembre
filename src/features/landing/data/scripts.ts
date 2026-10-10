/**
 * Landing — datos y guiones de las conversaciones de demostración.
 * Port de los arrays del <script> de landing-agente-whatsapp.html a datos
 * tipados. Todos los helpers de este archivo son puros (testeables).
 */

export const VOICE_BAR_HEIGHTS = [
  30, 60, 45, 80, 50, 90, 40, 70, 55, 85, 35, 65, 50, 75, 45, 60, 30, 70, 55,
  40,
] as const;

export const VOICE_BAR_MS = 70;

export type ChatKind = "client" | "ia" | "human" | "system" | "day";

export interface ChatMessage {
  kind: ChatKind;
  text: string;
  /** Nombre sobre la burbuja (solo ia/human). */
  who?: string;
  /** Nota de voz: `text` es la duración "m:ss". */
  voice?: boolean;
  /** Mensaje system: se muestra "Transcribiendo…" antes del texto final. */
  transcribe?: boolean;
}

/** Evento de control del switch IA (no es una burbuja). */
export interface SwitchEvent {
  switch: "on" | "off";
}

export type ChatEvent = ChatMessage | SwitchEvent;

export function isSwitchEvent(e: ChatEvent): e is SwitchEvent {
  return "switch" in e;
}

/** "HH:MM" a minutos del día. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Sello "MM:SS" que corre un minuto por mensaje (fiel al contador `_min++`
 * del HTML: en la UI 10:42, 10:43… pasan por la animación, no es hora real).
 */
export function formatStamp(totalMinutes: number): string {
  const mm = String(Math.floor(totalMinutes % 60)).padStart(2, "0");
  const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Pausa antes de mostrar un mensaje del cliente (o voice note). */
export function clientDelay(msg: ChatMessage): number {
  if (msg.voice) return 300;
  return Math.min(1300, 450 + msg.text.length * 16);
}

/** Duración del indicador "escribiendo…" antes de mensajes ia/human. */
export function typingDelay(msg: ChatMessage): number {
  return Math.min(1800, 700 + msg.text.length * 14);
}

// ── Hero ────────────────────────────────────────────────────────────────────
// El reloj de la demo del hero arranca en 10:42 (642 min) y el del demo en
// 11:05 (665 min) igual que el HTML original.
export const HERO_START_MINUTES = 642;
export const DEMO_START_MINUTES = 665;

export const heroScript: ChatEvent[] = [
  { kind: "client", text: "Hola, ¿tienen cita para limpieza dental?" },
  {
    kind: "ia",
    who: "IA",
    text: "¡Hola! Sí. Tengo mañana a las 10:00 o a las 16:30. ¿Cuál te acomoda?",
  },
  { kind: "client", text: "Mejor a las 16:30" },
  {
    kind: "ia",
    who: "IA",
    text: "Listo, agendada para mañana 16:30. Te llegará un recordatorio.",
  },
  { kind: "client", text: "0:08", voice: true },
  {
    kind: "system",
    text: "Transcrito: “¿Aceptan pagos a meses?”",
    transcribe: true,
  },
  {
    kind: "ia",
    who: "IA",
    text: "Eso lo confirma una asesora. Te paso con ella ahora.",
  },
  { kind: "system", text: "IA pausada. Atiende una persona" },
  { switch: "off" },
  {
    kind: "human",
    who: "Mariana, equipo",
    text: "Hola, soy Mariana. Sí, manejamos pagos a 3 y 6 meses sin intereses.",
  },
];

// ── Demo interactiva ────────────────────────────────────────────────────────
export interface DemoPreset {
  question: string;
  script: ChatEvent[];
}

export const demoPresets: DemoPreset[] = [
  {
    question: "Quiero agendar una cita para mañana",
    script: [
      { kind: "client", text: "Quiero agendar una cita para mañana" },
      {
        kind: "ia",
        who: "IA",
        text: "Con gusto. Mañana tengo 10:00, 12:30 y 16:30. ¿Cuál prefieres?",
      },
      { kind: "client", text: "12:30" },
      {
        kind: "ia",
        who: "IA",
        text: "Agendado para mañana a las 12:30. Ya te guardé en el calendario.",
      },
      { kind: "system", text: "Lead guardado en GoHighLevel" },
    ],
  },
  {
    question: "Mandé una nota de voz con mi duda",
    script: [
      { kind: "client", text: "0:14", voice: true },
      {
        kind: "system",
        text: "Transcrito: “¿Hacen entregas los sábados y cuánto cuesta el envío?”",
        transcribe: true,
      },
      {
        kind: "ia",
        who: "IA",
        text: "Sí, entregamos los sábados de 9 a 14 h. El envío local cuesta $60.",
      },
    ],
  },
  {
    question: "Quiero hablar con una persona",
    script: [
      { kind: "client", text: "Quiero hablar con una persona" },
      { kind: "ia", who: "IA", text: "Claro. Aviso a mi equipo ahora mismo." },
      { kind: "system", text: "IA pausada. Conversación asignada a un asesor" },
      { switch: "off" },
      { kind: "human", who: "Sofía, equipo", text: "Hola, soy Sofía. ¿En qué te ayudo?" },
    ],
  },
];

// ── Agentes (tabs) ──────────────────────────────────────────────────────────
export interface AgentInfo {
  name: string;
  description: string;
  bullets: string[];
}

export const agents: AgentInfo[] = [
  {
    name: "Setter",
    description: "Califica a tus leads y los pasa listos a ventas.",
    bullets: [
      "Hace las preguntas clave",
      "Guarda los datos en el CRM",
      "Avisa a tu equipo cuando el lead está caliente",
    ],
  },
  {
    name: "Agendamiento",
    description: "Llena tu agenda sin ir y venir con horarios.",
    bullets: [
      "Ofrece horarios disponibles",
      "Agenda y confirma en GoHighLevel",
      "Manda recordatorios",
    ],
  },
  {
    name: "Servicio al cliente",
    description: "Resuelve dudas frecuentes y escala lo complejo.",
    bullets: [
      "Responde con la información de tu negocio",
      "Entiende notas de voz",
      "Deriva a una persona cuando hace falta",
    ],
  },
];

// ── Inbox interactivo ───────────────────────────────────────────────────────
export type Responder = "ia" | "human" | "pending";

export interface Conversation {
  name: string;
  time: string; // "HH:MM"
  unread: number;
  responder: Responder;
  messages: ChatMessage[];
  /**
   * Minuto de inicio del primer mensaje no-system; los siguientes corren
   * +1 min cada uno (equivalente a `ic._min = mins(t) - n + 1` del HTML).
   */
  startMinutes: number;
}

export const responderMeta: Record<Responder, { label: string; className: string }> = {
  ia: { label: "IA", className: "lx-badge" },
  human: { label: "Humano", className: "lx-badge lx-badge-h" },
  pending: { label: "Pendiente", className: "lx-badge lx-badge-p" },
};

export const switchLabel: Record<Responder, string> = {
  ia: "IA activa",
  human: "Humano al mando",
  pending: "Sin atender",
};

/** Último mensaje visible de la lista (ignora los system). */
export function lastMessagePreview(c: Conversation): string {
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const m = c.messages[i];
    if (m.kind !== "system") return m.voice ? `Nota de voz ${m.text}` : m.text;
  }
  return "";
}

/**
 * Convierte los mensajes de una conversación a mensajes renderizables
 * (id estable + sello "HH:MM" + voice notes encendidas), listo para
 * ChatFrame sin animación — el inbox muestra el historial completo.
 */
export function renderConversationMessages(c: Conversation) {
  let clock = c.startMinutes;
  return c.messages.map((m, i) => ({
    ...m,
    id: i,
    time:
      m.kind === "system" || m.kind === "day"
        ? undefined
        : formatStamp(clock++),
    voiceLit: m.voice ? VOICE_BAR_HEIGHTS.length : undefined,
  }));
}

/** Mensaje system que se añade al tocar el switch (fiel al HTML). */
export function switchResult(from: Responder): { to: Responder; notice: string } {
  if (from === "ia") return { to: "human", notice: "IA pausada. Tomaste el chat" };
  if (from === "human") return { to: "ia", notice: "IA reactivada" };
  return { to: "human", notice: "Tomaste el chat. IA pausada" };
}

/** Pausa entre la nota de handoff y el "escribiendo" del humano (ms). */
export const HUMAN_REPLY_START_MS = 700;

/** Respuesta que postea el humano cuando el visitante toma el chat. */
export const HUMAN_TAKEOVER_MESSAGE: ChatMessage = {
  kind: "human",
  who: "Tú",
  text: "Hola, ya te atiendo yo.",
};

export const conversations: Conversation[] = [
  {
    name: "Ana Torres",
    time: "10:42",
    unread: 0,
    responder: "ia",
    messages: [
      { kind: "client", text: "¿Tienen horario el sábado?" },
      {
        kind: "ia",
        who: "IA",
        text: "Sí, los sábados atendemos de 9:00 a 14:00. ¿Te agendo?",
      },
    ],
    startMinutes: 641,
  },
  {
    name: "Constructora Mora",
    time: "10:15",
    unread: 0,
    responder: "human",
    messages: [
      { kind: "client", text: "Necesito cotizar una bodega de 400 m²" },
      {
        kind: "ia",
        who: "IA",
        text: "Con gusto. Te paso con un asesor para la cotización.",
      },
      { kind: "system", text: "IA pausada. Atiende una persona" },
      {
        kind: "human",
        who: "Rodrigo, equipo",
        text: "Hola, soy Rodrigo. ¿Me compartes la ubicación del terreno?",
      },
    ],
    startMinutes: 613,
  },
  {
    name: "Luis P.",
    time: "09:58",
    unread: 0,
    responder: "ia",
    messages: [
      { kind: "client", text: "0:22", voice: true },
      { kind: "system", text: "Transcrito: “¿Cuánto tarda una limpieza?”" },
      {
        kind: "ia",
        who: "IA",
        text: "Unos 45 minutos. ¿Quieres que te agende?",
      },
    ],
    startMinutes: 597,
  },
  {
    name: "Carla R.",
    time: "09:40",
    unread: 1,
    responder: "pending",
    messages: [
      { kind: "client", text: "Quiero hablar con alguien" },
      { kind: "ia", who: "IA", text: "Claro, aviso a mi equipo ahora mismo." },
      { kind: "system", text: "Pendiente de que una persona tome el chat" },
    ],
    startMinutes: 579,
  },
];

// ── Secciones estáticas ─────────────────────────────────────────────────────
export const integrations = [
  "WhatsApp (YCloud)",
  "GoHighLevel",
  "OpenRouter",
  "Cal.com y Calendly",
];

export const problems = [
  {
    title: "Respuestas tardías",
    text: "El lead escribe y nadie contesta hasta mañana. Ya compró en otro lado.",
  },
  {
    title: "Noches y fines de semana",
    text: "Tu negocio duerme, pero tus clientes no.",
  },
  {
    title: "Citas que se pierden",
    text: "Ir y venir con horarios consume horas y deja huecos en la agenda.",
  },
  {
    title: "Equipo saturado",
    text: "Tus asesores contestan lo mismo todo el día en vez de cerrar ventas.",
  },
];

export const stats = [
  {
    value: "24/7",
    text: "de atención por WhatsApp, también de noche y en fines de semana.",
  },
  {
    value: "1 clic",
    text: "para apagar la IA y que una persona de tu equipo tome el chat.",
  },
  {
    value: "3 agentes",
    text: "listos para usar: setter, agendamiento y servicio al cliente.",
  },
];

export const steps = [
  {
    title: "Conecta tu número",
    text: "Vincula tu WhatsApp Business desde el panel. Cada cliente tiene su propio espacio.",
  },
  {
    title: "Configura tu agente",
    text: "Elige el tipo de agente, escribe tus instrucciones y carga la información de tu negocio.",
  },
  {
    title: "La IA atiende, tú supervisas",
    text: "Mira todo en el inbox y entra a cualquier chat cuando quieras.",
  },
];

export const features = [
  {
    title: "Inbox estilo WhatsApp Web",
    text: "Todas las conversaciones en una pantalla que tu equipo ya sabe usar.",
  },
  {
    title: "IA y humano en el mismo chat",
    text: "Enciende o apaga la IA y deriva a una persona en un clic.",
  },
  {
    title: "Buffer inteligente",
    text: "Espera y agrupa los mensajes sueltos del cliente para responder una sola vez y con contexto.",
  },
  {
    title: "Notas de voz",
    text: "El agente las transcribe, las entiende y responde.",
  },
  {
    title: "Agenda con GoHighLevel",
    text: "Agenda citas y guarda cada lead sin que nadie lo capture a mano.",
  },
  {
    title: "CRM básico y observabilidad",
    text: "Contactos, etapas y el consumo de tokens y llamadas por conversación.",
  },
  {
    title: "Multi-cliente",
    text: "Da de alta workspaces, cada uno con su número y su agente.",
  },
  {
    title: "Tu equipo, con permisos",
    text: "Invita asesores y define quién ve y responde qué.",
  },
];

export const industries = [
  "Clínicas y consultorios",
  "Inmobiliarias",
  "Constructoras",
  "E-commerce",
  "Escuelas y academias",
  "Restaurantes",
  "Salones y spas",
  "Servicios locales",
];

export interface Plan {
  name: string;
  price: string;
  period?: string;
  bullets: string[];
  cta: string;
  highlighted: boolean;
}

export const plans: Plan[] = [
  {
    name: "Inicio",
    price: "$49",
    period: " USD/mes",
    bullets: [
      "1 número de WhatsApp",
      "1 agente",
      "Hasta 1,000 conversaciones",
      "Inbox y handoff",
    ],
    cta: "Empezar",
    highlighted: false,
  },
  {
    name: "Crecimiento",
    price: "$149",
    period: " USD/mes",
    bullets: [
      "3 números",
      "Los 3 tipos de agente",
      "Hasta 5,000 conversaciones",
      "GoHighLevel y notas de voz",
      "Observabilidad",
    ],
    cta: "Probar gratis",
    highlighted: true,
  },
  {
    name: "Agencias",
    price: "A medida",
    bullets: [
      "Clientes y workspaces ilimitados",
      "Roles y equipo",
      "Soporte prioritario",
    ],
    cta: "Hablar con ventas",
    highlighted: false,
  },
];

export const testimonials = [
  {
    quote: "Dejamos de perder consultas de noche. Amanecemos con la agenda llena.",
    cite: "Reemplaza por un testimonio real. Clínica, Culiacán",
  },
  {
    quote:
      "Mi equipo solo entra cuando el cliente pide precio final. Lo demás lo resuelve la IA.",
    cite: "Reemplaza por un testimonio real. Inmobiliaria",
  },
  {
    quote: "Con las notas de voz ya no se nos escapa ningún cliente.",
    cite: "Reemplaza por un testimonio real. Tienda en línea",
  },
];

export const securityPoints = [
  {
    title: "Datos aislados por workspace",
    text: "Cada cliente ve solo su información, con autenticación y permisos por rol.",
  },
  {
    title: "Tú controlas a la IA",
    text: "Puedes apagarla en cualquier chat y revisar lo que respondió.",
  },
  {
    title: "Hecho para WhatsApp Business",
    text: "Funciona sobre la API oficial y respeta sus políticas de uso.",
  },
];

export const faqs = [
  {
    q: "¿Necesito la API de WhatsApp Business?",
    a: "Sí. Te guiamos para conectarla desde el panel con un proveedor oficial.",
  },
  {
    q: "¿Puedo apagar la IA cuando quiera?",
    a: "Sí. Lo haces por conversación con un solo clic y tu equipo toma el chat.",
  },
  {
    q: "¿Qué pasa si la IA no sabe responder?",
    a: "Puede derivar la conversación a una persona y avisarle a tu equipo.",
  },
  {
    q: "¿Cuánto tarda la configuración?",
    a: "Conectar el número y lanzar tu primer agente toma minutos. Afinar las instrucciones depende de tu negocio.",
  },
  {
    q: "¿Funciona con mi CRM y mi agenda?",
    a: "Se integra con GoHighLevel. También puede mandar enlaces de agenda de Cal.com o Calendly.",
  },
  {
    q: "¿Entiende notas de voz?",
    a: "Sí. Las transcribe y responde sobre lo que dijo el cliente.",
  },
];

export const industriesOptions = [
  "Clínica o salud",
  "Inmobiliaria",
  "E-commerce",
  "Servicios",
  "Agencia",
  "Otro",
];
