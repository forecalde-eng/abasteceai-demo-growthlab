import type { ReactNode } from "react";

import { Badge, EmptyState } from "@/ui";

/**
 * Marcador de posición para rutas que ya existen y ya están protegidas por rol,
 * pero cuya pantalla todavía no está construida (J-0.4).
 *
 * Cuando alguien implemente la pantalla, se sustituye el elemento en
 * `src/app/navigation.tsx` por el componente real y este marcador deja de usarse.
 */
export function Placeholder({
  title,
  task,
  owner,
  desc,
}: {
  title: string;
  task: string;
  owner: string;
  desc: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{task}</Badge>
        <Badge variant="outline">la hace {owner}</Badge>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{desc}</p>
      <EmptyState
        className="mt-6"
        title="Pantalla en construcción"
        description="Esta ruta ya existe y ya está protegida por rol. Solo falta su contenido."
      />
    </div>
  );
}
