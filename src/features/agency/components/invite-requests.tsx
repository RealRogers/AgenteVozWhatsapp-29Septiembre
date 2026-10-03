"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Copy, Inbox, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { InviteRequest } from "../services/invite-requests";
import type { WorkspaceWithStats } from "../types";

interface Props {
  workspaces: WorkspaceWithStats[];
}

const ROLES = ["viewer", "agent", "manager", "admin"] as const;
type Role = (typeof ROLES)[number];

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

/**
 * Pending access requests from the public /api/invite-request intake.
 * Approving reuses the workspace team invite: the super admin is an admin
 * member of every workspace they created, so the same endpoint provisions
 * the account and returns shareable credentials.
 */
export function InviteRequestsCard({ workspaces }: Props) {
  const [requests, setRequests] = useState<InviteRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [approving, setApproving] = useState<InviteRequest | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/invite-requests");
      if (!res.ok) throw new Error("Error al cargar solicitudes");
      const json = (await res.json()) as { requests: InviteRequest[] };
      setRequests(json.requests ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    fetchRequests();
  }, [fetchRequests]);

  const pending = (requests ?? []).filter((r) => r.status === "pending");

  async function patchRequest(id: string, status: "approved" | "dismissed") {
    const res = await fetch("/api/agency/invite-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? "No se pudo actualizar la solicitud");
    }
  }

  async function handleDismiss(r: InviteRequest) {
    try {
      await patchRequest(r.id, "dismissed");
      setRequests((rs) =>
        (rs ?? []).map((x) => (x.id === r.id ? { ...x, status: "dismissed" } : x)),
      );
      toast.success("Solicitud descartada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function openApprove(r: InviteRequest) {
    setApproving(r);
    setWorkspaceId(workspaces[0]?.id ?? "");
    setRole("agent");
    setCredentials(null);
    setCopied(false);
  }

  function closeApprove() {
    setApproving(null);
    setCredentials(null);
  }

  async function handleApprove() {
    if (!approving || !workspaceId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: approving.email, role }),
      });
      const json = (await res.json()) as {
        error?: string;
        credentials?: { email: string; password: string } | null;
      };
      if (!res.ok) throw new Error(json.error ?? "Error al crear el usuario");

      await patchRequest(approving.id, "approved");
      setRequests((rs) =>
        (rs ?? []).map((x) =>
          x.id === approving.id ? { ...x, status: "approved" } : x,
        ),
      );
      if (json.credentials) {
        setCredentials(json.credentials);
      } else {
        toast.success(`${approving.email} agregado al workspace`);
        closeApprove();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    if (!credentials) return;
    navigator.clipboard.writeText(
      `Email: ${credentials.email}\nContraseña: ${credentials.password}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Render nothing at all when there's nothing to review — the card is a
  // task queue, not decoration.
  if (!error && pending.length === 0 && requests !== null) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-foreground">
            Solicitudes de acceso
          </h2>
        </div>
        {pending.length > 0 && (
          <Badge className="bg-primary/15 text-primary border-primary/30">
            {pending.length} pendiente{pending.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {requests === null && !error && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      )}

      <ul className="divide-y divide-border">
        {pending.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {r.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {r.email}
                </span>
              </p>
              {r.note && (
                <p className="text-xs text-muted-foreground truncate">
                  {r.note}
                </p>
              )}
              <p className="text-xs text-muted-foreground/70">
                {formatDate(r.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => openApprove(r)}
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                aria-label={`Descartar solicitud de ${r.name}`}
                onClick={() => handleDismiss(r)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={approving !== null}
        onOpenChange={(o) => {
          if (!o) closeApprove();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar solicitud</DialogTitle>
            <DialogDescription>
              {approving?.name} ({approving?.email}) quedará como miembro del
              workspace elegido.
            </DialogDescription>
          </DialogHeader>

          {credentials ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">
                Cuenta creada — comparte estas credenciales
              </p>
              <p className="text-xs text-muted-foreground">
                No se vuelven a mostrar.
              </p>
              <div className="space-y-1 font-mono text-xs mt-1">
                <p className="text-foreground break-all">
                  <span className="text-muted-foreground">Email: </span>
                  {credentials.email}
                </p>
                <p className="text-foreground break-all">
                  <span className="text-muted-foreground">Contraseña: </span>
                  {credentials.password}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 gap-1.5"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                Copiar credenciales
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="ir-workspace"
                  className="text-xs font-medium text-foreground/70"
                >
                  Workspace
                </label>
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger id="ir-workspace" className="w-full">
                    <SelectValue placeholder="Elige un workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="ir-role"
                  className="text-xs font-medium text-foreground/70"
                >
                  Rol
                </label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as Role)}
                >
                  <SelectTrigger id="ir-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            {credentials ? (
              <Button onClick={closeApprove}>Cerrar</Button>
            ) : (
              <Button onClick={handleApprove} disabled={saving || !workspaceId}>
                {saving ? "Creando…" : "Crear cuenta y agregar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
