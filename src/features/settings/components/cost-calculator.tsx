"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Price table (Meta 2024 approximate, USD per template message) ─────────────

const PRICES: Record<string, Record<string, number>> = {
  marketing: {
    MX: 0.0125,
    PA: 0.0115,
    ES: 0.0162,
    CO: 0.011,
  },
  utility: {
    MX: 0.0063,
    PA: 0.0058,
    ES: 0.008,
    CO: 0.0055,
  },
  authentication: {
    MX: 0.0063,
    PA: 0.0058,
    ES: 0.008,
    CO: 0.0055,
  },
};

const COUNTRIES = [
  { value: "MX", label: "México" },
  { value: "PA", label: "Panamá" },
  { value: "ES", label: "España" },
  { value: "CO", label: "Colombia" },
] as const;

type CountryCode = (typeof COUNTRIES)[number]["value"];

// ── Formatter ─────────────────────────────────────────────────────────────────

function fmt(usd: number) {
  return usd.toLocaleString("es-MX", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

// ── Calculator content (separated so it only renders when dialog is open) ────

function CalculatorContent() {
  const [volume, setVolume] = useState(1000);
  const [type, setType] = useState<"marketing" | "utility">("utility");
  const [country, setCountry] = useState<CountryCode>("MX");

  const pricePerMsg = PRICES[type]?.[country] ?? 0.006;
  const monthlyCost = volume * pricePerMsg;

  return (
    <div className="space-y-6 pt-2">
      {/* Volume slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-foreground">
            Mensajes por mes
          </Label>
          <span className="font-mono text-sm font-bold text-foreground tabular-nums">
            {volume.toLocaleString("es-MX")}
          </span>
        </div>
        <input
          type="range"
          min={100}
          max={100000}
          step={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full h-1.5 rounded-full cursor-pointer accent-primary"
          aria-label="Mensajes por mes"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>100</span>
          <span>100,000</span>
        </div>
      </div>

      {/* Type select */}
      <div className="space-y-2">
        <Label
          htmlFor="calc-type"
          className="text-sm font-medium text-foreground"
        >
          Tipo de template
        </Label>
        <Select
          value={type}
          onValueChange={(v) => setType(v as "marketing" | "utility")}
        >
          <SelectTrigger id="calc-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="utility">Utilidad</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Country select */}
      <div className="space-y-2">
        <Label
          htmlFor="calc-country"
          className="text-sm font-medium text-foreground"
        >
          País destino
        </Label>
        <Select
          value={country}
          onValueChange={(v) => setCountry(v as CountryCode)}
        >
          <SelectTrigger id="calc-country">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Result */}
      <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Estimado mensual
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {volume.toLocaleString("es-MX")} msgs × {fmt(pricePerMsg)}
            </span>
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {fmt(monthlyCost)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Mensajes dentro de ventana 24h
            </span>
            <span className="font-mono font-semibold text-primary tabular-nums">
              Gratis
            </span>
          </div>
        </div>

        <div className="border-t border-border pt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-foreground">
            Total estimado/mes
          </span>
          <span className="font-mono text-xl font-extrabold text-foreground tabular-nums">
            {fmt(monthlyCost)}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Estimado · Precio Meta 2024 aproximado · Los costos reales varían por
          plan y volumen negociado.
        </p>
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function CostCalculator() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Calculator className="h-4 w-4 mr-2" aria-hidden="true" />
          Calculadora de costos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            Calculadora de costos WhatsApp
          </DialogTitle>
          <DialogDescription>
            Estima el costo mensual de tus envíos de templates basándote en
            volumen y tipo. Los mensajes dentro de la ventana de 24h son gratis.
          </DialogDescription>
        </DialogHeader>
        <CalculatorContent />
      </DialogContent>
    </Dialog>
  );
}
