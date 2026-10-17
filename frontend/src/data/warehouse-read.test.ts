import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { inventory, locations, purchases, purchaseItems } from "@/mocks";
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
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const warehouse = locations.find((l) => l.code === "BOD-DEMO")!;
const warehouseInventory = inventory.filter(
  (row) => row.location_id === warehouse.id,
);
const itemsWithoutCosts = purchaseItems.map(
  ({ id, purchase_id, product_id, ordered_qty }) => ({
    id,
    purchase_id,
    product_id,
    ordered_qty,
  }),
);
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCKS", "false");
  vi.stubEnv("VITE_SUPABASE_URL", "https://local-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_solo_prueba");
  state.session = getMockSession("bodega");
  calls = [];
  route = () => [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url);
      expect(new Headers(init?.headers).get("Accept-Profile")).toBe("abastece");
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

describe("inventario de bodega real (#B-1.2)", () => {
  it("resuelve el código del punto y lee v_inventory filtrado por location_id", async () => {
    route = (u) =>
      u.pathname.endsWith("locations")
        ? [{ id: warehouse.id }]
        : warehouseInventory;
    const rows = await query<unknown[]>(
      data.useInventory("BOD-DEMO"),
    ).queryFn();
    expect(rows).toHaveLength(warehouseInventory.length);
    expect(calls[0].pathname.endsWith("locations")).toBe(true);
    expect(calls[0].searchParams.get("code")).toBe("eq.BOD-DEMO");
    expect(calls[1].pathname.endsWith("v_inventory")).toBe(true);
    expect(calls[1].searchParams.get("location_id")).toBe(`eq.${warehouse.id}`);
  });

  it("un código de punto inexistente no inventa saldos ni consulta la vista", async () => {
    route = () => [];
    expect(await query(data.useInventory("NO-EXISTE")).queryFn()).toEqual([]);
    expect(calls.some((u) => u.pathname.endsWith("v_inventory"))).toBe(false);
  });

  it("el costo nunca sale a bodega: usa la vista oficial, no purchase_order_items", async () => {
    route = (u) =>
      u.pathname.endsWith("purchase_orders") ? purchases : itemsWithoutCosts;
    const rows = await query<import("./read").PurchaseWithoutCosts[]>(
      data.usePurchases(),
    ).queryFn();
    const line = rows.flatMap((p) => p.items)[0];
    expect(line).toBeDefined();
    expect(Object.keys(line)).toEqual([
      "id",
      "purchase_id",
      "product_id",
      "ordered_qty",
    ]);
    expect(calls.some((u) => u.pathname.endsWith("v_warehouse_purchase_items"))).toBe(
      true,
    );
    expect(calls.some((u) => u.pathname.endsWith("purchase_order_items"))).toBe(
      false,
    );
  });

  it.each(["administrador", "gerencia"] as const)(
    "%s lee las líneas de compra por RLS, sin la vista de bodega",
    async (role) => {
      state.session = getMockSession(role);
      route = (u) =>
        u.pathname.endsWith("purchase_orders") ? purchases : purchaseItems;
      const rows = await query<import("./read").PurchaseWithoutCosts[]>(
        data.usePurchases(),
      ).queryFn();
      expect(rows[0].items.length).toBeGreaterThan(0);
      expect(calls.some((u) => u.pathname.endsWith("purchase_order_items"))).toBe(
        true,
      );
      expect(
        calls.some((u) => u.pathname.endsWith("v_warehouse_purchase_items")),
      ).toBe(false);
    },
  );

  it("en mocks filtra por código y no toca la red", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_USE_MOCKS", "true");
    const mockData = await import("./read");
    const rows = await query<unknown[]>(
      mockData.useInventory("BOD-DEMO"),
    ).queryFn();
    expect(rows).toHaveLength(warehouseInventory.length);
    expect(fetch).not.toHaveBeenCalled();
  });
});
