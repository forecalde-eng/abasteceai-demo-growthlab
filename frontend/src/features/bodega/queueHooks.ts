import type { UseQueryResult } from "@tanstack/react-query";

import { useSession, useOrders as useDataOrders, useIncidents as useDataIncidents, useLocations as useDataLocations, type FiltroPedidos, type FiltroIncidencias } from "@/data";

// Lecturas de la cola de bodega desde la capa de datos (mocks o Supabase según VITE_USE_MOCKS).
// Solo se controla el rol aquí; la visibilidad real la aplica RLS en la base.
function useQueueQuery<T>(query: UseQueryResult<T, Error>) {
  const session = useSession();
  const allowed = session.data?.role === "bodega";
  const gateError = session.isError || (!session.isLoading && !session.data)
    ? new Error("No se pudo cargar tu perfil operativo.")
    : !session.isLoading && !allowed
      ? new Error("No tienes acceso a la cola de bodega.")
      : null;
  return {
    ...query,
    data: allowed && !gateError ? query.data : undefined,
    isLoading: session.isLoading || (!gateError && query.isLoading),
    isError: !!gateError || query.isError,
    error: gateError ?? query.error,
  };
}

export function useOrders(filter?: FiltroPedidos) {
  return useQueueQuery(useDataOrders(filter));
}

export function useIncidents(filter?: FiltroIncidencias) {
  return useQueueQuery(useDataIncidents(filter));
}

export function useLocations(scope: "asignados" | "todos") {
  return useQueueQuery(useDataLocations(scope));
}
