import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useSession } from "@/data";
import { ErrorState, LoadingState } from "@/ui";

/**
 * Guarda de **sesión** (J-0.3): sin sesión, manda a `/login`.
 *
 * Con `VITE_USE_MOCKS=true`, `useSession()` de `@/data` devuelve siempre una sesión
 * simulada (por rol), así que el login real solo actúa en modo real (Supabase Auth).
 *
 * Ojo: esto es usabilidad, **no** seguridad. Quien protege los datos de verdad es la
 * base (RLS + JWT, invariante I8); la UI solo decide a dónde llevar al usuario.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useSession();

  if (isLoading) return <LoadingState label="Comprobando tu sesión." />;
  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState
          title="No se pudo comprobar tu sesión"
          description="Revisa la conexión con Supabase y recarga la página."
        />
      </div>
    );
  }
  if (!data) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
