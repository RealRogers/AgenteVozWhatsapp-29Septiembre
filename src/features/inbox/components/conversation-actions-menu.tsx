"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Flag,
  FlagOff,
  Loader2,
  MoreHorizontal,
  UserPlus,
  UserX,
  XCircle,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConversationWithContact } from "@/features/inbox/types";
import type { WorkspaceRole } from "@/features/inbox/hooks/use-role";

type Action =
  | "close"
  | "reopen"
  | "archive"
  | "unarchive"
  | "flag"
  | "unflag"
  | "assign"
  | "unassign";

const ACTION_TOASTS: Record<Action, string> = {
  close: "Conversación cerrada",
  reopen: "Conversación reabierta",
  archive: "Conversación archivada",
  unarchive: "Conversación desarchivada",
  flag: "Marcada como prioritaria",
  unflag: "Prioridad quitada",
  assign: "Conversación asignada",
  unassign: "Asignación quitada",
};

interface TeamMember {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

interface ConversationActionsMenuProps {
  conversation: ConversationWithContact;
  role: WorkspaceRole;
  currentUserId: string;
}

export function ConversationActionsMenu({
  conversation,
  role,
  currentUserId,
}: ConversationActionsMenuProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const isClosed = conversation.state === "closed";
  const isArchived = conversation.archived;
  const isFlagged = conversation.priority === "high";
  const canAssignOther = role === "admin" || role === "manager";
  const canOperate =
    canAssignOther || conversation.assigned_to === currentUserId;

  const runAction = async (action: Action, assigneeId?: string) => {
    if (busy) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, assigneeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          (data as { error?: string }).error ?? "Error al aplicar la acción",
        );
        return;
      }
      toast.success(ACTION_TOASTS[action]);
      router.refresh();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setBusy(null);
    }
  };

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(conversation.contact.phone);
      toast.success("Teléfono copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  // Loaded lazily the first time the assign submenu opens.
  const loadMembers = async () => {
    if (members !== null || loadingMembers) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/workspace/${conversation.workspace_id}/team`);
      if (!res.ok) return;
      const data = (await res.json()) as { members?: TeamMember[] };
      setMembers(
        (data.members ?? []).filter(
          (m) => m.is_active && m.role !== "viewer",
        ),
      );
    } finally {
      setLoadingMembers(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Acciones de la conversación"
          className="h-8 w-8"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => void copyPhone()}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar teléfono
        </DropdownMenuItem>

        {canSendActions(role) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Conversación
            </DropdownMenuLabel>

            {/* Priority toggle — mirrors the UPDATE policy */}
            {canOperate && (
              <DropdownMenuItem
                disabled={busy !== null}
                onClick={() => void runAction(isFlagged ? "unflag" : "flag")}
              >
                {isFlagged ? (
                  <FlagOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Flag className="h-4 w-4" aria-hidden="true" />
                )}
                {isFlagged ? "Quitar prioridad" : "Marcar prioridad"}
                {busy === "flag" || busy === "unflag" ? (
                  <Loader2
                    className="ml-auto h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : isFlagged ? null : null}
              </DropdownMenuItem>
            )}

            {/* Assign — self for agents, anyone for admin/manager */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger onClick={() => void loadMembers()}>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Asignar a…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {loadingMembers || members === null ? (
                  <DropdownMenuItem disabled>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Cargando equipo…
                  </DropdownMenuItem>
                ) : (
                  members.map((m) => {
                    const label =
                      m.full_name ?? m.email ?? "Miembro sin nombre";
                    const isSelf = m.user_id === currentUserId;
                    const isCurrent = conversation.assigned_to === m.user_id;
                    // Agents only see themselves in the picker; the server
                    // enforces the same rule.
                    if (isSelf === false && !canAssignOther) return null;
                    return (
                      <DropdownMenuItem
                        key={m.user_id}
                        disabled={busy !== null || isCurrent}
                        onClick={() =>
                          void runAction("assign", m.user_id)
                        }
                      >
                        {isCurrent ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <span className="w-4" aria-hidden="true" />
                        )}
                        <span className="truncate">
                          {label}
                          {isSelf ? " (tú)" : ""}
                        </span>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {canOperate && conversation.assigned_to && (
              <DropdownMenuItem
                disabled={busy !== null}
                onClick={() => void runAction("unassign")}
              >
                <UserX className="h-4 w-4" aria-hidden="true" />
                Quitar asignación
              </DropdownMenuItem>
            )}

            {canOperate && (
              <>
                <DropdownMenuSeparator />
                {isClosed ? (
                  <DropdownMenuItem
                    disabled={busy !== null}
                    onClick={() => void runAction("reopen")}
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    Reabrir conversación
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={busy !== null}
                    onClick={() => void runAction("close")}
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Cerrar conversación
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={busy !== null}
                  onClick={() =>
                    void runAction(isArchived ? "unarchive" : "archive")
                  }
                >
                  {isArchived ? (
                    <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Archive className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isArchived ? "Desarchivar" : "Archivar"}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Read-only roles get the menu only for "Copiar teléfono". */
function canSendActions(role: WorkspaceRole): boolean {
  return role !== "viewer";
}
