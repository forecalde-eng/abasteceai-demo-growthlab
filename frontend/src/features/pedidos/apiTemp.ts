/**
 * Hooks temporales con los nombres del contrato C2 (J-1.2 · Mis pedidos).
 *
 * // temporal: reemplazar por los hooks de `@/data` cuando David los entregue
 *
 * Los datos ya son los fixtures de Bruno (`@/mocks`, B-0.1). Falta solo la capa de hooks
 * real de David; mientras tanto los componentes usan estos, con la firma de C2. Los
 * componentes nunca llaman a Supabase ni a `fetch`.
 */
import { useQuery } from "@tanstack/react-query";

import { locations, orders } from "@/mocks";
import { usePuntosAsignados } from "@/features/pedidos/puntosTemp";

export type FiltroPedidos = {
  locationId?: string;
  cycleMonth?: string;
};

/** Latencia simulada, para que se vean los estados de carga. */
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pedidos de los puntos del usuario (contrato C2: `useOrders(filtro)`).
 * Como en `useSession()`, el rol manda: auxiliar/supervisor solo ven sus puntos asignados.
 */
export function useOrders(filtro?: FiltroPedidos) {
  const { locationIds } = usePuntosAsignados();

  return useQuery({
    queryKey: ["demo", "pedidos", locationIds, filtro?.locationId ?? null, filtro?.cycleMonth ?? null],
    staleTime: 0,
    queryFn: async () => {
      await esperar(200);
      return orders
        .filter((p) => locationIds.includes(p.location_id))
        .filter((p) => (filtro?.locationId ? p.location_id === filtro.locationId : true))
        .filter((p) => (filtro?.cycleMonth ? p.cycle_month === filtro.cycleMonth : true))
        .sort((a, b) => b.code.localeCompare(a.code));
    },
  });
}

/** Puntos visibles para el usuario (`useLocations(scope)` del contrato C2). */
export function useLocations(scope: "asignados" | "todos" = "asignados") {
  const { locationIds } = usePuntosAsignados();
  return useQuery({
    queryKey: ["demo", "locations", scope, locationIds],
    staleTime: Infinity,
    queryFn: async () => {
      await esperar(100);
      return scope === "todos" ? locations : locations.filter((l) => locationIds.includes(l.id));
    },
  });
}
