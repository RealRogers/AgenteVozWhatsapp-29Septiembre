"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enterApp } from "@/features/workspace/services/actions";

// Agency header's "App" entry. A plain <Link href="/inbox"> bounced straight
// back to /workspaces for super admins with no active-workspace cookie (the
// inbox guard requires one), which looked like a dead button. This resolves a
// workspace — last-used via cookie, else the first membership — sets the
// cookie, then navigates. Client-side router.push mirrors handleEnter in
// WorkspacesTable: redirect() inside startTransition is unreliable on Next 16.
export function AppButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await enterApp();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.push("/inbox");
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
      className="text-muted-foreground hover:text-foreground"
    >
      <Settings className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only sm:ml-2">App</span>
    </Button>
  );
}
