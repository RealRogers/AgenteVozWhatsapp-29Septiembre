"use client";

import type { WorkspaceRole } from "../hooks/use-role";

interface RoleGateProps {
  role: WorkspaceRole;
  check: (role: WorkspaceRole) => boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGate({
  role,
  check,
  fallback = null,
  children,
}: RoleGateProps) {
  if (!check(role)) return <>{fallback}</>;
  return <>{children}</>;
}
