import type * as React from "react";

import { cn } from "@/ui/lib/utils";

/**
 * Desplegable. Es un `<select>` **nativo** a propósito: un `Select` de shadcn traería
 * `@radix-ui/react-select` y la guía pide no instalar nada nuevo. Comparte el estilo con
 * `Input`, así que los campos se ven iguales.
 */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
