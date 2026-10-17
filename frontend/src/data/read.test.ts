import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Session as AuthSession } from "@supabase/supabase-js";
import {
  orders,
  orderItems,
  products,
  incidents,
  decisionLogs,
  locations,
  shipments,
} from "@/mocks";
import { getMockSession } from "./session.mock";
const state = vi.hoisted(() => ({
  session: null as import("./useSession").Session | null,
}));
vi.mock("./useSession", () => ({
  useSession: () => ({ data: state.session, isLoading: false, isError: false }),
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: vi.fn((options) => options),
}));

type Options<T> = {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: () => Promise<T>;
};
const query = <T>(value: unknown) => value as Options<T>;
let sdk: typeof import("./supabase"), data: typeof import("./read");
let calls: URL[];
let route: (url: URL) => unknown;
const order = orders.find((o) => o.code === "PED-DEMO-001")!;
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCKS", "false");
  vi.stubEnv("VITE_SUPABASE_URL", "https://local-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_solo_prueba");
  state.session = getMockSession("administrador");
  calls = [];
  route = () => [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url);
      expect(new Headers(init?.headers).get("Accept-Profile")).toBe("abastece");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer jwt-ficticio-local",
      );
      return response(route(url));
    }),
  );
  sdk = await import("./supabase");
  vi.spyOn(sdk.getSupabaseClient().auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "jwt-ficticio-local" } as AuthSession },
    error: null,
  });
  data = await import("./read");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("C2 lecturas reales y aislamiento", () => {
  it("usa SELECT con esquema/JWT y filtros, sin escrituras ni truncar 703 ubicaciones", async () => {
    route = (u) =>
      u.pathname.endsWith("locations")
        ? Array.from(
            { length: u.searchParams.get("offset") === "0" ? 500 : 203 },
            (_, i) => ({
              ...locations[0],
              id: String(Number(u.searchParams.get("offset")) + i),
            }),
          )
        : [];
    const q = query<unknown[]>(data.useLocations("todos"));
    expect(q.enabled).toBe(true);
    expect(await q.queryFn()).toHaveLength(703);
    expect(calls.map((u) => u.searchParams.get("offset"))).toEqual([
      "0",
      "500",
    ]);
    expect(calls.every((u) => u.searchParams.get("order") === "code.asc")).toBe(
      true,
    );
  });
  it("conserva filtros de pedidos y devuelve los códigos reales", async () => {
    route = () => [order];
    const rows = await data.fetchOrders({
      locationId: order.location_id,
      cycleMonth: order.cycle_month,
    });
    expect(rows[0].code).toBe("PED-DEMO-001");
    expect(calls[0].searchParams.get("location_id")).toBe(
      `eq.${order.location_id}`,
    );
    expect(calls[0].searchParams.get("cycle_month")).toBe("eq.2026-10-01");
  });
  it("detalle resuelve productos usando la FK existente", async () => {
    route = (u) =>
      u.pathname.endsWith("/orders")
        ? [order]
        : orderItems
            .filter((i) => i.order_id === order.id)
            .map((i) => ({
              ...i,
              product: products.find((p) => p.id === i.product_id),
            }));
    const row = await data.fetchOrder(order.id);
    expect(row?.items).toHaveLength(16);
    expect(
      row?.items.find((i) => i.product.sku === "INS-005")?.requested_qty,
    ).toBe(3);
  });
  it("una lectura rechazada por RLS no cae silenciosamente a fixtures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({ code: "42501", message: "Sin acceso RLS" }, 403),
      ),
    );
    await expect(data.fetchOrders()).rejects.toMatchObject({ code: "42501" });
  });
  it("sin sesión, sin pedido o al cambiar de rol/puntos no reutiliza una caché ajena", async () => {
    const admin = query(data.useOrders());
    state.session = getMockSession("auxiliar");
    const auxiliary = query(data.useOrders());
    expect(admin.queryKey).not.toEqual(auxiliary.queryKey);
    state.session = { ...state.session, points: [] };
    expect(query(data.useOrders()).queryKey).not.toEqual(auxiliary.queryKey);
    state.session = null;
    const none = query(data.useOrders());
    expect(none.enabled).toBe(false);
    await expect(none.queryFn()).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
    expect(query(data.useOrder(undefined)).enabled).toBe(false);
  });
  it("incidencias transmite todos los filtros al servidor", async () => {
    route = () => incidents;
    await data.fetchIncidents({
      orderId: order.id,
      locationId: order.location_id,
      status: "under_review",
      kind: "possible_duplicate",
    });
    expect(calls[0].searchParams.get("status")).toBe("eq.under_review");
    expect(calls[0].searchParams.get("kind")).toBe("eq.possible_duplicate");
  });
  it("la clasificación precargada sin reglas devuelve null para solicitar análisis completo", async () => {
    route = (u) =>
      u.pathname.endsWith("orders") ? [{ status: "submitted" }] : decisionLogs;
    expect(await data.fetchAnalysis(order.id)).toBeNull();
  });
  it.each(["mock", "typesafe", "openai"])(
    "reconstruye AnalysisResult desde logs separados, proveedor %s e incidencias abiertas",
    async (provider) => {
      route = (u) =>
        u.pathname.endsWith("orders")
          ? [{ status: "submitted" }]
          : u.pathname.endsWith("incidents")
            ? incidents.filter((i) => i.order_id === order.id)
            : [
                {
                  ...decisionLogs[0],
                  id: "ia-real-persistida",
                  provider,
                  task: "classify_notes",
                  status: "human_review",
                  response: { error: "timeout" },
                },
                {
                  ...decisionLogs[0],
                  id: "reglas-reales",
                  provider: "rules",
                  task: "detect_rules",
                  response: {
                    duplicates: [
                      { order_id: "otro", order_code: "PED-DEMO-025" },
                    ],
                    missing_kit: [],
                  },
                },
              ];
      const r = await data.fetchAnalysis(order.id);
      expect(r?.duplicates[0].order_code).toBe("PED-DEMO-025");
      expect(r?.proposal?.decision_log_id).toBe("ia-real-persistida");
      expect(r?.proposal?.source).toBe(
        provider === "mock" ? "SIMULADO" : "API_REAL",
      );
      expect(r?.proposal?.answers).toEqual({});
      expect(r?.proposal?.status).toBe("human_review");
      expect(
        calls
          .find((u) => u.pathname.endsWith("decision_logs"))
          ?.searchParams.get("order"),
      ).toBe("analysis_sequence.desc");
    },
  );
  it("fuera de submitted devuelve arreglos vacíos y proposal null sin inventar IA", async () => {
    route = (u) =>
      u.pathname.endsWith("orders") ? [{ status: "approved" }] : [];
    expect(await data.fetchAnalysis(order.id)).toEqual({
      order_id: order.id,
      duplicates: [],
      missing_kit: [],
      incidents: [],
      proposal: null,
    });
    expect(calls.some((u) => u.pathname.endsWith("incidents"))).toBe(false);
  });
  it("envíos resuelve punto a través del pedido, sin inventar FK directa a locations", async () => {
    route = () => [
      {
        ...shipments[0],
        order: { ...order, location: locations[0] },
        items: [],
      },
    ];
    const r = await data.fetchShipments({
      status: "dispatched",
      orderId: order.id,
    });
    expect(r[0].location.code).toBe(locations[0].code);
    expect(calls[0].searchParams.get("select")).toContain(
      "orders!shipments_order_id_location_id_fkey",
    );
    expect(calls[0].searchParams.get("select")).not.toContain(
      "shipments_location_id_fkey",
    );
  });
  it("tablero devuelve valores SQL sin recalcular cobertura ni recomendados", async () => {
    const row = {
      location_id: order.location_id,
      sku: "INS-005",
      recommended_qty: 77.123,
      coverage_days: 4.567,
      coverage_status: "attention",
    };
    route = (u) =>
      u.pathname.endsWith("locations") ? [{ id: order.location_id }] : [row];
    expect(
      await query<unknown[]>(data.useReplenishment("Quito")).queryFn(),
    ).toEqual([row]);
    expect(calls.at(-1)?.searchParams.get("location_id")).toBe(
      `in.(${order.location_id})`,
    );
  });
  it("usa el mes del reloj de demo en Ecuador, incluso en el borde UTC del mes", () => {
    expect(data.cycleMonth("2026-11-01T02:00:00Z")).toBe("2026-10-01");
  });
});
