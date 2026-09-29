"use client";

import { MessageSquare, Link as LinkIcon, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TemplateButton,
  TemplateVariable,
} from "@/features/settings/lib/template-form";

// Live WhatsApp bubble preview. Intentionally keeps WhatsApp's real chat colors
// (not the app's Glass + Lime tokens) so it reads as a faithful phone mockup.

interface Props {
  businessName: string;
  headerType: "none" | "text";
  headerText: string;
  bodyText: string;
  footerText: string;
  buttons: TemplateButton[];
  variables: TemplateVariable[];
}

function resolve(text: string, variables: TemplateVariable[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const v = variables.find((vv) => vv.index === Number(n));
    return v?.example ? v.example : `[${n}]`;
  });
}

export function WhatsAppPreview({
  businessName,
  headerType,
  headerText,
  bodyText,
  footerText,
  buttons,
  variables,
}: Props) {
  const resolvedBody = resolve(bodyText, variables);
  const resolvedHeader = resolve(headerText, variables);

  return (
    <div className="sticky top-0">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Vista previa
      </p>

      {/* Phone / chat mockup — WhatsApp colors on purpose */}
      <div className="overflow-hidden rounded-2xl border border-border bg-[#ECE5DD]">
        {/* Header bar */}
        <div className="flex items-center gap-2 bg-[#075E54] px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <MessageSquare className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-white">
              {businessName || "Tu negocio"}
            </p>
            <p className="text-[11px] text-white/70">en línea</p>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex min-h-[260px] flex-col items-start p-4">
          <div className="max-w-[85%] overflow-hidden rounded-lg rounded-tl-none bg-white shadow-sm">
            {/* Header */}
            {headerType === "text" && headerText && (
              <div className="px-3 pt-2.5">
                <p className="text-sm font-semibold text-[#111B21]">
                  {resolvedHeader}
                </p>
              </div>
            )}

            {/* Body */}
            <div className="px-3 py-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#111B21]">
                {resolvedBody || (
                  <span className="italic text-[#667781]">
                    El mensaje aparecerá aquí…
                  </span>
                )}
              </p>
            </div>

            {/* Footer */}
            {footerText && (
              <div className="px-3 pb-1.5">
                <p className="text-[11px] text-[#667781]">{footerText}</p>
              </div>
            )}

            {/* Timestamp */}
            <div className="flex justify-end px-3 pb-2">
              <span className="text-[11px] text-[#667781]">12:00 ✓✓</span>
            </div>

            {/* Buttons */}
            {buttons.length > 0 && (
              <div className="border-t border-[#E9EDEF]">
                {buttons.map((btn, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 text-center text-sm font-medium text-[#00A5F4]",
                      i > 0 && "border-t border-[#E9EDEF]",
                    )}
                  >
                    {btn.type === "url" && (
                      <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {btn.type === "phone" && (
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {btn.text || "Botón"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
