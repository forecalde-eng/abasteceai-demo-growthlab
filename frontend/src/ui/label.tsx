import type * as React from "react";

import { cn } from "@/ui/lib/utils";

/**
 * Etiqueta de un campo. Nativa (no usa `@radix-ui/react-label`): la guía pide no instalar
 * nada nuevo (docs/07_GUIA_DISENO.md, encabezado). Se asocia al campo con `htmlFor`/`id`.
 */
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm font-medium leading-none select-none",
        className,
      )}
      {...props}
    />
  );
}
