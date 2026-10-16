import type * as React from "react";

import { cn } from "@/ui/lib/utils";

/**
 * Campo de texto del kit (docs/07_GUIA_DISENO.md §7, formularios).
 *
 * Es un `<input>` nativo **a propósito**: no agrega dependencias. Usa los tokens del tema
 * (`--input`, `--ring`, `--destructive`), así que no escribe colores sueltos.
 */
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
