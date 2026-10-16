import { RouteIcon } from "lucide-react";

import { useSession } from "@/data";
import { useOrders, useLocations } from "@/app/dev/apiDemo";
import { ErrorState, LoadingState, PageHeader } from "@/ui";
import type { Order } from "@/mocks";
import { vehicles } from "@/mocks/vehicles";
// temporal: reemplazar por @/data
import { ConfirmarRuta, type RoutePlanProposal } from "./ConfirmarRuta";

/**
 * Pedidos `ready` de los puntos visibles. La propuesta (`POST /routes/plan`) aún no existe
 * en el backend, así que `proposal` llega vacía y la confirmación queda bloqueada con aviso.
 */
export function PlanRutas({ proposal = null }: { proposal?: RoutePlanProposal | null }) {
  const session = useSession();
  const orders = useOrders();
  const locations = useLocations("todos");
  const allowed = session.data?.role === "logistica";
  const readyOrders: Order[] = (orders.data ?? []).filter((order) => order.status === "ready");
  const loading = session.isLoading || orders.isLoading || locations.isLoading;
  const failed = session.isError || orders.isError || locations.isError;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader icon={<RouteIcon />} title="Plan de rutas" description="Confirma una ruta con sus pedidos listos. Km y minutos los calcula el planificador." />
      {loading ? <LoadingState label="Cargando pedidos listos…" /> : failed ? <ErrorState description="No se pudieron cargar los pedidos listos." onRetry={() => { void orders.refetch(); void locations.refetch(); }} /> : !allowed ? <ErrorState description="Necesitas una sesión de logística para confirmar rutas." /> : (
        <ConfirmarRuta key={session.data?.staff_id} readyOrders={readyOrders} locations={locations.data ?? []} vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, code: vehicle.code, description: vehicle.description, capacity_kg: vehicle.capacity_kg }))} proposal={proposal} />
      )}
    </div>
  );
}
