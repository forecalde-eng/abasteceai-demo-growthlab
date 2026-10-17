import type { UseQueryResult } from "@tanstack/react-query";

import { useMocks, useSession } from "@/data";
import {
  useOrders as useDemoOrders,
  useIncidents as useDemoIncidents,
  useLocations as useDemoLocations,
  type FiltroPedidos,
  type FiltroIncidencias,
} from "@/data";

// C2 comparte pedidos, cantidades e incidencias con las decisiones del administrador.
// No duplica pedidos ni inventa cambios sobre los CSV.
function useQueueQuery<T>(query: UseQueryResult<T, Error>) {
  const session = useSession();
  const allowed = session.data?.role === "bodega";
  const gateError = session.isError || (!session.isLoading && !session.data)
    ? new Error("No se pudo cargar tu perfil operativo.")
    : !session.isLoading && !allowed
      ? new Error("No tienes acceso a la cola de bodega.")
      : !useMocks
        ? new Error("La lectura real de la cola de bodega todavía no está disponible.")
        : null;
  return {
    ...query,
    data: allowed && useMocks && !gateError ? query.data : undefined,
    isLoading: session.isLoading || (!gateError && query.isLoading),
    isError: !!gateError || query.isError,
    error: gateError ?? query.error,
  };
}

// temporal: reemplazar por @/data
export function useOrders(filter?: FiltroPedidos) {
  return useQueueQuery(useDemoOrders(filter));
}

// temporal: reemplazar por @/data
export function useIncidents(filter?: FiltroIncidencias) {
  return useQueueQuery(useDemoIncidents(filter));
}

// temporal: reemplazar por @/data
export function useLocations(scope: "asignados" | "todos") {
  return useQueueQuery(useDemoLocations(scope));
}
