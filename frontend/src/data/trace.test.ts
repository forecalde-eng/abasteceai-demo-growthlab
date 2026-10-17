import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { orderTrace } from "@/mocks";
import { getMockSession } from "./session.mock";
import { QueryClient } from "@tanstack/react-query";
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
type Options = {
  queryFn: () => Promise<typeof orderTrace>;
  queryKey: unknown[];
  enabled: boolean;
};
let layer: typeof import("./trace"), calls: URL[];
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCKS", "false");
  vi.stubEnv("VITE_SUPABASE_URL", "https://local-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_solo_prueba");
  state.session = getMockSession("administrador");
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url);
      expect(new Headers(init?.headers).get("Accept-Profile")).toBe("abastece");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer jwt-local-ficticio",
      );
      return new Response(
        JSON.stringify(
          orderTrace.filter(
            (row) =>
              `eq.${row.order_code}` === url.searchParams.get("order_code"),
          ),
        ),
        { status: 200 },
      );
    }),
  );
  const { getSupabaseClient } = await import("./supabase");
  vi.spyOn(getSupabaseClient().auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "jwt-local-ficticio" } as AuthSession },
    error: null,
  });
  layer = await import("./trace");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const options = (v: unknown) => v as Options;
describe("C2 useOrderTrace", () => {
  it.each(["preparación", "despacho", "recepción"])(
    "la invalidación existente de %s refresca una trazabilidad ya cacheada",
    async () => {
      const client = new QueryClient({
        defaultOptions: { queries: { staleTime: 30000, retry: false } },
      });
      const query = options(layer.useOrderTrace("PED-DEMO-005"));
      client.setQueryData(query.queryKey, [
        { ...orderTrace[0], shipped_qty: 0 },
      ]);
      expect(client.getQueryState(query.queryKey)?.isInvalidated).toBe(false);
      // Prefijos usados actualmente por las tres pantallas de escritura de Bruno.
      await client.invalidateQueries({ queryKey: ["demo"] });
      await client.invalidateQueries({ queryKey: ["bruno"] });
      expect(client.getQueryState(query.queryKey)?.isInvalidated).toBe(true);
      const fresh = await client.fetchQuery({
        queryKey: query.queryKey,
        queryFn: query.queryFn,
      });
      expect(fresh.find((row) => row.sku === "INS-002")?.shipped_qty).toBe(10);
      client.clear();
    },
  );
  it("lee la vista real por código sin recalcular las seis cantidades", async () => {
    const rows = await options(layer.useOrderTrace(" PED-DEMO-005 ")).queryFn();
    const ins = rows.find((r) => r.sku === "INS-002")!;
    expect(ins).toMatchObject({
      shipped_qty: 10,
      counted_qty: 8,
      accepted_qty: 8,
      shortage_qty: 2,
    });
    expect(calls[0].pathname).toBe("/rest/v1/v_order_trace");
    expect(calls[0].searchParams.get("order_code")).toBe("eq.PED-DEMO-005");
  });
  it("entrega sin conteo mantiene NULL y los UUID no sustituyen códigos", async () => {
    const rows = await layer.fetchOrderTrace("PED-DEMO-004");
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((r) => r.counted_qty === null && r.accepted_qty === null),
    ).toBe(true);
    expect(
      rows.every(
        (r) => r.order_code === "PED-DEMO-004" && r.sku.startsWith("INS-"),
      ),
    ).toBe(true);
  });
  it("consulta vacía o sin sesión no hace red", async () => {
    expect(options(layer.useOrderTrace("   ")).enabled).toBe(false);
    state.session = null;
    const q = options(layer.useOrderTrace("PED-DEMO-001"));
    expect(q.enabled).toBe(false);
    await expect(q.queryFn()).rejects.toThrow("perfil operativo");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("no usa una caché de otra cuenta, rol, puntos o código", () => {
    const a = options(layer.useOrderTrace("PED-DEMO-001")).queryKey;
    state.session = getMockSession("auxiliar");
    const b = options(layer.useOrderTrace("PED-DEMO-001")).queryKey;
    expect(a).not.toEqual(b);
    state.session = { ...state.session, points: [] };
    expect(options(layer.useOrderTrace("PED-DEMO-001")).queryKey).not.toEqual(
      b,
    );
    expect(options(layer.useOrderTrace("PED-DEMO-002")).queryKey).not.toEqual(
      b,
    );
  });
  it("un error RLS no se oculta con fixtures", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: "42501", message: "No visible" }), {
        status: 403,
      }),
    );
    await expect(layer.fetchOrderTrace("PED-DEMO-001")).rejects.toMatchObject({
      code: "42501",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("RLS sin filas devuelve lista vacía, no datos inventados", async () => {
    expect(await layer.fetchOrderTrace("PED-NO-VISIBLE")).toEqual([]);
  });
  it("paginación estable no pierde líneas al llegar al límite", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      const offset = Number(u.searchParams.get("offset"));
      return new Response(
        JSON.stringify(
          Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => ({
            ...orderTrace[0],
            order_item_id: String(offset + i),
          })),
        ),
      );
    });
    expect(await layer.fetchOrderTrace("PED-DEMO-001")).toHaveLength(501);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rechaza filas incompletas en lugar de llenar cantidades con ceros", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ ...orderTrace[0], prepared_qty: null }])),
    );
    await expect(layer.fetchOrderTrace("PED-DEMO-001")).rejects.toThrow(
      "incompleta",
    );
  });
  it("mock respeta asignaciones, conserva fixtures y no usa red", async () => {
    vi.stubEnv("VITE_USE_MOCKS", "true");
    vi.resetModules();
    layer = await import("./trace");
    state.session = getMockSession("auxiliar");
    expect(
      await options(layer.useOrderTrace("PED-DEMO-005")).queryFn(),
    ).toEqual(orderTrace.filter((r) => r.order_code === "PED-DEMO-005"));
    expect(
      await options(layer.useOrderTrace("PED-DEMO-004")).queryFn(),
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
