import { Link } from "react-router-dom";

import { ROLES, useSession } from "@/app/dev/session";
import { Button, EmptyState } from "@/ui";

/** Se muestra cuando el rol de la sesión no tiene permiso para la ruta (lo decide `RequireRole`). */
export function SinAcceso() {
  const { data } = useSession();
  const rol = data ? ROLES[data.role].label : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <EmptyState
        title="No tienes acceso a esta pantalla"
        description={
          rol ? (
            <>
              Tu rol actual es <strong>{rol}</strong>. El menú solo muestra las pantallas de tu rol.
            </>
          ) : (
            "El menú solo muestra las pantallas de tu rol."
          )
        }
        action={
          <Button asChild>
            <Link to="/">Volver al inicio</Link>
          </Button>
        }
      />
    </div>
  );
}

/** Ruta desconocida (`*`). */
export function NoEncontrada() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <EmptyState
        title="Esta ruta no existe"
        description="Revisa el enlace o vuelve al inicio."
        action={
          <Button asChild>
            <Link to="/">Volver al inicio</Link>
          </Button>
        }
      />
    </div>
  );
}
