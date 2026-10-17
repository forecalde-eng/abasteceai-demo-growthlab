import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createOrder, markDelivered } from "./api";
import { mockOrders, mockShipments } from "./mock-state";
import { getMockSession } from "./session.mock";
import { refreshOperationalData } from "./read";
import { shipments, orders, products } from "@/mocks";
vi.mock("./supabase", () => ({
  useMocks: true,
  getSupabaseClient: () => {
    throw Error("No debe usar Supabase en mock");
  },
  hasSupabaseConfig: () => false,
}));
afterEach(() => vi.unstubAllGlobals());
describe("D-1.4 consumidores de operación", () => {
  it.each([
    "app/pages/CrearPedido.tsx",
    "app/pages/MisPedidos.tsx",
    "app/pages/EnviosSupervisor.tsx",
    "features/tablero/Tablero.tsx",
    "features/incidencias/Incidencias.tsx",
  ])("%s usa C2 sin clientes ni fetch directo", (file) => {
    const text = fs.readFileSync(
      new URL(`../${file}`, import.meta.url),
      "utf8",
    );
    expect(text).toContain('from "@/data"');
    expect(text).not.toMatch(/from ["']@\/app\/dev\//);
    expect(text).not.toMatch(/\bfetch\s*\(|getSupabaseClient\s*\(|\.from\s*\(/);
  });
  it("nuevo pedido aparece en el almacén que leen MisPedidos/useOrders", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "auxiliar" });
    vi.stubGlobal("fetch", vi.fn());
    const s = getMockSession("auxiliar"),
      source = orders.find((o) => o.code === "PED-DEMO-001")!;
    expect(s.points.some((p) => p.id === source.location_id)).toBe(true);
    const result = await createOrder({
      location_id: source.location_id,
      cycle_month: "2026-10-01",
      order_type: "regular",
      idempotency_key: "operacion-create",
      items: [{ product_id: products[0].id, requested_qty: 1 }],
    });
    expect(mockOrders.find((o) => o.id === result.id)?.code).toBe(result.code);
    expect(result.code).toMatch(/^PED-DEMO-\d+$/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supervisor marca una entrega y repetir no duplica efectos ni cambia fixtures", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "supervisor" });
    vi.stubGlobal("fetch", vi.fn());
    const source = shipments.find((s) => s.code === "ENV-DEMO-008")!;
    const first = await markDelivered(source.id),
      second = await markDelivered(source.id);
    expect(first).toEqual(second);
    expect(first.status).toBe("delivered_unchecked");
    expect(mockShipments.find((s) => s.id === source.id)?.status).toBe(
      "delivered_unchecked",
    );
    expect(shipments.find((s) => s.id === source.id)?.status).toBe(
      "dispatched",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("invalidar después de escribir cubre datos reales, trazabilidad y adaptadores temporales", async () => {
    const client = new QueryClient();
    for (const key of [
      ["abastece", "orders"],
      ["abastece", "orderTrace"],
      ["abastece", "replenishment"],
      ["demo", "pedidos"],
      ["bruno", "orderTrace"],
    ])
      client.setQueryData(key, []);
    await refreshOperationalData(client);
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((q) => q.state.isInvalidated),
    ).toBe(true);
    client.clear();
  });
  it("el formulario toma el mes del reloj real y nunca usa el MES_DEMO temporal", () => {
    const source = fs.readFileSync(
      new URL("../app/pages/CrearPedido.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("useDemoMetadata()");
    expect(source).toContain("cycleMonth(metadataQ.data.reference_at)");
    expect(source).not.toContain("MES_DEMO");
  });
});
