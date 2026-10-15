import type { ReactNode } from "react";

import { useSession, type Role } from "@/app/dev/session";
import { SinAcceso } from "@/app/pages/SinAcceso";
import { LoadingState } from "@/ui";

/**
 * Guarda de rol (J-0.4). Deja pasar solo si el rol de la sesión está en `roles`.
 *
 * Ojo: esto es usabilidad, **no** seguridad. Quien protege los datos de verdad es la
 * base (RLS + JWT, invariante I8); la UI solo evita enseñar pantallas que no tocan.
 */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { data, isLoading } = useSession();

  if (isLoading) return <LoadingState label="Comprobando tu rol…" />;
  if (!data || !roles.includes(data.role)) return <SinAcceso />;

  return <>{children}</>;
}
