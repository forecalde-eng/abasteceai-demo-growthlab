import { useQuery } from "@tanstack/react-query";

// temporal: reemplazar por @/data
import { useSession } from "@/data";
import type { OrderTrace } from "@/mocks";

// temporal: reemplazar por @/data
// Solo fixtures de v_order_trace. El alcance simulado no sustituye RLS ni JWT.
export function useOrderTrace(code: string) {
  const { data: session } = useSession();
  const pointIds = session?.points.map((point) => point.id) ?? [];
  const scoped = session?.role === "auxiliar" || session?.role === "supervisor";

  return useQuery<OrderTrace[]>({
    queryKey: ["bruno", "orderTrace", code, session?.staff_id, session?.role, pointIds],
    enabled: code.length > 0,
    queryFn: async () => {
      if (!session) throw new Error("Cuenta sin perfil operativo.");
      if (import.meta.env.VITE_USE_MOCKS === "false") {
        throw new Error("La lectura real de trazabilidad todavía no está disponible.");
      }
      const { orderTrace } = await import("@/mocks/orderTrace");
      return orderTrace.filter(
        (row) => row.order_code === code && (!scoped || pointIds.includes(row.location_id)),
      );
    },
    retry: false,
  });
}
