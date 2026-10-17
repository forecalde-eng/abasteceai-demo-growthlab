import { useQuery } from "@tanstack/react-query";
import type { OrderTrace } from "@/mocks";
import { getSupabaseClient, useMocks } from "./supabase";
import { useSession } from "./useSession";

/** La vista SQL calcula cantidades y faltantes. Mantener NULL cuando no hubo conteo. */
export async function fetchOrderTrace(code: string): Promise<OrderTrace[]> {
  const rows: OrderTrace[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await getSupabaseClient()
      .from("v_order_trace")
      .select("*")
      .eq("order_code", code)
      .order("order_item_id")
      .range(from, from + 499);
    if (error) throw error;
    if (!data) throw new Error("Trazabilidad sin respuesta verificable");
    for (const row of data) {
      if (
        [
          row.order_code,
          row.location_id,
          row.status,
          row.order_item_id,
          row.sku,
          row.name,
        ].some((v) => typeof v !== "string") ||
        [row.requested_qty, row.prepared_qty, row.shipped_qty].some(
          (v) => typeof v !== "number" || !Number.isFinite(v),
        )
      ) {
        throw new Error("Fila de trazabilidad incompleta");
      }
      rows.push(row as OrderTrace);
    }
    if (data.length < 500) return rows;
  }
}

export function useOrderTrace(input: string) {
  const code = input.trim();
  const { data: session, isLoading, isError } = useSession();
  return useQuery<OrderTrace[]>({
    queryKey: [
      // Preparación, despacho y recepción invalidan este prefijo heredado.
      "bruno",
      "orderTrace",
      useMocks ? "mock" : "real",
      code,
      session?.staff_id ?? null,
      session?.role ?? null,
      session?.points.map((p) => p.id) ?? [],
    ],
    enabled: !!code && !!session && !isLoading && !isError,
    retry: false,
    queryFn: async () => {
      if (!session) throw new Error("Cuenta sin perfil operativo");
      if (!code) return [];
      if (!useMocks) return fetchOrderTrace(code);
      const { orderTrace } = await import("@/mocks/orderTrace");
      const ids = new Set(session.points.map((p) => p.id));
      return orderTrace.filter(
        (row) => row.order_code === code && ids.has(row.location_id),
      );
    },
  });
}
