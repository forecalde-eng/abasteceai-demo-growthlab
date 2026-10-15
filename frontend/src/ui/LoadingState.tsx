import { Loader2Icon } from "lucide-react";

import { cn } from "@/ui/lib/utils";

/** Estado de carga. Anuncia a lectores de pantalla con aria-live. */
export function LoadingState({
  label = "Cargando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground",
        className,
      )}
    >
      <Loader2Icon className="size-5 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
