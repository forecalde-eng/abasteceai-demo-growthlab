import type { ReactNode } from "react";

import { Badge, EmptyState, PageHeader } from "@/ui";

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
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        title={title}
        description={desc}
        actions={
          <>
            <Badge variant="secondary">{task}</Badge>
            <Badge variant="outline">la hace {owner}</Badge>
          </>
        }
      />
      <EmptyState
        title="Pantalla en construcción"
        description="Esta ruta ya existe y ya está protegida por rol. Solo falta su contenido."
      />
    </div>
  );
}
