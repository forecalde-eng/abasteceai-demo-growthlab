import type { ReactNode } from "react";

import { cn } from "@/ui/lib/utils";

/**
 * Cabecera común de todas las pantallas — docs/07_GUIA_DISENO.md §7.
 *
 * Toda página empieza igual: icono del módulo, título, subtítulo en gris y,
 * a la derecha, la acción principal. **Máximo un botón primario por pantalla**;
 * el resto van `outline` o `ghost` (guía §7).
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Icono del módulo (lucide, `size-5`). */
  icon?: ReactNode;
  /** Acción principal a la derecha. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 text-primary [&_svg]:size-5" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
