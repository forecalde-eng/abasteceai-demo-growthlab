import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient, useMocks } from "./supabase";
import { useSession, type Session } from "./useSession";
import type {
  Order,
  Product,
  Location,
  Incident,
  Replenishment,
  FiltroPedidos,
  FiltroIncidencias,
  FiltroEnvios,
  DetallePedido,
  EnvioDetalle,
  AnalysisResult,
  AiProposal,
} from "./models";
import type { Inventory, Purchase, PurchaseItem } from "@/mocks";
import { ErrorApi } from "./backend";

/** Paginación explícita: no truncar los resultados al máximo de PostgREST. */
export async function readPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await page(from, from + 499);
    if (error) throw error;
    if (!data) throw new Error("Supabase no devolvió datos verificables");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
function useRead<T>(
  resource: string,
  filter: unknown,
  read: (s: Session) => Promise<T>,
  enabled = true,
) {
  const { data: session, isLoading, isError } = useSession();
  return useQuery<T>({
    queryKey: [
      "abastece",
      resource,
      useMocks ? "mock" : "real",
      session?.staff_id ?? null,
      session?.role ?? null,
      session?.points.map((p) => p.id) ?? [],
      filter,
    ],
    enabled: enabled && !!session && !isLoading && !isError,
    retry: false,
    queryFn: async () => {
      if (!session)
        throw new ErrorApi(401, "UNAUTHORIZED", "Sesión operativa requerida");
      return read(session);
    },
  });
}
function scoped<T extends { location_id: string }>(
  rows: T[],
  session: Session,
) {
  const ids = new Set(session.points.map((p) => p.id));
  return rows.filter((r) => ids.has(r.location_id));
}
export async function fetchOrders(
  filter: FiltroPedidos = {},
): Promise<Order[]> {
  return (await readPages((from, to) => {
    let q = getSupabaseClient()
      .from("orders")
      .select("*")
      .order("code", { ascending: false });
    if (filter.locationId) q = q.eq("location_id", filter.locationId);
    if (filter.cycleMonth) q = q.eq("cycle_month", filter.cycleMonth);
    return q.range(from, to);
  })) as Order[];
}
export function useOrders(filter: FiltroPedidos = {}) {
  return useRead("orders", filter, async (s) => {
    if (!useMocks) return fetchOrders(filter);
    const { mockOrders } = await import("./mock-state");
    return scoped(mockOrders, s)
      .filter(
        (o) =>
          (!filter.locationId || o.location_id === filter.locationId) &&
          (!filter.cycleMonth || o.cycle_month === filter.cycleMonth),
      )
      .sort((a, b) => b.code.localeCompare(a.code));
  });
}
export function useProducts() {
  return useRead("products", null, async () =>
    useMocks
      ? (await import("@/mocks")).products
      : ((await readPages((from, to) =>
          getSupabaseClient()
            .from("products")
            .select("*")
            .order("sku")
            .range(from, to),
        )) as Product[]),
  );
}
/** Compras de bodega sin costos: la vista oficial solo entrega cantidades. */
export type PurchaseItemWithoutCosts = Pick<
  PurchaseItem,
  "id" | "purchase_id" | "product_id" | "ordered_qty"
