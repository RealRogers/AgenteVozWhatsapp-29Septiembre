/**
 * Component Showcase route — Visual source of truth for the project.
 * Every agent building UI MUST reference this page. Development only.
 */
import { ComponentShowcase } from "@/features/ui-kit/components/component-showcase";

export const metadata = {
  title: "UI Kit — Component Library",
  description: "Visual source of truth. Development only.",
};

export default function UIKitPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Not available in production.</p>
      </div>
    );
  }
  return <ComponentShowcase />;
}