>;
export type PurchaseWithoutCosts = Purchase & {
  items: PurchaseItemWithoutCosts[];
};
export async function fetchInventory(locationCode: string): Promise<Inventory[]> {
  const db = getSupabaseClient();
  const { data: location, error } = await db
    .from("locations")
    .select("id")
    .eq("code", locationCode)
    .maybeSingle();
  if (error) throw error;
  if (!location) return [];
  return (await readPages((from, to) =>
    db
      .from("v_inventory")
      .select("*")
      .eq("location_id", location.id)
      .order("product_id")
      .range(from, to),
  )) as Inventory[];
}
export function useInventory(locationCode: string) {
  return useRead("inventory", locationCode, async () => {
    if (useMocks) {
      const [{ inventory }, { locations }] = await Promise.all([
        import("@/mocks/inventory"),
        import("@/mocks"),
      ]);
      const location = locations.find((row) => row.code === locationCode);
      return location
        ? inventory.filter((row) => row.location_id === location.id)
        : [];
    }
    return fetchInventory(locationCode);
  });
}
export function usePurchases() {
  return useRead("purchases", null, async (s) => {
    if (useMocks) {
      const [{ purchases }, { purchaseItems }] = await Promise.all([
        import("@/mocks/purchases"),
        import("@/mocks/purchaseItems"),
      ]);
      return purchases.map((purchase) => ({
        ...purchase,
        items: purchaseItems
          .filter((item) => item.purchase_id === purchase.id)
          .map(({ id, purchase_id, product_id, ordered_qty }) => ({
            id,
            purchase_id,
            product_id,
            ordered_qty,
          })),
      }));
    }
    const db = getSupabaseClient();
    // La vista de bodega oculta los costos; el resto de roles lee su tabla por RLS.
    const items =
      s.role === "bodega"
        ? ((await readPages((from, to) =>
            db
              .from("v_warehouse_purchase_items")
              .select("id,purchase_id,product_id,ordered_qty")
              .order("id")
              .range(from, to),
          )) as unknown as PurchaseItemWithoutCosts[])
        : ((await readPages((from, to) =>
            db
              .from("purchase_order_items")
              .select("id,purchase_id,product_id,ordered_qty")
              .order("id")
              .range(from, to),
          )) as unknown as PurchaseItemWithoutCosts[]);
    const purchases = (await readPages((from, to) =>
      db.from("purchase_orders").select("*").order("code").range(from, to),
    )) as unknown as Purchase[];
    return purchases.map((purchase) => ({
      ...purchase,
      items: items.filter((item) => item.purchase_id === purchase.id),
    }));
  });
}
export function useLocations(scope: "asignados" | "todos" = "asignados") {
  return useRead("locations", scope, async (s) => {
    if (useMocks) {
      const { locations } = await import("@/mocks");
      const ids = new Set(s.points.map((p) => p.id));
      return locations.filter((l) => ids.has(l.id));
    }
    // "todos" significa todos los visibles bajo RLS, nunca omitir la autorización.
    return (await readPages((from, to) =>
      getSupabaseClient()
        .from("locations")
        .select("*")
        .order("code")
        .range(from, to),
    )) as Location[];
  });
}
export async function fetchOrder(id: string): Promise<DetallePedido | null> {
  const db = getSupabaseClient();
  const { data: order, error } = await db
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const items = await readPages((from, to) =>
    db
      .from("order_items")
      .select("*, product:products(*)")
      .eq("order_id", id)
      .order("id")
      .range(from, to),
  );
  if (items.some((i) => !i.product))
    throw new Error("Producto no visible o inexistente en una línea");
  return { order: order as Order, items: items as DetallePedido["items"] };
}
export function useOrder(id: string | undefined) {
  return useRead(
    "order",
    id ?? null,
    async (s) => {
      if (!useMocks) return fetchOrder(id!);
      const { mockOrders, mockItems } = await import("./mock-state");
      const { products } = await import("@/mocks");
      const order = scoped(mockOrders, s).find((o) => o.id === id);
      if (!order) return null;
      const items = mockItems
        .filter((i) => i.order_id === id)
        .map((i) => ({
          ...i,
          product: products.find((p) => p.id === i.product_id)!,
        }));
      return { order, items };
    },
    !!id,
  );
}
export async function fetchIncidents(
  filter: FiltroIncidencias = {},
): Promise<Incident[]> {
  return (await readPages((from, to) => {
    let q = getSupabaseClient()
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id");
    if (filter.orderId) q = q.eq("order_id", filter.orderId);
    if (filter.locationId) q = q.eq("location_id", filter.locationId);
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.kind) q = q.eq("kind", filter.kind);
    return q.range(from, to);
  })) as Incident[];
}
export function useIncidents(filter: FiltroIncidencias = {}) {
  return useRead("incidents", filter, async (s) => {
    if (!useMocks) return fetchIncidents(filter);
    const { mockIncidents } = await import("./mock-state");
    return scoped(mockIncidents, s).filter(
      (i) =>
        (!filter.orderId || i.order_id === filter.orderId) &&
        (!filter.locationId || i.location_id === filter.locationId) &&
        (!filter.status || i.status === filter.status) &&
        (!filter.kind || i.kind === filter.kind),
    );
  });
}
export async function fetchAnalysis(
  id: string,
): Promise<AnalysisResult | null> {
  const db = getSupabaseClient();
  const { data: order, error } = await db
    .from("orders")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const logs = await readPages((from, to) =>
    db
      .from("decision_logs")
      .select("*")
      .eq("order_id", id)
      .in("task", ["detect_rules", "classify_notes"])
      .order("analysis_sequence", { ascending: false })
      .range(from, to),
  );
  const rule = logs.find(
    (l) => l.provider === "rules" && l.task === "detect_rules",
  );
  const ai = logs.find(
    (l) =>
      ["mock", "typesafe", "openai"].includes(l.provider) &&
      l.task === "classify_notes",
  );
  // La clasificación precargada de 001 no es un análisis determinista completo.
  // null permite que la pantalla solicite el análisis real una sola vez.
  if (order.status === "submitted" && (!rule || !ai)) return null;
  let proposal: AiProposal | null = null;
  if (ai) {
    const response = ai.response as {
      model?: string;
      answers?: Record<string, unknown>;
    };
    if (ai.status !== "proposed" && ai.status !== "human_review")
      throw new Error("Estado de propuesta incompatible con C3");
    proposal = {
      source: ai.provider === "mock" ? "SIMULADO" : "API_REAL",
      model: response.model ?? ai.model_version,
      status: ai.status,
      answers: response.answers ?? {},
      decision_log_id: ai.id,
    };
  }
  if (order.status !== "submitted")
    return {
      order_id: id,
      duplicates: [],
      missing_kit: [],
      incidents: [],
      proposal,
    };
  const response = rule!.response as {
    duplicates: AnalysisResult["duplicates"];
    missing_kit: AnalysisResult["missing_kit"];
  };
  if (
    !Array.isArray(response.duplicates) ||
    !Array.isArray(response.missing_kit)
  )
    throw new Error("Log de reglas incompleto");
  const incidents = (await fetchIncidents({ orderId: id }))
    .filter(
      (i) =>
        i.status !== "resolved" &&
        ((i.kind === "possible_duplicate" && response.duplicates.length > 0) ||
          (i.kind === "missing_from_kit" && response.missing_kit.length > 0)),
    )
    .map((i) => ({
      id: i.id,
      code: i.code,
      kind: i.kind as "possible_duplicate" | "missing_from_kit",
    }));
  return {
    order_id: id,
    duplicates: response.duplicates,
    missing_kit: response.missing_kit,
    incidents,
    proposal,
  };
}
export function useAnalysis(id: string | undefined) {
  return useRead(
    "analysis",
    id ?? null,
    async (s) => {
      if (!useMocks) return fetchAnalysis(id!);
      const { mockAnalyses, mockOrders } = await import("./mock-state");
      if (!scoped(mockOrders, s).some((o) => o.id === id)) return null;
      return mockAnalyses.get(id!) ?? null;
    },
    !!id,
  );
}
export async function fetchShipments(
  filter: FiltroEnvios = {},
): Promise<EnvioDetalle[]> {
  const rows = await readPages((from, to) => {
    let q = getSupabaseClient()
      .from("shipments")
      .select(
        "*, order:orders!shipments_order_id_location_id_fkey(*, location:locations!orders_location_id_fkey(*)), items:shipment_items!shipment_items_shipment_id_order_id_fkey(*)",
      )
      .order("code", { ascending: false });
    if (filter.locationId) q = q.eq("location_id", filter.locationId);
    if (filter.orderId) q = q.eq("order_id", filter.orderId);
    if (filter.status) q = q.eq("status", filter.status);
    return q.range(from, to);
  });
  return rows.map((row) => {
    if (!row.order?.location || !Array.isArray(row.items))
      throw new Error("Pedido o punto del envío no visible");
    const { location, ...order } = row.order;
    return { ...row, order, location } as EnvioDetalle;
  });
}
export function useShipments(filter: FiltroEnvios = {}) {
  return useRead("shipments", filter, async (s) => {
    if (!useMocks) return fetchShipments(filter);
    const { mockShipments, mockOrders } = await import("./mock-state");
    const { locations, shipmentItems } = await import("@/mocks");
    return scoped(mockShipments, s)
      .filter(
        (i) =>
          (!filter.locationId || i.location_id === filter.locationId) &&
          (!filter.orderId || i.order_id === filter.orderId) &&
          (!filter.status || i.status === filter.status),
      )
      .map((i) => ({
        ...i,
        order: mockOrders.find((o) => o.id === i.order_id)!,
        location: locations.find((l) => l.id === i.location_id)!,
        items: shipmentItems.filter((line) => line.shipment_id === i.id),
      }));
  });
}
export function useReplenishment(city?: string) {
  return useRead("replenishment", city ?? null, async (s) => {
    if (useMocks) {
      const { replenishment, locations } = await import("@/mocks");
      return scoped(replenishment, s).filter(
        (r) =>
          !city ||
          locations.some((l) => l.id === r.location_id && l.city === city),
      );
    }
    let ids: string[] | undefined;
    if (city)
      ids = (
        await readPages((from, to) =>
          getSupabaseClient()
            .from("locations")
            .select("id")
            .eq("city", city)
            .order("id")
            .range(from, to),
        )
      ).map((l) => l.id);
    if (ids?.length === 0) return [];
    return (await readPages((from, to) => {
      let q = getSupabaseClient()
        .from("v_replenishment")
        .select("*")
        .order("location_id")
        .order("product_id");
      if (ids) q = q.in("location_id", ids);
      return q.range(from, to);
    })) as Replenishment[];
  });
}
export function useDemoMetadata() {
  return useRead("metadata", null, async () => {
    if (useMocks) return (await import("@/mocks")).demoMetadata[0];
    const { data, error } = await getSupabaseClient()
      .from("demo_metadata")
      .select("reference_at")
      .single();
    if (error) throw error;
    return data;
  });
}
export function cycleMonth(referenceAt: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(referenceAt));
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-01`;
}
export async function refreshOperationalData(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["abastece"] }),
    client.invalidateQueries({ queryKey: ["demo"] }),
    client.invalidateQueries({ queryKey: ["bruno"] }),
  ]);
}
